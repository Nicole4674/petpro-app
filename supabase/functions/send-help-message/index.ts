// =============================================================================
// send-help-message
// =============================================================================
// Sends a help/bug-report message from a groomer (or anyone in the app) to
// Nicole's inbox via Resend. Mounted from the Help page contact form.
//
// Why a dedicated function: keeps the founder's email private (we don't expose
// it as a hardcoded mailto link), and lets us add lightweight rate-limiting
// + spam protection if needed later.
//
// Flow:
//   1. Receives { from_email, subject, message } from the Help page form
//   2. Validates basic fields + length
//   3. Sends an email to Nicole's inbox via Resend, with reply-to set to the
//      sender so she can reply directly
//
// Required env vars:
//   RESEND_API_KEY  — same key used by other email functions
//
// Returns:
//   { ok: true } on success
//   { error: 'reason' } on failure
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Where to deliver help messages — Nicole's inbox.
const TO_EMAIL = "treadwell4674@gmail.com"
// "From" address must be on a Resend-verified domain.
const FROM_EMAIL = "nicole@trypetpro.com"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // ─── 1. Parse + validate ───
    const body = await req.json().catch(() => ({}))
    const fromEmail = (body.from_email || "").toString().trim()
    const subject = (body.subject || "").toString().trim() || "PetPro Help Message"
    const message = (body.message || "").toString().trim()

    if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return jsonError("Please enter a valid email address.", 400)
    }
    if (!message) {
      return jsonError("Please enter a message.", 400)
    }
    if (message.length > 5000) {
      return jsonError("Message is too long (max 5,000 characters).", 400)
    }

    // ─── 2. Send via Resend ───
    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) {
      console.error("[send-help-message] RESEND_API_KEY missing")
      return jsonError("Email service is not configured. Try again later.", 500)
    }

    // HTML escape user content so the email renders safely
    const safeMsg = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")
    const safeFrom = fromEmail
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    const safeSubject = subject
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 16px 20px; border-radius: 12px 12px 0 0; color: #fff;">
          <div style="font-size: 12px; opacity: 0.85; letter-spacing: 1px; text-transform: uppercase;">PetPro · Help Inbox</div>
          <div style="font-size: 18px; font-weight: 800; margin-top: 4px;">${safeSubject}</div>
        </div>
        <div style="background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            <strong>From:</strong> ${safeFrom}
          </div>
          <div style="font-size: 14px; line-height: 1.6; color: #1f2937; white-space: pre-wrap;">
            ${safeMsg}
          </div>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
            Sent via the PetPro Help page · Reply directly to ${safeFrom} to respond.
          </div>
        </div>
      </div>
    `

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `PetPro Help <${FROM_EMAIL}>`,
        to: [TO_EMAIL],
        reply_to: fromEmail,
        subject: `[PetPro Help] ${subject}`,
        html: html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text().catch(() => "")
      console.error("[send-help-message] Resend failed:", resendRes.status, errText)
      return jsonError("Could not send. Try again or email nicole@trypetpro.com directly.", 500)
    }

    console.log(`[send-help-message] Sent help message from ${fromEmail}`)

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err: any) {
    console.error("[send-help-message] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}
