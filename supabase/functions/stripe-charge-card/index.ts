// =============================================================================
// stripe-charge-card
// =============================================================================
// Charges a client's saved card for an appointment. Creates a Stripe
// PaymentIntent on the groomer's Connect account, confirms it with the
// chosen saved card, and records the resulting payment in our DB.
//
// Security: backend is authoritative on the amount. Frontend passes the
// appointment_id + tip_amount, but we calculate the balance owed
// ourselves so a malicious client can't pass amount=$0.01.
//
// Flow:
//   1. Frontend sends: { appointment_id, payment_method_id, tip_amount }
//   2. Auth check — must be the client who owns the appointment
//   3. Look up appointment + already-paid payments → compute balance
//   4. Create PaymentIntent on the groomer's connected account
//   5. Confirm immediately with the chosen payment method (saved card)
//   6. On success → write payment row to payments table
//   7. Return success/failure to frontend
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

    // 4. Find the client
    const { data: client } = await supabase
      .from('clients')
      .select('id, groomer_id, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!client) return jsonError('Client record not found', 404)
    if (!client.stripe_customer_id) return jsonError('No Stripe customer on file — add a card first', 400)

    // 5. Look up the appointment + verify it's THIS client's. Also pull
    //    service price + multi-pet appointment_pets so we can compute total
    //    when total_price isn't explicitly set on the row.
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, client_id, groomer_id, total_price, status, services(price), appointment_pets(services:service_id(price))')
      .eq('id', appointmentId)
      .maybeSingle()

    if (!appointment) return jsonError('Appointment not found', 404)
    if (appointment.client_id !== client.id) return jsonError('This appointment does not belong to you', 403)

    // 6. Compute total — same fallback logic as the frontend uses:
    //    a. Explicit total_price column
    //    b. Sum of service prices across appointment_pets (multi-pet)
    //    c. Legacy single service.price
    let totalPrice = parseFloat(appointment.total_price || 0)
    if (!totalPrice && appointment.appointment_pets && appointment.appointment_pets.length > 0) {
      totalPrice = appointment.appointment_pets.reduce((sum: number, ap: any) => {
        return sum + parseFloat((ap.services && ap.services.price) || 0)
      }, 0)
    }
    if (!totalPrice && appointment.services && (appointment.services as any).price) {
      totalPrice = parseFloat((appointment.services as any).price) || 0
    }
    if (!totalPrice || totalPrice <= 0) {
      return jsonError('This appointment has no price set — please contact the shop', 400)
    }

    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('appointment_id', appointmentId)

    const paidSoFar = (existingPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
    const balance = totalPrice - paidSoFar

    if (balance <= 0.001) {
      return jsonError('This appointment is already paid in full', 400)
    }

    const amountToChargeDollars = balance + tipAmount
    const amountToChargeCents = Math.round(amountToChargeDollars * 100)

    // 7. Look up groomer's Stripe Connect account
    const { data: groomer } = await supabase
      .from('groomers')
      .select('id, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', appointment.groomer_id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError('Shop has not connected Stripe yet', 400)
    }
    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError('Shop is still completing Stripe setup', 400)
    }

    // 8. Init Stripe + create PaymentIntent on connected account
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
        // Charge it immediately — customer is present in the portal
        confirm: true,
        // off_session=false because customer is actively initiating this charge
        off_session: false,
        // Disable redirect-based payment methods so we don't need a return_url.
        // We're only using saved cards (Visa/MC/etc) which never need redirects.
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          appointment_id: appointmentId,
          client_id: client.id,
          groomer_id: groomer.id,
          tip_amount: String(tipAmount),
        },
        description: `Appointment payment — appt ${appointmentId.substring(0, 8)}`,
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-charge-card] Stripe error:', stripeErr.message)
      return jsonError(stripeErr.message || 'Payment failed', 402)
    }

    // 9. Check the charge succeeded. Stripe returns various statuses;
    //    'succeeded' is the only happy path. 'requires_action' would mean
    //    3DS but we disabled that. Anything else = fail.
    if (paymentIntent.status !== 'succeeded') {
      return jsonError(
        `Payment ${paymentIntent.status} — please try a different card`,
        402
      )
    }

    // 10. Write payment row to our DB
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        groomer_id: groomer.id,
        appointment_id: appointmentId,
        amount: balance,            // service amount only
        tip_amount: tipAmount,      // tip recorded separately
        method: 'Card',
        notes: 'Paid via client portal (Stripe)',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single()

    if (paymentErr) {
      // Charge succeeded but DB write failed — log loudly. The money is
      // collected on Stripe's side, but our DB doesn't know. Operator
      // would need to reconcile manually.
      console.error('[stripe-charge-card] CRITICAL: charge succeeded but DB write failed:', paymentErr)
      return new Response(JSON.stringify({
        success: true,
        warning: 'Payment processed but record could not be saved — please contact the shop',
        payment_intent_id: paymentIntent.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 11. Done!
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
    console.error('[stripe-charge-card] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
