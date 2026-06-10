// =============================================================================
// send-review-request — ⭐ Review Booster
// =============================================================================
// Asks a client for a Google review right after checkout. ALL the deciding
// happens here, so the frontend just fire-and-forgets with an appointment_id:
//
//   1. Review Booster enabled? Google review URL set?       → else skip
//   2. Client already asked before? (review_requested_at)   → else skip (ONCE EVER)
//   3. SMS path: phone + sms_consent → send via send-sms (deducts 1 SMS quota)
//   4. Email fallback: client has email → send via Resend
//   5. Neither → skip
//   6. On success: stamp clients.review_requested_at (never ask again)
//
// Request (POST): { appointment_id: string }
// Response: { sent: true, channel: 'sms' | 'email' }
//        or { sent: false, skipped: 'reason' }
//        or { error: '...' }
//
// Called fire-and-forget from Calendar checkout paths + mobile drop-off
// complete — a failure here must NEVER block a checkout.
//
// Required env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//               RESEND_API_KEY (email fallback only)
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const FROM_EMAIL = "nicole@trypetpro.com"   // same verified Resend sender as receipts

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // ─── Auth: resolve the calling groomer from their JWT ───
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401)
    const groomerId = user.id

    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const appointmentId = body.appointment_id
    if (!appointmentId) return jsonResponse({ error: "appointment_id required" }, 400)

    // ─── 1. Shop settings — enabled + link present? ───
    const { data: shop } = await admin
      .from("shop_settings")
      .select("review_booster_enabled, google_review_url, shop_name")
      .eq("groomer_id", groomerId)
      .maybeSingle()

    if (!shop || shop.review_booster_enabled !== true) {
      return jsonResponse({ sent: false, skipped: "review_booster_disabled" })
    }
    const reviewUrl = (shop.google_review_url || "").trim()
    if (!reviewUrl) {
      return jsonResponse({ sent: false, skipped: "no_review_url" })
    }
    const shopName = shop.shop_name || "your groomer"

    // ─── 2. Appointment → client (must belong to this groomer) ───
    const { data: appt } = await admin
      .from("appointments")
      .select("id, client_id, pets:pet_id(name), clients:client_id(id, first_name, phone, email, sms_consent, review_requested_at)")
      .eq("id", appointmentId)
      .eq("groomer_id", groomerId)
      .maybeSingle()

    if (!appt || !appt.clients) {
      return jsonResponse({ sent: false, skipped: "appointment_or_client_not_found" })
    }
    const client: any = appt.clients
    const petName = (appt as any).pets?.name || "your pup"
    const firstName = client.first_name || "there"

    // ─── ONCE EVER guard ───
    if (client.review_requested_at) {
      return jsonResponse({ sent: false, skipped: "already_requested" })
    }

    // ─── 3. SMS path (preferred) ───
    // No emoji on purpose — keeps the message in GSM encoding so it stays
    // 1-2 segments instead of 3+ (emoji forces 70-char segments).
    if (client.phone && client.sms_consent === true) {
      const smsMsg =
        "Hi " + firstName + "! Thanks for letting " + shopName + " pamper " + petName +
        "! If you have a moment, a quick Google review means the world to a small business: " + reviewUrl

      const smsRes = await fetch(supabaseUrl + "/functions/v1/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          to: client.phone,
          message: smsMsg,
          groomer_id: groomerId,
          sms_type: "review_request",
        }),
      })
      const smsData = await smsRes.json().catch(() => null)
      if (smsRes.ok && smsData && smsData.success !== false) {
        await admin
          .from("clients")
          .update({ review_requested_at: new Date().toISOString() })
          .eq("id", client.id)
        return jsonResponse({ sent: true, channel: "sms" })
      }
      // SMS failed (out of quota, Twilio hiccup, template gate) → fall
      // through to email rather than burning the once-ever stamp on a miss.
      console.warn("[review-request] SMS path failed, trying email:", smsData)
    }

    // ─── 4. Email fallback ───
    if (client.email) {
      const resendKey = Deno.env.get("RESEND_API_KEY")
      if (!resendKey) {
        return jsonResponse({ sent: false, skipped: "no_resend_key" })
      }
      const html = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111827; margin: 0 0 12px;">Thanks from ${shopName}! 🐾</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Hi ${firstName} — thanks for letting us pamper ${petName} today!
          </p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            If you have a moment, a quick Google review would mean the world to our small business.
            It takes about 30 seconds and helps other pet parents find us.
          </p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${reviewUrl}"
               style="background: #7c3aed; color: #ffffff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
              ⭐ Leave a quick review
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.5;">
            Thank you for your support! — ${shopName}
          </p>
        </div>`

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + resendKey,
        },
        body: JSON.stringify({
          from: shopName + " <" + FROM_EMAIL + ">",
          to: [client.email],
          subject: "Thanks from " + shopName + "! One small favor? ⭐",
          html: html,
        }),
      })

      if (emailRes.ok) {
        await admin
          .from("clients")
          .update({ review_requested_at: new Date().toISOString() })
          .eq("id", client.id)
        return jsonResponse({ sent: true, channel: "email" })
      }
      const errText = await emailRes.text()
      console.error("[review-request] Resend failed:", errText)
      return jsonResponse({ sent: false, skipped: "email_send_failed" })
    }

    // ─── 5. No way to reach them ───
    return jsonResponse({ sent: false, skipped: "no_contact_method" })
  } catch (err: any) {
    console.error("[send-review-request] error:", err)
    return jsonResponse({ error: err.message || "Internal error" }, 500)
  }
})
