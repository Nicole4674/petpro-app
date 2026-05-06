// =============================================================================
// send-reminders-cron — Auto-send appointment reminders
// =============================================================================
// Runs hourly (Supabase scheduled task). For each shop with reminders enabled,
// checks if it's currently their configured "send time" in their local timezone.
// If yes, finds appointments coming up `lead_days` days away that haven't had
// a reminder sent yet, and fires a Y/N reminder via the send-sms function.
//
// FLOW:
//   1. Pull all shops where reminder_enabled = true
//   2. For each shop:
//      a. Compute current hour in shop's waitlist_timezone (Central, Pacific, etc.)
//      b. Compare to reminder_send_hour_local
//      c. If match → process this shop. Else → skip until next hour.
//   3. For matching shops, find appointments where:
//      - appointment_date = today + lead_days
//      - reminder_sent_at IS NULL
//      - status not cancelled/no_show/completed
//      - client has sms_consent = true (legal compliance)
//      - client has a phone number on file
//   4. For each → call send-sms (counts against shop's quota) + mark reminder_sent_at
//
// SCHEDULING:
//   In Supabase Dashboard → Database → Extensions → enable pg_cron + pg_net.
//   Then in SQL Editor, schedule it:
//     select cron.schedule(
//       'send-reminders-hourly',
//       '0 * * * *',   -- every hour on the hour
//       $$ select net.http_post(
//            'https://YOUR_PROJECT.supabase.co/functions/v1/send-reminders-cron',
//            headers => jsonb_build_object('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')
//          ); $$
//     );
//
// You can also trigger it manually for testing by hitting the URL directly.
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

    // ─── 1. Pull all shops with reminders enabled ───
    // sms_templates included so each shop can customize the reminder wording
    const { data: shops, error: shopsErr } = await supabase
      .from("shop_settings")
      .select("groomer_id, shop_name, phone, waitlist_timezone, reminder_enabled, reminder_send_hour_local, reminder_lead_days, sms_templates")
      .eq("reminder_enabled", true)

    if (shopsErr) {
      console.error("[reminders-cron] failed to load shops:", shopsErr)
      return jsonOk({ processed: 0, sent: 0, error: shopsErr.message })
    }

    const eligibleShops = shops || []
    let totalProcessed = 0
    let totalSent = 0
    let totalSkipped = 0
    const perShopResults: any[] = []

    // ─── 2. For each shop, check time match + process appointments ───
    for (const shop of eligibleShops) {
      const tz = shop.waitlist_timezone || "America/Chicago"
      const sendHour = shop.reminder_send_hour_local ?? 17
      const leadDays = shop.reminder_lead_days ?? 1

      // What hour is it RIGHT NOW in the shop's local timezone?
      const localHour = getHourInTimezone(tz)
      if (localHour !== sendHour) {
        // Not this shop's send time — skip until the cron hits the matching hour
        totalSkipped++
        continue
      }

      // Compute target appointment date = today + leadDays in shop's local TZ
      const targetDate = getDateInTimezone(tz, leadDays)

      // ─── 3. Find appointments that need a reminder ───
      const { data: appts, error: apptsErr } = await supabase
        .from("appointments")
        .select(
          "id, appointment_date, start_time, status, client_id, " +
          "clients(first_name, last_name, phone, sms_consent), " +
          "pets:pet_id(name), " +
          "appointment_pets(pets:pet_id(name))"
        )
        .eq("groomer_id", shop.groomer_id)
        .eq("appointment_date", targetDate)
        .is("reminder_sent_at", null)
        .not("status", "in", "(cancelled,no_show,completed,rescheduled)")

      if (apptsErr) {
        console.error(`[reminders-cron] shop ${shop.groomer_id} appts query failed:`, apptsErr)
        perShopResults.push({ shop: shop.shop_name, error: apptsErr.message })
        continue
      }

      let shopSent = 0
      const eligibleAppts = appts || []

      for (const appt of eligibleAppts) {
        const client = appt.clients as any
        // Skip if client has no phone or hasn't consented to SMS
        if (!client || !client.phone) continue
        if (client.sms_consent !== true) continue

        // Build the reminder text using the shop's customizable template
        const clientFirst = client.first_name || "there"
        const clientLast = client.last_name || ""
        const petName = pickPetName(appt) || "your pet"
        const timeStr = formatTime(appt.start_time)
        const dateStr = formatDateLong(appt.appointment_date)
        const shopName = shop.shop_name || "your groomer"
        const shopPhone = shop.phone || ""

        // Default template (fallback if shop hasn't customized)
        const DEFAULT_REMINDER =
          "Hi {client_first_name}! Reminder: {pet_name} is booked for {service_name} on {date} at {time}. Reply Y to confirm or N to cancel. — {shop_name}"
        const tpl = (shop.sms_templates && shop.sms_templates.reminder) || DEFAULT_REMINDER

        const message = tpl.replace(/\{(\w+)\}/g, (_: string, k: string) => {
          const vars: Record<string, string> = {
            client_first_name: clientFirst,
            client_last_name: clientLast,
            pet_name: petName,
            service_name: "grooming appointment",   // generic — services are per-pet
            date: dateStr,
            time: timeStr,
            shop_name: shopName,
            phone: shopPhone,
          }
          return vars[k] !== undefined ? vars[k] : ""
        })

        // Call send-sms (counts against shop's quota, founders unlimited)
        try {
          const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: client.phone,
              message: message,
              groomer_id: shop.groomer_id,
              sms_type: "reminder",
            }),
          })

          if (sendRes.ok) {
            // Mark this appointment as reminded so we don't send again
            await supabase
              .from("appointments")
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq("id", appt.id)
            shopSent++
            totalSent++
          } else {
            const errBody = await sendRes.text().catch(() => "")
            console.error(`[reminders-cron] send-sms failed for appt ${appt.id}:`, sendRes.status, errBody)
          }
        } catch (sendErr) {
          console.error(`[reminders-cron] send-sms threw for appt ${appt.id}:`, sendErr)
        }
      }

      totalProcessed++
      perShopResults.push({
        shop: shop.shop_name,
        target_date: targetDate,
        eligible: eligibleAppts.length,
        sent: shopSent,
      })
      console.log(`[reminders-cron] ${shop.shop_name}: sent ${shopSent}/${eligibleAppts.length} reminders for ${targetDate}`)
    }

    return jsonOk({
      processed: totalProcessed,
      sent: totalSent,
      skipped: totalSkipped,
      total_eligible_shops: eligibleShops.length,
      shops: perShopResults,
    })
  } catch (err: any) {
    console.error("[reminders-cron] uncaught error:", err)
    return jsonOk({ error: err.message || "Internal error" }, 500)
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHourInTimezone(tz: string): number {
  // Get the current hour (0-23) in the given IANA timezone
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    })
    const parts = formatter.formatToParts(now)
    const hourPart = parts.find((p) => p.type === "hour")
    return hourPart ? parseInt(hourPart.value, 10) : 0
  } catch (e) {
    console.warn("[reminders-cron] bad timezone, falling back to UTC:", tz)
    return new Date().getUTCHours()
  }
}

