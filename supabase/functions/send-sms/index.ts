// =============================================================================
// send-sms — Generic SMS sender with quota check
// =============================================================================
// Sends a single SMS via Twilio after gating it through the per-groomer
// SMS quota system (see SMS Quota System Schema v1.sql).
//
// Flow:
//   1. Validate request (to, message, groomer_id)
//   2. Call deduct_sms_quota RPC — this is the GATE.
//      • Founder unlimited → returns ok=true, no deduction.
//      • Has quota → deducts 1, returns ok=true with new remaining.
//      • Out of quota → returns ok=false. Bail with a clear upgrade message.
//   3. If quota OK, send via Twilio API.
//   4. If Twilio fails (network, bad number, etc.), log it and return error.
//      We do NOT auto-refund the quota — it's a tiny risk vs. the complexity
//      of double-spend bugs. If you ever need to refund, do it manually in SQL.
//
// Request body (POST):
//   {
//     to: string,           // E.164 format ("+12815551234")
//     message: string,      // SMS body (cap at 1600 chars / ~10 segments)
//     groomer_id: string,   // UUID — whose quota to deduct
//     sms_type?: string     // optional category for analytics: "reminder",
//                           // "confirmation", "manual", "rebook", "waitlist"
//   }
//
// Response (success):
//   { success: true, sid: "SM...", remaining: 999, source: "monthly" }
//   { success: true, sid: "SM...", remaining: -1,  source: "founder_unlimited" }
//
// Response (blocked / failed):
//   { success: false, error: "Out of SMS for this month. Upgrade...", code: "OUT_OF_QUOTA" }
//   { success: false, error: "Twilio error: ...",                       code: "TWILIO_FAILED" }
//   { success: false, error: "Missing 'to' field",                      code: "BAD_REQUEST" }
//
// Required env vars (Supabase Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID       — starts with AC...
//   TWILIO_AUTH_TOKEN        — Twilio account auth token
//   TWILIO_PHONE_NUMBER      — your registered A2P number (+1...)
//   SUPABASE_URL             — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // ─── 1. Parse + validate request body ───
    const body = await req.json().catch(() => ({}))
    const to = (body.to || "").toString().trim()
    const message = (body.message || "").toString().trim()
    const groomerId = (body.groomer_id || "").toString().trim()
    const smsType = (body.sms_type || "manual").toString()

    if (!to) {
      return jsonError("Missing 'to' (recipient phone number)", "BAD_REQUEST", 400)
    }
    if (!message) {
      return jsonError("Missing 'message' (SMS body)", "BAD_REQUEST", 400)
    }
    if (!groomerId) {
      return jsonError("Missing 'groomer_id'", "BAD_REQUEST", 400)
    }

    // Cap message length (Twilio bills per ~160-char segment; cap at 10 segments)
    const cappedMessage = message.length > 1600 ? message.slice(0, 1600) : message

    // Normalize phone number — strip non-digits then prepend + if missing
    let normalizedTo = to.replace(/[^\d+]/g, "")
    if (!normalizedTo.startsWith("+")) {
      // Assume US if 10 or 11 digits and no country code
      if (normalizedTo.length === 10) normalizedTo = "+1" + normalizedTo
      else if (normalizedTo.length === 11 && normalizedTo.startsWith("1")) normalizedTo = "+" + normalizedTo
      else normalizedTo = "+" + normalizedTo
    }

    // ─── 2. Verify Twilio creds are configured ───
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN")
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER")
    if (!twilioSid || !twilioToken || !twilioFrom) {
      console.error("[send-sms] Twilio env vars missing")
      return jsonError("SMS service is not configured. Contact support.", "NOT_CONFIGURED", 500)
    }

    // ─── 3. Build Supabase admin client (service-role) for RPC + logging ───
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ─── 3b. PER-TEMPLATE TOGGLE GATE ──────────────────────────────────
    // Groomers can disable specific automated SMS types they don't want
    // (saves their monthly allocation). Toggles live in
    // shop_settings.sms_template_enabled (JSONB). Manual sms_type ('manual'
    // or unknown) is NEVER gated — those are one-off groomer actions.
    // If the template key is explicitly set to false, skip BEFORE the
    // quota check so the disabled SMS doesn't burn a credit.
    const AUTOMATED_TYPES = new Set([
      "reminder", "confirmation", "pickup_ready", "running_late",
      "rebook_followup", "thank_you", "cancellation_offer",
    ])
    if (AUTOMATED_TYPES.has(smsType)) {
      const { data: shopRow } = await supabase
        .from("shop_settings")
        .select("sms_template_enabled")
        .eq("groomer_id", groomerId)
        .maybeSingle()
      const toggles = (shopRow && shopRow.sms_template_enabled) || {}
      // Default to enabled if key missing — preserves existing behavior
      // for shops that haven't touched the toggles UI yet.
      if (toggles[smsType] === false) {
        console.log(`[send-sms] ${smsType} disabled by groomer ${groomerId} — skipping`)
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: true,
            reason: `${smsType} template is disabled in shop settings`,
            sms_type: smsType,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
    }

    // ─── 4. GATE — call deduct_sms_quota RPC FIRST ───
    // This either returns ok=true (we can send) or ok=false (block).
    // Founders get ok=true automatically with source='founder_unlimited'.
    const { data: quotaResult, error: quotaErr } = await supabase.rpc("deduct_sms_quota", {
      p_groomer_id: groomerId,
      p_count: 1,
    })

    if (quotaErr) {
      console.error("[send-sms] deduct_sms_quota RPC error:", quotaErr)
      return jsonError("Could not check SMS quota: " + quotaErr.message, "QUOTA_CHECK_FAILED", 500)
    }

    if (!quotaResult || quotaResult.ok !== true) {
      const reason = (quotaResult && quotaResult.reason) || "Out of SMS for this month."
      return jsonError(reason, "OUT_OF_QUOTA", 402)  // 402 Payment Required (semantically right)
    }

    // ─── 5. Quota OK — fire the SMS via Twilio ───
    // Using fetch with form-encoded body (Twilio's Messages API spec).
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
    const twilioBody = new URLSearchParams({
      To: normalizedTo,
      From: twilioFrom,
      Body: cappedMessage,
    })

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(twilioSid + ":" + twilioToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioBody.toString(),
    })

    const twilioJson = await twilioRes.json().catch(() => ({}))

    if (!twilioRes.ok) {
      const tErr = twilioJson?.message || twilioJson?.error_message || `Twilio error ${twilioRes.status}`
      console.error("[send-sms] Twilio failed:", twilioRes.status, twilioJson)
      // NOTE: We do NOT refund the quota here. Reason: simpler, avoids double-spend
      // edge cases. If a groomer hits a string of failures, they can ping support
      // for a manual quota refill.
      return jsonError("SMS send failed: " + tErr, "TWILIO_FAILED", 500)
    }

    // ─── 6. Log to sms_messages so the inbox UI can show conversation history ───
    // Best-effort — if logging fails, we still return success (SMS was sent).
    // Look up client_id by phone match (last 10 digits) so the inbox can group by client.
    try {
      const last10 = normalizedTo.replace(/\D/g, "").slice(-10)
      const { data: clientHits } = await supabase
        .from("clients")
        .select("id, phone")
        .eq("groomer_id", groomerId)
      let matchedClientId: string | null = null
      if (clientHits) {
        const hit = clientHits.find((c: any) => {
          if (!c.phone) return false
          return c.phone.replace(/\D/g, "").slice(-10) === last10
        })
        if (hit) matchedClientId = hit.id
      }

      await supabase.from("sms_messages").insert({
        groomer_id: groomerId,
        client_id: matchedClientId,
        direction: "outbound",
        from_phone: twilioFrom,
        to_phone: normalizedTo,
        body: cappedMessage,
        twilio_sid: twilioJson.sid,
        sms_type: smsType,
        is_read: true,   // outbound is always "read" — we sent it
      })
    } catch (logErr) {
      console.error("[send-sms] sms_messages log failed (non-fatal):", logErr)
    }

    // ─── 7. Success — return the message SID + balance info ───
    console.log(`[send-sms] Sent SID=${twilioJson.sid} groomer=${groomerId} type=${smsType}`)

    return new Response(
      JSON.stringify({
        success: true,
        sid: twilioJson.sid,
        to: normalizedTo,
        remaining: quotaResult.remaining,
        total: quotaResult.total,
        source: quotaResult.source,
        sms_type: smsType,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err: any) {
    console.error("[send-sms] uncaught error:", err)
    return jsonError(err.message || "Internal error", "INTERNAL_ERROR", 500)
  }
})

function jsonError(message: string, code: string, status = 500) {
  return new Response(
    JSON.stringify({ success: false, error: message, code: code }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}
