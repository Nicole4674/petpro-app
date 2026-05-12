// =============================================================================
// offer-cancelled-slot-to-waitlist — Auto-offer a cancelled slot via SMS
// =============================================================================
// Fired immediately after an appointment is cancelled (from either the
// groomer-side Calendar OR a client cancelling via portal AI chat).
// Picks the BEST waitlist match for the cancelled slot and sends them an
// SMS offer. Client replies YES via SMS → twilio-sms-inbound books them.
//
// SMART MATCHING:
//   • For STATIONARY (shop-based) groomers → waitlist position order
//   • For MOBILE groomers → haversine distance from cancelled appt's
//     client address, nearest waitlist person wins
//   • Service must match (same service_id) so the duration fits
//   • Skips waitlist people who already have a pending offer or have
//     exceeded 3 offer_attempts (likely ghosts)
//   • Respects quiet hours (waitlist_quiet_hours_*) — no texting at midnight
//
// Single-offer-at-a-time: top match only. If they don't reply within the
// shop's configured expiry window (default 60 min), the offer rolls to
// the next-best match automatically via a separate cron.
//
// Request body:
//   { appointment_id: string }   — the cancelled appointment
//
// Returns:
//   { ok: true, offered_to: { client_id, name, phone, distance_miles? } }
//   { ok: true, no_match: true, reason: '...' }   — no waitlist match
//   { error: '...' }
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { appointment_id } = await req.json()
    if (!appointment_id) return jsonError("appointment_id required")

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ─── 1. Pull cancelled appointment + the originating client's location ─
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select(`
        id, groomer_id, client_id, service_id, appointment_date, start_time, end_time, status,
        clients ( latitude, longitude ),
        services ( time_block_minutes, service_name )
      `)
      .eq("id", appointment_id)
      .maybeSingle()
    if (apptErr || !appt) return jsonError("Appointment not found", 404)
    if (appt.status !== "cancelled") {
      return jsonError("Appointment is not cancelled — refusing to auto-offer.")
    }

    const groomerId = appt.groomer_id
    const serviceId = appt.service_id
    const cancelledClient = appt.clients as any
    const apptLat = cancelledClient?.latitude
    const apptLng = cancelledClient?.longitude

    // ─── 2. Pull shop settings (mobile? offer window? quiet hours?) ────
    // Real schema uses waitlist_quiet_start_hour / waitlist_quiet_end_hour
    // (ints 0-23). Defaults: 9 (start, allowed FROM) and 20 (end, allowed
    // UNTIL — exclusive). So 9-20 = OK to text 9am to 8pm.
    const { data: shop } = await supabase
      .from("shop_settings")
      .select("shop_name, phone, is_mobile, cancellation_offer_expiry_minutes, waitlist_quiet_start_hour, waitlist_quiet_end_hour, waitlist_timezone, sms_template_enabled")
      .eq("groomer_id", groomerId)
      .maybeSingle()
    if (!shop) return jsonError("Shop settings not found", 404)

    // ─── 2b. MASTER KILL SWITCH — Waitlist Auto-Notify toggle ──────────
    // Lives on ai_personalization.waitlist_auto_notify_enabled and is the
    // single ON/OFF switch shown in AI → Chat Settings. Defaults OFF so a
    // brand-new groomer doesn't blast clients before they've opted in.
    // STRICT === true check: anything else (null, undefined, false) blocks.
    // This is the gate that fixes the "I turned waitlist off but a client
    // still got a text" bug — previously this function only honored the
    // per-template cancellation_offer toggle and ignored the master switch.
    const { data: aiPrefs } = await supabase
      .from("ai_personalization")
      .select("waitlist_auto_notify_enabled")
      .eq("groomer_id", groomerId)
      .maybeSingle()
    if (!aiPrefs || aiPrefs.waitlist_auto_notify_enabled !== true) {
      return jsonResponse({
        ok: true,
        no_match: true,
        reason: "Waitlist Auto-Notify is OFF in AI Chat Settings — skipped.",
      })
    }

    // ─── 3. Quiet hours guard — don't text outside allowed window ──────
    // Treat the columns as "send only when current hour >= start AND
    // < end". Default 9-20 = 9am to 8pm. Anything outside = quiet.
    const tz = shop.waitlist_timezone || "America/Chicago"
    const startHour = (shop.waitlist_quiet_start_hour != null) ? Number(shop.waitlist_quiet_start_hour) : 9
    const endHour = (shop.waitlist_quiet_end_hour != null) ? Number(shop.waitlist_quiet_end_hour) : 20
    const nowHour = getHourInTimezone(tz)
    const inAllowedWindow = startHour < endHour
      ? (nowHour >= startHour && nowHour < endHour)
      : (nowHour >= startHour || nowHour < endHour)  // wraps midnight (e.g. 22-06)
    if (!inAllowedWindow) {
      return jsonResponse({
        ok: true,
        no_match: true,
        reason: `Outside allowed texting window (currently ${nowHour}:00 in ${tz}, allowed ${startHour}:00 - ${endHour}:00). Offer skipped to avoid late-night text.`,
        deferred: true,
      })
    }

    // ─── 4. Check the cancellation_offer template toggle ────────────────
    // Defaults ON (key absent === undefined !== false → not blocked).
    // Groomers who specifically want to silence cancellation auto-fills
    // can flip this off in Shop Settings → SMS Templates.
    const toggles = (shop.sms_template_enabled as any) || {}
    if (toggles.cancellation_offer === false) {
      return jsonResponse({
        ok: true,
        no_match: true,
        reason: "Cancellation auto-fill SMS is disabled in shop settings.",
      })
    }

    // ─── 5. Pull eligible waitlist candidates ──────────────────────────
    // Eligible = waiting status, same service preference (or no service
    // pref), no active offer, hasn't exceeded 3 declined attempts.
    const { data: waitlistRows } = await supabase
      .from("grooming_waitlist")
      .select(`
        id, position, status, pet_id, service_id, offer_attempts, expires_at,
        clients ( id, first_name, last_name, phone, sms_consent, latitude, longitude ),
        pets:pet_id ( name )
      `)
      .eq("groomer_id", groomerId)
      .eq("status", "waiting")
      .is("offered_slot_start", null)
      .order("position", { ascending: true })

    if (!waitlistRows || waitlistRows.length === 0) {
      return jsonResponse({ ok: true, no_match: true, reason: "Waitlist is empty." })
    }

    // Filter:
    //  • Same service (or null = any service)
    //  • Has phone + sms_consent
    //  • Not over 3 attempts
    let candidates = waitlistRows.filter((w: any) => {
      if (!w.clients?.phone) return false
      if (w.clients?.sms_consent !== true) return false
      if (w.offer_attempts >= 3) return false
      if (w.service_id != null && serviceId != null && w.service_id !== serviceId) return false
      return true
    })

    if (candidates.length === 0) {
      return jsonResponse({ ok: true, no_match: true, reason: "No eligible waitlist clients (consent / service / attempts filters)." })
    }

    // ─── 6. Pick the best candidate ────────────────────────────────────
    // Mobile groomer → nearest by haversine. Stationary → position order.
    let chosen: any
    let chosenDistanceMiles: number | null = null
    if (shop.is_mobile && apptLat != null && apptLng != null) {
      const ranked = candidates.map((w: any) => {
        const wLat = w.clients?.latitude
        const wLng = w.clients?.longitude
        const distMi = (wLat != null && wLng != null)
          ? haversineMiles(apptLat, apptLng, wLat, wLng)
          : Number.POSITIVE_INFINITY  // missing coords = lowest priority
        return { row: w, distMi }
      })
      ranked.sort((a, b) => a.distMi - b.distMi)
      chosen = ranked[0].row
      chosenDistanceMiles = Number.isFinite(ranked[0].distMi) ? Math.round(ranked[0].distMi * 10) / 10 : null
    } else {
      // Stationary: already sorted by position
      chosen = candidates[0]
    }

    // ─── 7. Stamp the waitlist row with the offer ──────────────────────
    const expiryMin = shop.cancellation_offer_expiry_minutes || 60
    const slotStartISO = `${appt.appointment_date}T${appt.start_time}`
    const slotEndISO = `${appt.appointment_date}T${appt.end_time}`
    const expiresAt = new Date(Date.now() + expiryMin * 60 * 1000).toISOString()
    const { error: stampErr } = await supabase
      .from("grooming_waitlist")
      .update({
        offered_slot_start: slotStartISO,
        offered_slot_end: slotEndISO,
        expires_at: expiresAt,
        offered_via: "sms",
        offer_attempts: (chosen.offer_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chosen.id)
    if (stampErr) return jsonError("Could not stamp offer: " + stampErr.message)

    // ─── 8. Build + send the SMS via send-sms ─────────────────────────
    const clientFirst = chosen.clients?.first_name || "there"
    const petName = chosen.pets?.name || "your pet"
    const dateLabel = new Date(appt.appointment_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    const timeLabel = formatTime(appt.start_time)
    const shopName = shop.shop_name || "your groomer"
    const message = `Hi ${clientFirst}! A grooming spot opened up for ${petName} on ${dateLabel} at ${timeLabel}. Reply YES to book or NO to pass. Offer expires in ${expiryMin >= 60 ? Math.round(expiryMin / 60) + ' hour' + (expiryMin >= 120 ? 's' : '') : expiryMin + ' min'}. — ${shopName}`

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: chosen.clients.phone,
        message,
        groomer_id: groomerId,
        sms_type: "cancellation_offer",  // own template-enabled gate
      }),
    })
    if (!sendRes.ok) {
      const errBody = await sendRes.text().catch(() => "")
      // Roll back the offer stamp so the next try can re-offer
      await supabase
        .from("grooming_waitlist")
        .update({ offered_slot_start: null, offered_slot_end: null, expires_at: null, offered_via: null })
        .eq("id", chosen.id)
      return jsonError("SMS send failed: " + errBody, 502)
    }

    return jsonResponse({
      ok: true,
      offered_to: {
        waitlist_id: chosen.id,
        client_id: chosen.clients.id,
        name: `${chosen.clients.first_name || ""} ${chosen.clients.last_name || ""}`.trim(),
        phone: chosen.clients.phone,
        ...(chosenDistanceMiles != null ? { distance_miles: chosenDistanceMiles } : {}),
      },
      expires_at: expiresAt,
      message_sent: message,
    })
  } catch (err: any) {
    console.error("[offer-cancelled-slot] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

// ─── Helpers ────────────────────────────────────────────────────────────

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// Haversine: distance between two lat/lng pairs in miles.
// Earth radius = 3958.8 mi.
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180
  const R = 3958.8
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getHourInTimezone(tz: string): number {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", hour12: false,
    })
    const parts = formatter.formatToParts(now)
    const hourPart = parts.find((p) => p.type === "hour")
    return hourPart ? parseInt(hourPart.value, 10) : 0
  } catch {
    return new Date().getUTCHours()
  }
}

function formatTime(timeStr: string): string {
  if (!timeStr) return ""
  const [h, m] = timeStr.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}