function getDateInTimezone(tz: string, addDays: number): string {
  // Get YYYY-MM-DD that is `addDays` days from now in the given timezone
  try {
    const now = new Date()
    const target = new Date(now.getTime() + addDays * 24 * 60 * 60 * 1000)
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    return formatter.format(target)  // en-CA gives YYYY-MM-DD
  } catch (e) {
    const target = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000)
    return target.toISOString().slice(0, 10)
  }
}

function pickPetName(appt: any): string | null {
  if (appt.appointment_pets && appt.appointment_pets.length > 0) {
    const first = appt.appointment_pets[0]
    if (first?.pets?.name) return first.pets.name
  }
  if (appt.pets && appt.pets.name) return appt.pets.name
  return null
}

function formatTime(timeStr: string): string {
  // "14:30:00" → "2:30 PM"
  if (!timeStr) return ""
  const parts = timeStr.split(":")
  let h = parseInt(parts[0], 10)
  const m = parts[1] || "00"
  const ampm = h >= 12 ? "PM" : "AM"
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return m === "00" ? `${h} ${ampm}` : `${h}:${m} ${ampm}`
}

function formatDateLong(ymd: string): string {
  // "2026-05-09" → "Saturday, May 9"
  if (!ymd) return ""
  const d = new Date(ymd + "T12:00:00")
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function jsonOk(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
