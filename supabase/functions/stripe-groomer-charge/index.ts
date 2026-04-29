// =============================================================================
// stripe-groomer-charge
// =============================================================================
// Charges a client's saved card from the GROOMER side. Use case: client
// shows up at the shop, hasn't paid through the portal, groomer rings them
// up by clicking "Card" in Take Payment and picking the client's card on
// file. Money lands in the groomer's Connect bank account same as a portal
// payment.
//
// Mirrors stripe-charge-card but auth-checked as the groomer, and resolves
// the client + their stripe_customer_id from the appointment.client_id
// instead of from auth.user_id.
//
// Flow:
//   1. Frontend (groomer-side) sends: { appointment_id, payment_method_id, tip_amount }
//   2. Auth check — caller must be the groomer that owns the appointment
//   3. Look up appointment → client → client.stripe_customer_id
//   4. Look up groomer's connect account
//   5. Compute balance (same fallback chain as portal flow)
//   6. Create PaymentIntent on connected account, confirm with payment_method_id
//   7. Insert payment row with method='card' + stripe_payment_intent_id
//   8. Return success
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
    const paymentMethodId = body.payment_method_id
    const tipAmount = parseFloat(body.tip_amount) || 0

    if (!appointmentId) return jsonError('appointment_id is required', 400)
    if (!paymentMethodId) return jsonError('payment_method_id is required', 400)
    if (tipAmount < 0) return jsonError('tip_amount cannot be negative', 400)

    // 3. Init Supabase admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // 4. Verify caller is a groomer (look up by id, fall back to email)
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
    if (!groomer.stripe_connect_account_id) {
      return jsonError('No Stripe Connect account on file for this shop', 400)
    }
    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError('Shop is still completing Stripe setup', 400)
    }

    // 5. Look up the appointment + verify it belongs to this groomer
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, client_id, groomer_id, service_id, status')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr) {
      console.error('[stripe-groomer-charge] Appointment lookup error:', apptErr)
      return jsonError('Could not look up appointment: ' + apptErr.message, 500)
    }
    if (!appointment) return jsonError('Appointment not found', 404)
    if (appointment.groomer_id !== groomer.id) {
      return jsonError('This appointment does not belong to your shop', 403)
    }

    // 6. Look up the client + verify they have a Stripe customer
    const { data: client } = await supabase
      .from('clients')
      .select('id, stripe_customer_id')
      .eq('id', appointment.client_id)
      .maybeSingle()

    if (!client) return jsonError('Client record not found', 404)
    if (!client.stripe_customer_id) {
      return jsonError('Client has no card on file — ask them to add one in their portal', 400)
    }

    // 7. Compute total — fallback chain (same as portal flow):
    //    a. Sum of service prices across appointment_pets (multi-pet)
    //    b. Legacy single service.price
    let totalPrice = 0

    const { data: apptPets } = await supabase
      .from('appointment_pets')
      .select('service_id')
      .eq('appointment_id', appointmentId)

    if (apptPets && apptPets.length > 0) {
      const serviceIds = apptPets.map(ap => ap.service_id).filter(Boolean)
      if (serviceIds.length > 0) {
        const { data: petServices } = await supabase
          .from('services')
          .select('id, price')
          .in('id', serviceIds)
        if (petServices && petServices.length > 0) {
          totalPrice = apptPets.reduce((sum: number, ap: any) => {
            const svc = petServices.find(s => s.id === ap.service_id)
            return sum + parseFloat((svc && svc.price) || 0)
          }, 0)
        }
      }
    }

    if (!totalPrice && appointment.service_id) {
      const { data: svc } = await supabase
        .from('services')
        .select('price')
        .eq('id', appointment.service_id)
        .maybeSingle()
      if (svc && svc.price) {
        totalPrice = parseFloat(svc.price) || 0
      }
    }

    if (!totalPrice || totalPrice <= 0) {
      return jsonError('This appointment has no price set — please contact the shop', 400)
    }

    // 8. Subtract previous payments + add back refunds (so refunded charges
    //    flip the appointment back to unpaid, just like the UI does)
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount, refunded_amount')
      .eq('appointment_id', appointmentId)

    const paidSoFar = (existingPayments || []).reduce((sum: number, p: any) => {
      const paidAmt = parseFloat(p.amount || 0)
      const refunded = parseFloat(p.refunded_amount || 0)
      return sum + Math.max(0, paidAmt - refunded)
    }, 0)
    const balance = totalPrice - paidSoFar

    if (balance <= 0.001) {
      return jsonError('This appointment is already paid in full', 400)
    }

    // Look up shop settings for the "pass card fees to client" toggle.
    const { data: shopSettings } = await supabase
      .from('shop_settings')
      .select('pass_fees_to_client')
      .eq('groomer_id', groomer.id)
      .maybeSingle()
    const passFeesToClient = shopSettings && shopSettings.pass_fees_to_client === true

    // Compute card fee surcharge so the groomer nets the full service + tip
    let cardFeeSurcharge = 0
    if (passFeesToClient) {
      const netNeeded = balance + tipAmount
      const gross = (netNeeded + 0.30) / (1 - 0.029)
      cardFeeSurcharge = Math.ceil((gross - netNeeded) * 100) / 100
    }

    const amountToChargeDollars = balance + tipAmount + cardFeeSurcharge
    const amountToChargeCents = Math.round(amountToChargeDollars * 100)

    // 9. Init Stripe + create PaymentIntent on connected account
    const stripe = new Stripe(Deno.env.get('STRIPE_TEST_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })
    const stripeAccountOpts = { stripeAccount: groomer.stripe_connect_account_id }

    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountToChargeCents,
        currency: 'usd',
        customer: client.stripe_customer_id,
        payment_method: paymentMethodId,
        // off_session=true because the customer isn't actively typing —
        // groomer is initiating the charge from their dashboard. This is
        // a "merchant-initiated" transaction, which Stripe + the customer's
        // bank treat as authorized through the original SetupIntent.
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
          tip_amount: String(tipAmount),
          initiated_by: 'groomer',
        },
        description: `Appointment payment (groomer-initiated) — appt ${appointmentId.substring(0, 8)}`,
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-groomer-charge] Stripe error:', stripeErr.message)
      // Common case: card requires 3DS authentication. We disabled redirects,
      // so the charge fails. Tell the groomer to ask the client to pay via portal instead.
      let userMsg = stripeErr.message || 'Charge failed'
      if (stripeErr.code === 'authentication_required') {
        userMsg = 'This card requires the cardholder to authenticate. Ask the client to pay through their portal instead.'
      }
      return jsonError(userMsg, 402)
    }

    if (paymentIntent.status !== 'succeeded') {
      return jsonError(
        `Payment ${paymentIntent.status} — please try a different card or method`,
        402
      )
    }

    // 10. Write payment row
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        groomer_id: groomer.id,
        client_id: client.id,
        appointment_id: appointmentId,
        amount: balance,
        tip_amount: tipAmount,
        method: 'card',
        notes: cardFeeSurcharge > 0
          ? `Charged saved card on file (Stripe) — incl. $${cardFeeSurcharge.toFixed(2)} card fee`
          : 'Charged saved card on file (Stripe)',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single()

    if (paymentErr) {
      console.error('[stripe-groomer-charge] CRITICAL: charge succeeded but DB write failed:', paymentErr)
      return new Response(JSON.stringify({
        success: true,
        warning: 'Payment processed but record could not be saved — please contact support',
        payment_intent_id: paymentIntent.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 11. Fire-and-forget receipt email (don't block — charge already succeeded)
    try {
      await supabase.functions.invoke('stripe-send-receipt', {
        body: { payment_id: paymentRow.id }
      })
    } catch (emailErr) {
      console.warn('[stripe-groomer-charge] Receipt email failed (non-fatal):', emailErr)
    }

    // 12. Done
    return new Response(JSON.stringify({
      success: true,
      payment_id: paymentRow.id,
      payment_intent_id: paymentIntent.id,
      amount_charged: amountToChargeDollars,
      service_amount: balance,
      tip_amount: tipAmount,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-groomer-charge] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
