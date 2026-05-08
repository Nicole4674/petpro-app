// =============================================================================
// auto-mark-no-shows — Auto-flip stale appointments to no_show status
// =============================================================================
// Runs hourly via pg_cron. For each shop, when it's 6 AM in their LOCAL
// timezone, finds yesterday's appointments that were never checked in and
// flips them to status='no_show'.
//
// Why not just charge the fee too? Per Nicole's spec — auto-marking handles
// the bookkeeping (gets stale appts off the outstanding balance) but charging
// the no-show fee stays MANUAL. The groomer decides if the situation warrants
// a fee. Lots of times it's a forgotten check-in (the dog DID show), not a
// real no-show.
//
// FLOW:
//   1. Pull all shops (no opt-in toggle — this is universal helpful behavior)
//   2. For each shop:
//      a. Compute current hour in shop's local timezone (waitlist_timezone)
//      b. If hour !== 6 (AM), skip — not this shop's run yet
//   3. For matching shops, find appointments where:
//      - appointment_date <= yesterday (in shop's local TZ)
//      - checked_in_at IS NULL
//      - checked_out_at IS NULL
//      - status in ('scheduled', 'confirmed', 'unconfirmed', 'pending')
//   4. Bulk-update each → status='no_show', last_action='auto_no_show',
//      append note to service_notes for audit trail
//   5. Does NOT call stripe-charge-no-show-fee — fee stays manual
//   6. Returns counts per shop for monitoring
//
// SCHEDULING:
//   In Supabase Dashboard → Database → Extensions → enable pg_cron + pg_net.
//   Then in SQL Editor:
//     select cron.schedule(
//       'auto-mark-no-shows-hourly',
//       '0 * * * *',   -- every hour, on the hour
//       $$ select net.http_post(
//            'https://YOUR_PROJECT.supabase.co/functions/v1/auto-mark-no-shows',
//            headers => jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')
//          ); $$
//     );
//
// Test manually anytime by hitting the URL directly with the service-role
// auth header. The function is idempotent — running it twice the same hour
// won't double-mark anything (already-no_show appts are filtered out).
//
// Required env vars:
//   SUPABASE_URL              — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

const RUN_HOUR_LOCAL = 6  // 6 AM in shop's local timezone

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ─── 1. Pull every shop (no opt-in — universally helpful) ───
    const { data: shops, error: shopsErr } = await supabase
      .from("shop_settings")
      .select("groomer_id, shop_name, waitlist_timezone")

    if (shopsErr) {
      console.error("[auto-no-show] shops query failed:", shopsErr)
      return jsonOk({ processed: 0, marked: 0, error: shopsErr.message })
    }

    const eligibleShops = shops || []
    let totalMarked = 0
    let totalSkipped = 0
    const perShopResults: any[] = []

    // ─── 2. For each shop, check hour match + process ───
    for (const shop of eligibleShops) {
      const tz = shop.waitlist_timezone || "America/Chicago"
      const localHour = getHourInTimezone(tz)
      if (localHour !== RUN_HOUR_LOCAL) {
        totalSkipped++
        continue
      }

      // Yesterday in shop's local TZ — that's the boundary
      const yesterday = getDateInTimezone(tz, -1)

      // ─── 3. Find candidate appointments ───
      const { data: stale, error: staleErr } = await supabase
        .from("appointments")
        .select("id, appointment_date, start_time, service_notes, pets:pet_id(name)")
        .eq("groomer_id", shop.groomer_id)
        .lte("appointment_date", yesterday)
        .is("checked_in_at", null)
        .is("checked_out_at", null)
        .in("status", ["scheduled", "confirmed", "unconfirmed", "pending"])

      if (staleErr) {
        console.error(`[auto-no-show] shop ${shop.groomer_id} query failed:`, staleErr)
        perShopResults.push({ shop: shop.shop_name, error: staleErr.message })
        continue
      }

      const candidates = stale || []
      if (candidates.length === 0) {
        perShopResults.push({ shop: shop.shop_name, marked: 0, message: "no stale appts" })
        continue
      }

      // ─── 4. Mark each as no_show + append audit note ───
      let shopMarked = 0
      for (const appt of candidates) {
        const auditNote = "[Auto-marked no-show: not checked in by next day]"
        const newNotes = appt.service_notes
          ? appt.service_notes + " " + auditNote
          : auditNote

        const { error: updErr } = await supabase
          .from("appointments")
          .update({
            status: "no_show",
            service_notes: newNotes,
            last_action: "cancelled_by_groomer",  // closest fit in our enum (auto-mark)
            last_action_at: new Date().toISOString(),
            action_seen_by_groomer: false,        // red dot until groomer reviews
          })
          .eq("id", appt.id)
          .eq("groomer_id", shop.groomer_id)
          .is("checked_in_at", null)              // double-guard against race
          .in("status", ["scheduled", "confirmed", "unconfirmed", "pending"])

        if (updErr) {
          console.error(`[auto-no-show] failed to mark appt ${appt.id}:`, updErr)
          continue
        }
        shopMarked++
      }

      totalMarked += shopMarked
      perShopResults.push({
        shop: shop.shop_name,
        marked: shopMarked,
        candidates: candidates.length,
      })
      console.log(`[auto-no-show] shop ${shop.shop_name}: marked ${shopMarked}/${candidates.length}`)
    }

    return jsonOk({
      total_shops: eligibleShops.length,
      shops_processed: eligibleShops.length - totalSkipped,
      shops_skipped_not_run_hour: totalSkipped,
      total_marked: totalMarked,
      run_hour_local: RUN_HOUR_LOCAL,
      per_shop: perShopResults,
    })
  } catch (err: any) {
    console.error("[auto-no-show] uncaught:", err)
    return jsonOk({ error: err.message || "internal" }, 500)
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHourInTimezone(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date())
  for (const p of parts) {
    if (p.type === "hour") {
      const h = parseInt(p.value, 10)
      // Intl returns 24 for midnight in some locales; normalize
      return h === 24 ? 0 : h
    }
  }
  return new Date().getUTCHours()
}

function getDateInTimezone(tz: string, addDays: number): string {
  // Returns YYYY-MM-DD for (today + addDays) in the given timezone
  const now = new Date()
  now.setDate(now.getDate() + addDays)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const obj: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== "literal") obj[p.type] = p.value
  }
  return `${obj.year}-${obj.month}-${obj.day}`
}

function jsonOk(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
