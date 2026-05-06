// =============================================================================
// twilio-sms-inbound — Handle inbound SMS replies from clients
// =============================================================================
// Twilio POSTs here whenever a client replies to one of our SMS.
//
// Primary use case: appointment reminder Y/N confirmations.
// When a client replies "Y" or "N" to a reminder, we auto-confirm or
// auto-cancel their most recent unconfirmed/scheduled appointment.
//
// Twilio sends form-encoded data (NOT JSON):
//   From=+12815551234        — sender's phone (the client)
//   To=+1...                 — your Twilio number (where they replied to)
//   Body=Y                   — the message text
//   MessageSid=SMxxx...      — Twilio's message ID
//   AccountSid=ACxxx...      — your Twilio account
//   FromCity, FromState, ... — geo data (we ignore)
//
// We respond with empty TwiML <Response/> to acknowledge, optionally with
// a confirmation message.
//
// CONFIGURE IN TWILIO:
//   Twilio Console → Phone Numbers → your A2P number → "A MESSAGE COMES IN"
//   webhook URL: https://YOUR_PROJECT.supabase.co/functions/v1/twilio-sms-inbound
//   HTTP POST
//
// Required env vars:
//   SUPABASE_URL              — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided
//   TWILIO_ACCOUNT_SID        — for sending confirmation reply (optional)
//   TWILIO_AUTH_TOKEN         — same
//   TWILIO_PHONE_NUMBER       — same
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // Twilio always uses POST. Anything else gets 200 OK with empty TwiML.
  if (req.method !== "POST") {
    return twimlResponse("")
  }

  try {
    // ─── 1. Parse Twilio's form-encoded body ───
    const formData = await req.formData()
    const fromRaw = (formData.get("From") || "").toString()
    const bodyRaw = (formData.get("Body") || "").toString()
    const messageSid = (formData.get("MessageSid") || "").toString()

    if (!fromRaw || !bodyRaw) {
      console.warn("[sms-inbound] Missing From or Body")
      return twimlResponse("")
    }

    const fromPhone = normalizePhone(fromRaw)
    const replyText = bodyRaw.trim().toLowerCase()
    console.log(`[sms-inbound] From=${fromPhone} Body="${bodyRaw}" SID=${messageSid}`)

    // ─── 2. Classify the reply ───
    // Y / Yes / YES / Confirm → confirm
    // N / No / NO / Cancel → cancel
    // Anything else → save to message history but don't auto-act
    const isYes = /^(y|yes|yeah|yep|confirm|confirmed|ok|okay|sure)\b/i.test(replyText)
    const isNo = /^(n|no|nope|cancel|cancelled|cant|can\'?t|reschedule)\b/i.test(replyText)

    // ─── 3. Build Supabase client (needed regardless of Y/N or casual reply) ───
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Look up clients matching this phone number. We compare on the
    // last 10 digits to handle US numbers regardless of +1 prefix variations.
    const last10 = fromPhone.replace(/\D/g, "").slice(-10)

    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id, first_name, last_name, phone, groomer_id")

    const clientHits = (matchingClients || []).filter((c) => {
      if (!c.phone) return false
      const cl10 = c.phone.replace(/\D/g, "").slice(-10)
      return cl10 === last10
    })

    // ─── 2.5. ALWAYS log the inbound to the inbox FIRST ───
    // (whether it's Y/N or casual chat — groomer needs to see all replies)
    if (clientHits.length > 0) {
      const primaryClient = clientHits[0]
      const inboundType = isYes ? "inbound_yes" : isNo ? "inbound_no" : "inbound_chat"
      await logInboundMessage(
        supabase,
        primaryClient.groomer_id,
        primaryClient.id,
        fromPhone,
        bodyRaw,
        messageSid,
        inboundType
      )
    }

    // ─── 2.6. If it's NOT a Y/N reply, just acknowledge and bail ───
    // The message is already in the inbox for the groomer to read & reply manually.
    if (!isYes && !isNo) {
      console.log(`[sms-inbound] Casual reply from ${fromPhone} logged to inbox: ${bodyRaw}`)
      return twimlResponse("")
    }

    if (clientHits.length === 0) {
      console.warn(`[sms-inbound] No client matches phone ${fromPhone}`)
      // Still log the inbound for the inbox (no client_id match — orphan message)
      await logInboundMessage(supabase, null, null, fromPhone, bodyRaw, messageSid, "inbound_unmatched")
      return twimlResponse("Hi! We didn't recognize this number. Please reply to your groomer directly to update your appointment.")
    }

    // For each matching client (could be multiple if same phone shared across shops),
    // find the soonest UPCOMING appointment that's still pending/scheduled/confirmed.
    // We act on the soonest one — that's what the reminder was about.
    //
    // ─── Timezone-friendly date filter ───
    // We use YESTERDAY in UTC as the floor (instead of today) because Supabase
    // runs in UTC but groomers' calendars are usually in local time. A late-night
    // confirmation reply for "today's" appointment (Central) would be filtered out
    // if we used UTC today's-date. Including yesterday safely handles all US timezones.
    const clientIds = clientHits.map((c) => c.id)
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: upcomingAppts } = await supabase
      .from("appointments")
      .select("id, appointment_date, start_time, status, client_id, groomer_id, pets:pet_id(name), appointment_pets(pets:pet_id(name))")
      .in("client_id", clientIds)
      .gte("appointment_date", yesterdayIso)
      .in("status", ["scheduled", "confirmed", "pending", "unconfirmed", "checked_in"])
      .is("checked_out_at", null)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)

    if (!upcomingAppts || upcomingAppts.length === 0) {
      console.warn(`[sms-inbound] No upcoming appointment found for client phone ${fromPhone}`)
      return twimlResponse("Hi! We couldn't find an upcoming appointment for you. Please contact your groomer directly.")
    }

    const appt = upcomingAppts[0]

    // Pet name for the reply
    let petName = "your pet"
    if (appt.appointment_pets && appt.appointment_pets.length > 0 && appt.appointment_pets[0].pets) {
      petName = appt.appointment_pets[0].pets.name || petName
    } else if (appt.pets && appt.pets.name) {
      petName = appt.pets.name
    }

    // (Inbound was already logged to inbox above in step 2.5)

    // ─── 4. Apply the action ───
    if (isYes) {
      const { error: confirmErr } = await supabase
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", appt.id)
      if (confirmErr) {
        console.error("[sms-inbound] confirm update failed:", confirmErr)
        return twimlResponse("")  // silent fail
      }
      console.log(`[sms-inbound] Confirmed appointment ${appt.id} for ${fromPhone}`)
      return twimlResponse(`Got it! ${petName}'s appointment on ${appt.appointment_date} is confirmed. See you then! 🐾`)
    }

    // isNo
    const { error: cancelErr } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appt.id)
    if (cancelErr) {
      console.error("[sms-inbound] cancel update failed:", cancelErr)
      return twimlResponse("")
    }
    console.log(`[sms-inbound] Cancelled appointment ${appt.id} for ${fromPhone}`)
    return twimlResponse(`Got it. ${petName}'s appointment on ${appt.appointment_date} has been cancelled. Reach out anytime to rebook!`)

  } catch (err: any) {
    console.error("[sms-inbound] uncaught error:", err)
    return twimlResponse("")  // always return 200 to Twilio so they don't retry forever
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Log an inbound SMS to the sms_messages table so the inbox UI can show it.
// Best-effort — never throws. Uses the env's TWILIO_PHONE_NUMBER as the to_phone.
async function logInboundMessage(
  supabase: any,
  groomerId: string | null,
  clientId: string | null,
  fromPhone: string,
  body: string,
  twilioSid: string,
  smsType: string
) {
  try {
    if (!groomerId) {
      // If no groomer match, we can't log it (groomer_id is NOT NULL).
      // Still write to console for debugging.
      console.log(`[sms-inbound] Unmatched inbound from ${fromPhone}: ${body}`)
      return
    }
    await supabase.from("sms_messages").insert({
      groomer_id: groomerId,
      client_id: clientId,
      direction: "inbound",
      from_phone: fromPhone,
      to_phone: Deno.env.get("TWILIO_PHONE_NUMBER") || "",
      body: body,
      twilio_sid: twilioSid,
      sms_type: smsType,
      is_read: false,   // groomer hasn't seen it yet
    })
  } catch (logErr) {
    console.error("[sms-inbound] sms_messages log failed (non-fatal):", logErr)
  }
}

function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "")
  if (!p.startsWith("+")) {
    if (p.length === 10) p = "+1" + p
    else if (p.length === 11 && p.startsWith("1")) p = "+" + p
    else p = "+" + p
  }
  return p
}

// Twilio expects a TwiML XML response. Empty <Response/> = ack with no reply.
// <Response><Message>text</Message></Response> = send a reply back to the sender.
function twimlResponse(replyText: string): Response {
  let body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>"
  if (replyText && replyText.trim().length > 0) {
    // Escape XML special chars
    const safe = replyText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
    body += `<Message>${safe}</Message>`
  }
  body += "</Response>"
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}
