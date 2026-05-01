// =============================================================================
// send-heads-up-email
// =============================================================================
// Sends a "Heading your way!" email to a client when the mobile groomer taps
// the heads-up button on the Route page. Manual trigger (not scheduled) so
// the groomer stays in control — they can fire it after a flat tire, lunch
// break, drive-through stop, etc., without auto-emails making them look bad.
//
// Flow:
//   1. Receives appointment_id (or boarding_reservation_id) + eta_minutes
//   2. Looks up client (email, name) + groomer/shop info (name, phone, brand)
//   3. Builds an HTML email with the ETA window
//   4. Sends via Resend (same setup as stripe-send-receipt)
//
// Auth: Called from the Route page in the browser. We don't enforce JWT here
// because anyone who's already in the app is authorized to send heads-ups
// for their own clients. The lookup-by-id pattern means we only send to the
// client tied to that specific appointment.
//
// Returns:
//   { ok: true, sent_to: 'client@email.com' } on success
//   { error: 'reason', code?: 'no_client_email' } on failure
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

    // Required: ONE of (appointment_id, boarding_reservation_id) + eta_minutes
    const apptId = body.appointment_id || null
    const resId = body.boarding_reservation_id || null
    const etaMinutes = parseInt(body.eta_minutes, 10) || 30

    if (!apptId && !resId) {
      return jsonError('Need appointment_id or boarding_reservation_id', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Look up the appointment or reservation to find client_id + groomer_id
    let clientId: string | null = null
    let groomerId: string | null = null
    let petName: string | null = null
    let stopType: 'grooming' | 'boarding_dropoff' | 'boarding_pickup' = 'grooming'

    if (apptId) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('client_id, groomer_id, pets:pet_id(name)')
        .eq('id', apptId)
        .maybeSingle()
      if (!appt) return jsonError('Appointment not found', 404)
      clientId = appt.client_id
      groomerId = appt.groomer_id
      petName = (appt.pets as any)?.name || null
      stopType = 'grooming'
    } else if (resId) {
      // For boarding, we don't know if it's drop-off or pick-up from just the
      // ID — frontend tells us via stop_type. Default to drop-off if missing.
      const { data: res } = await supabase
        .from('boarding_reservations')
        .select('client_id, groomer_id')
        .eq('id', resId)
        .maybeSingle()
      if (!res) return jsonError('Reservation not found', 404)
      clientId = res.client_id
      groomerId = res.groomer_id
      stopType = body.stop_type === 'boarding_pickup' ? 'boarding_pickup' : 'boarding_dropoff'
    }

    // 2. Client lookup — need email or we can't send anything
    const { data: client } = await supabase
      .from('clients')
      .select('first_name, last_name, email')
      .eq('id', clientId)
      .maybeSingle()

    if (!client || !client.email) {
      return jsonError('Client has no email on file', 400, 'no_client_email')
    }

    // 3. Shop info for branding (name, phone, color)
    const { data: shop } = await supabase
      .from('shop_settings')
      .select('shop_name, phone, email, primary_color')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    const { data: groomer } = await supabase
      .from('groomers')
      .select('business_name, email')
      .eq('id', groomerId)
      .maybeSingle()

    const shopName =
      (shop && shop.shop_name) ||
      (groomer && groomer.business_name) ||
      FROM_NAME_FALLBACK
    const shopPhone = (shop && shop.phone) || null
    const shopEmail = (shop && shop.email) || (groomer && groomer.email) || null
    const brandColor = (shop && shop.primary_color) || '#7c3aed'

    // 4. Compute the ETA — both a relative ("in about 30 minutes") and an
    //    absolute clock time ("by ~3:45 PM") so the client gets both readings.
    //    We use server time (UTC) but format for the client's local. Since we
    //    don't know their TZ we send a generic "your local time" and format
    //    in the groomer's TZ from shop_settings (best approximation).
    const now = new Date()
    const arrivalDate = new Date(now.getTime() + etaMinutes * 60 * 1000)
    const arrivalClock = arrivalDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago',  // Default to CST — most US groomers
    })
    // Format the relative ETA cleanly — handles minutes-only, full-hour,
    // and "1 hr 15 min" style for the new custom-duration option.
    let etaRelative: string
    if (etaMinutes < 60) {
      etaRelative = `${etaMinutes} minutes`
    } else {
      const hrs = Math.floor(etaMinutes / 60)
      const mins = etaMinutes % 60
      const hourLabel = hrs === 1 ? '1 hour' : `${hrs} hours`
      etaRelative = mins > 0 ? `${hourLabel} ${mins} min` : hourLabel
    }

    // 5. Build email
    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'there'
    const firstName = client.first_name || 'there'

    const stopLabel = stopType === 'boarding_dropoff' ? 'pick up your pup'
                    : stopType === 'boarding_pickup'  ? 'drop off your pup'
                    : 'arrive for grooming'

    const html = buildHeadsUpHtml({
      firstName,
      shopName,
      shopPhone,
      shopEmail,
      brandColor,
      etaRelative,
      arrivalClock,
      petName,
      stopLabel,
    })

    const subject = `Heading your way — ${shopName}`

    // 6. Send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-heads-up-email] RESEND_API_KEY not configured')
      return jsonError('Email service not configured', 500)
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${shopName} <${FROM_EMAIL}>`,
        to: [client.email],
        subject,
        html,
        reply_to: shopEmail || undefined,
      })
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text().catch(() => '')
      console.error('[send-heads-up-email] Resend error:', resendRes.status, errBody)
      return jsonError(`Resend returned ${resendRes.status}: ${errBody}`, 502)
    }

    return ok({ ok: true, sent_to: client.email, eta_minutes: etaMinutes })

  } catch (err: any) {
    console.error('[send-heads-up-email] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

// =============================================================================
// Email HTML builder
// =============================================================================
// Mobile-first design — single column, big CTA-style ETA card, friendly tone.
// Renders well in Gmail mobile, Apple Mail, Outlook (desktop and mobile).
// =============================================================================
function buildHeadsUpHtml(d: any): string {
  const brand = d.brandColor || '#7c3aed'
  const petLine = d.petName
    ? `<div style="font-size:14px;color:#6b7280;margin-top:8px;text-align:center;">Looking forward to seeing <strong style="color:#1f2937;">${escapeHtml(d.petName)}</strong> 🐾</div>`
    : ''
  const phoneLine = d.shopPhone
    ? `<div style="font-size:13px;color:#6b7280;margin-top:14px;text-align:center;">Need to reach me? <a href="tel:${escapeHtml(d.shopPhone)}" style="color:${brand};text-decoration:none;font-weight:700;">${escapeHtml(d.shopPhone)}</a></div>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">

        <tr><td style="padding:28px 28px 8px;background:${brand};color:#fff;text-align:center;">
          <div style="font-size:48px;line-height:1;">🚗</div>
          <div style="font-size:22px;font-weight:800;margin-top:8px;">Heading your way!</div>
        </td></tr>

        <tr><td style="padding:24px 28px;">
          <div style="font-size:15px;color:#1f2937;text-align:center;">
            Hi ${escapeHtml(d.firstName)},
          </div>
          <div style="font-size:14px;color:#6b7280;margin-top:8px;text-align:center;line-height:1.5;">
            Just a heads-up — I'm on my way to ${escapeHtml(d.stopLabel)}.
          </div>

          <div style="margin-top:22px;padding:18px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#166534;font-weight:700;letter-spacing:0.5px;">ESTIMATED ARRIVAL</div>
            <div style="font-size:24px;color:#14532d;font-weight:800;margin-top:6px;">${escapeHtml(d.arrivalClock)}</div>
            <div style="font-size:13px;color:#166534;margin-top:4px;">in about ${escapeHtml(d.etaRelative)}</div>
          </div>

          ${petLine}
          ${phoneLine}
        </td></tr>

        <tr><td style="padding:16px 28px 22px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:8px;">
            💌 Don't see our emails? Check your spam folder and mark us as <strong>"Not Spam"</strong> so future updates land in your inbox.
          </div>
          <div style="font-size:11px;color:#9ca3af;line-height:1.5;">
            Sent by <strong style="color:#6b7280;">${escapeHtml(d.shopName)}</strong> via PetPro
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string): string {
  return String(s == null ? '' : s)
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

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
