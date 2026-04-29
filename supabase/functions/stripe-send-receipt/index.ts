// =============================================================================
// stripe-send-receipt
// =============================================================================
// Sends a payment receipt email to a client after a Stripe charge succeeds.
// Called by stripe-charge-card and stripe-groomer-charge after they finish
// writing the payment row.
//
// Flow:
//   1. Receives payment_id (the row we just inserted)
//   2. Looks up: payment → client (for email + name) → groomer (shop name)
//   3. Builds an HTML receipt
//   4. Sends via SendGrid API
//   5. Returns success/failure
//
// We don't fail loudly if the email send fails — the charge is more important.
// We log it and return a soft failure that the caller can ignore.
//
// Auth: this function is called server-to-server from other edge functions
// using the service role key, so we don't enforce JWT auth.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FROM_EMAIL = 'nicole@trypetpro.com'
const FROM_NAME_FALLBACK = 'PetPro'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body: any = {}
    try { body = await req.json() } catch { return jsonError('Invalid JSON body', 400) }

    const paymentId = body.payment_id
    if (!paymentId) return jsonError('payment_id is required', 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Look up the payment + related rows
    const { data: payment } = await supabase
      .from('payments')
      .select('id, amount, tip_amount, method, created_at, stripe_payment_intent_id, client_id, groomer_id, appointment_id')
      .eq('id', paymentId)
      .maybeSingle()

    if (!payment) return jsonError('Payment not found', 404)

    // 2. Client info
    const { data: client } = await supabase
      .from('clients')
      .select('first_name, last_name, email')
      .eq('id', payment.client_id)
      .maybeSingle()

    if (!client || !client.email) {
      console.log('[stripe-send-receipt] No client email — skipping')
      return ok({ skipped: true, reason: 'no_client_email' })
    }

    // 3. Groomer / shop info
    const { data: groomer } = await supabase
      .from('groomers')
      .select('id, business_name, email')
      .eq('id', payment.groomer_id)
      .maybeSingle()

    // Pull richer shop info (logo, phone, etc.) from shop_settings if present
    const { data: shop } = await supabase
      .from('shop_settings')
      .select('shop_name, phone, email, logo_url, primary_color')
      .eq('groomer_id', payment.groomer_id)
      .maybeSingle()

    const shopName =
      (shop && shop.shop_name) ||
      (groomer && groomer.business_name) ||
      FROM_NAME_FALLBACK
    const shopPhone = shop && shop.phone ? shop.phone : null
    const shopEmail = (shop && shop.email) || (groomer && groomer.email) || null
    const brandColor = (shop && shop.primary_color) || '#7c3aed'

    // 4. Optional: appointment context (date + service for nicer receipt)
    let apptDate: string | null = null
    let apptServices: string[] = []
    if (payment.appointment_id) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('appointment_date, start_time, service_id, services:service_id(service_name), appointment_pets(services:service_id(service_name))')
        .eq('id', payment.appointment_id)
        .maybeSingle()
      if (appt) {
        apptDate = appt.appointment_date || null
        // Multi-pet first
        if (appt.appointment_pets && appt.appointment_pets.length > 0) {
          appt.appointment_pets.forEach((ap: any) => {
            const n = ap.services && ap.services.service_name
            if (n && apptServices.indexOf(n) === -1) apptServices.push(n)
          })
        } else if (appt.services && (appt.services as any).service_name) {
          apptServices.push((appt.services as any).service_name)
        }
      }
    }

    // 5. Build receipt HTML
    const amount = parseFloat(payment.amount || 0)
    const tip = parseFloat(payment.tip_amount || 0)
    const total = amount + tip
    const dateStr = new Date(payment.created_at).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'there'

    const html = buildReceiptHtml({
      clientName,
      shopName,
      shopPhone,
      shopEmail,
      brandColor,
      amount,
      tip,
      total,
      dateStr,
      apptDate,
      apptServices,
      paymentIntentId: payment.stripe_payment_intent_id,
    })

    const subject = `Receipt from ${shopName} — $${total.toFixed(2)}`

    // 6. Send via SendGrid
    const sgKey = Deno.env.get('SENDGRID_API_KEY')
    if (!sgKey) {
      console.error('[stripe-send-receipt] SENDGRID_API_KEY not configured')
      return jsonError('Email service not configured', 500)
    }

    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sgKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: client.email, name: clientName }],
          subject,
        }],
        from: { email: FROM_EMAIL, name: shopName },
        reply_to: shopEmail ? { email: shopEmail, name: shopName } : undefined,
        content: [{ type: 'text/html', value: html }],
      })
    })

    if (!sgRes.ok) {
      const errBody = await sgRes.text().catch(() => '')
      console.error('[stripe-send-receipt] SendGrid error:', sgRes.status, errBody)
      return jsonError(`SendGrid returned ${sgRes.status}`, 502)
    }

    return ok({ sent: true, to: client.email })

  } catch (err: any) {
    console.error('[stripe-send-receipt] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function buildReceiptHtml(d: any): string {
  const brand = d.brandColor || '#7c3aed'
  const apptLine = d.apptDate
    ? `<div style="font-size:13px;color:#6b7280;margin-top:6px;">Appointment: ${formatApptDate(d.apptDate)}${d.apptServices.length ? ' · ' + d.apptServices.join(', ') : ''}</div>`
    : ''
  const tipRow = d.tip > 0
    ? `<tr><td style="padding:8px 0;color:#6b7280;">Tip</td><td style="padding:8px 0;text-align:right;color:#1f2937;">$${d.tip.toFixed(2)}</td></tr>`
    : ''
  const piRow = d.paymentIntentId
    ? `<div style="font-size:11px;color:#9ca3af;margin-top:18px;">Stripe transaction: ${d.paymentIntentId}</div>`
    : ''
  const contactLines = []
  if (d.shopPhone) contactLines.push(d.shopPhone)
  if (d.shopEmail) contactLines.push(d.shopEmail)

  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">

        <tr><td style="padding:24px 28px;background:${brand};color:#fff;">
          <div style="font-size:18px;font-weight:800;">${escapeHtml(d.shopName)}</div>
          <div style="font-size:13px;opacity:0.9;margin-top:2px;">Payment Receipt</div>
        </td></tr>

        <tr><td style="padding:24px 28px;">
          <div style="font-size:15px;color:#1f2937;">Hi ${escapeHtml(d.clientName)},</div>
          <div style="font-size:14px;color:#6b7280;margin-top:6px;line-height:1.5;">Thanks! Your payment was received successfully. Here's a copy for your records.</div>
          ${apptLine}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;">Service</td><td style="padding:8px 0;text-align:right;color:#1f2937;">$${d.amount.toFixed(2)}</td></tr>
            ${tipRow}
            <tr><td style="padding:10px 0;font-weight:800;color:#1f2937;border-top:1px solid #e5e7eb;">Total Charged</td><td style="padding:10px 0;text-align:right;font-weight:800;color:${brand};font-size:16px;border-top:1px solid #e5e7eb;">$${d.total.toFixed(2)}</td></tr>
          </table>

          <div style="font-size:13px;color:#6b7280;margin-top:14px;">Paid: ${d.dateStr}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">Method: Card on file</div>

          ${piRow}
        </td></tr>

        <tr><td style="padding:18px 28px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6;">
          Questions? ${contactLines.length ? 'Reach us at ' + escapeHtml(contactLines.join(' or ')) + '.' : 'Reply to this email.'}
          <br/>Thanks again — see you next time! 🐾
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function formatApptDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function ok(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
