// =============================================================================
// stripe-charge-no-show-fee
// =============================================================================
// Auto-charges a client's default saved card when the groomer marks an
// appointment as no-show — IF the shop has set a no_show_fee_amount > 0
// in their Shop Settings.
//
// Flow:
//   1. Frontend (Calendar.jsx) sends: { appointment_id } when status flips to 'no_show'
//   2. Auth check — must be the groomer that owns the appointment
//   3. Look up shop_settings.no_show_fee_amount → if 0 or null, skip (no charge)
//   4. Look up the client → fetch their default saved card from Stripe
//   5. If no card on file → return a soft "skipped" so the UI can show
//      a friendly message ("client has no card on file, fee not charged")
//   6. Create PaymentIntent (off_session, since customer not present)
//   7. Insert payment row with notes "No-show fee for appt ..."
//
// Sandbox: uses STRIPE_TEST_SECRET_KEY
// To go live: change to STRIPE_SECRET_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.10.0?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Missing authorization', 401)
    const token = authHeader.replace('Bearer ', '')

    // 2. Body
    let body: any = {}
    try { body = await req.json() } catch { return jsonError('Invalid JSON body', 400) }
    const appointmentId = body.appointment_id
    if (!appointmentId) return jsonError('appointment_id is required', 400)

    // 3. Init Supabase admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // 4. Verify caller is a groomer
    let { data: groomer } = await supabase
      .from('groomers')
      .select('id, email, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', user.id)
      .maybeSingle()
    if (!groomer && user.email) {
      const fb = await supabase
        .from('groomers')
        .select('id, email, stripe_connect_account_id, stripe_connect_charges_enabled')
        .eq('email', user.email)
        .maybeSingle()
      groomer = fb.data
    }
    if (!groomer) return jsonError('Groomer record not found', 404)
    if (!groomer.stripe_connect_account_id || !groomer.stripe_connect_charges_enabled) {
      // Soft skip — they don't have Stripe Connect set up, no auto-charge possible
      return ok({ skipped: true, reason: 'shop_no_stripe' })
    }

    // 5. Look up shop_settings for no-show fee amount
    const { data: shopSettings } = await supabase
      .from('shop_settings')
      .select('no_show_fee_amount')
      .eq('groomer_id', groomer.id)
      .maybeSingle()

    const feeAmount = parseFloat((shopSettings && shopSettings.no_show_fee_amount) || 0)
    if (!feeAmount || feeAmount <= 0) {
      // Soft skip — no fee configured, nothing to charge
      return ok({ skipped: true, reason: 'no_fee_configured' })
    }

    // 6. Verify appointment belongs to this groomer + look up client
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, client_id, groomer_id, status')
      .eq('id', appointmentId)
      .maybeSingle()
    if (!appointment) return jsonError('Appointment not found', 404)
    if (appointment.groomer_id !== groomer.id) {
      return jsonError('This appointment does not belong to your shop', 403)
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, stripe_customer_id, first_name, last_name')
      .eq('id', appointment.client_id)
      .maybeSingle()
    if (!client) return jsonError('Client record not found', 404)
    if (!client.stripe_customer_id) {
      // Soft skip — client doesn't have a card on file
      return ok({ skipped: true, reason: 'client_no_card' })
    }

    // 7. Init Stripe + fetch the client's default payment method
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })
    const stripeAccountOpts = { stripeAccount: groomer.stripe_connect_account_id }

    let defaultPaymentMethodId: string | null = null
    try {
      const customer = await stripe.customers.retrieve(client.stripe_customer_id, stripeAccountOpts)
      if (customer && !('deleted' in customer)) {
        defaultPaymentMethodId = (customer.invoice_settings?.default_payment_method as string) || null
      }
      // Fallback: if no default set, grab the first card on file
      if (!defaultPaymentMethodId) {
        const list = await stripe.paymentMethods.list({
          customer: client.stripe_customer_id,
          type: 'card',
          limit: 1,
        }, stripeAccountOpts)
        if (list.data.length > 0) {
          defaultPaymentMethodId = list.data[0].id
        }
      }
    } catch (lookupErr: any) {
      console.error('[stripe-charge-no-show-fee] Customer/card lookup error:', lookupErr.message)
      return ok({ skipped: true, reason: 'card_lookup_failed' })
    }

    if (!defaultPaymentMethodId) {
      return ok({ skipped: true, reason: 'client_no_card' })
    }

    // 8. Create PaymentIntent — off_session because customer isn't present
    const amountCents = Math.round(feeAmount * 100)
    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        customer: client.stripe_customer_id,
        payment_method: defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          appointment_id: appointmentId,
          client_id: client.id,
          groomer_id: groomer.id,
          charge_type: 'no_show_fee',
        },
        description: `No-show fee — appt ${appointmentId.substring(0, 8)}`,
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-charge-no-show-fee] Stripe error:', stripeErr.message)
      return jsonError(stripeErr.message || 'No-show fee charge failed', 402)
    }

    if (paymentIntent.status !== 'succeeded') {
      return jsonError(`No-show charge ${paymentIntent.status} — card may be declined`, 402)
    }

    // 9. Insert payment row
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        groomer_id: groomer.id,
        client_id: client.id,
        appointment_id: appointmentId,
        amount: feeAmount,
        tip_amount: 0,
        method: 'card',
        notes: 'No-show fee (auto-charged)',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single()

    if (paymentErr) {
      console.error('[stripe-charge-no-show-fee] CRITICAL: charge succeeded but DB write failed:', paymentErr)
      return new Response(JSON.stringify({
        success: true,
        warning: 'No-show fee charged but record could not be saved — please contact support',
        payment_intent_id: paymentIntent.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 10. Done!
    return ok({
      success: true,
      charged: true,
      amount: feeAmount,
      payment_id: paymentRow.id,
      payment_intent_id: paymentIntent.id,
    })

  } catch (err: any) {
    console.error('[stripe-charge-no-show-fee] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

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
