// =============================================================================
// stripe-groomer-charge-boarding
// =============================================================================
// Same as stripe-groomer-charge but for boarding stays. Charges a client's
// saved card from the GROOMER side. Use case: boarding pickup, client owes
// the balance, groomer clicks "Charge Card on File" on the kennel card and
// the saved card gets charged via Stripe. Money lands in groomer's Connect
// bank account. Auto-fires receipt email like the grooming flow.
//
// Flow:
//   1. Frontend (groomer-side) sends:
//      { boarding_reservation_id, payment_method_id, tip_amount }
//   2. Auth — caller must be the groomer that owns the reservation
//   3. Look up reservation → client → client.stripe_customer_id
//   4. Look up groomer's connect account
//   5. Compute balance from total_price - paid_so_far
//   6. Create PaymentIntent on connected account, confirm with payment_method
//   7. Insert payment row with method='card' + stripe_payment_intent_id
//   8. Fire receipt email
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

    const reservationId = body.boarding_reservation_id
    const paymentMethodId = body.payment_method_id
    const tipAmount = parseFloat(body.tip_amount) || 0

    if (!reservationId) return jsonError('boarding_reservation_id is required', 400)
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

    // 5. Look up the reservation + verify it belongs to this groomer
    const { data: reservation, error: resErr } = await supabase
      .from('boarding_reservations')
      .select('id, client_id, groomer_id, total_price, status')
      .eq('id', reservationId)
      .maybeSingle()

    if (resErr) {
      console.error('[stripe-groomer-charge-boarding] Reservation lookup error:', resErr)
      return jsonError('Could not look up reservation: ' + resErr.message, 500)
    }
    if (!reservation) return jsonError('Reservation not found', 404)
    if (reservation.groomer_id !== groomer.id) {
      return jsonError('This reservation does not belong to your shop', 403)
    }

    // 6. Look up the client + verify they have a Stripe customer
    const { data: client } = await supabase
      .from('clients')
      .select('id, stripe_customer_id')
      .eq('id', reservation.client_id)
      .maybeSingle()

    if (!client) return jsonError('Client record not found', 404)
    if (!client.stripe_customer_id) {
      return jsonError('Client has no card on file — ask them to add one in their portal', 400)
    }

    // 7. Total comes straight from the reservation row.
    const totalPrice = parseFloat(reservation.total_price || 0)
    if (!totalPrice || totalPrice <= 0) {
      return jsonError('This reservation has no price set — please add a total first', 400)
    }

    // 8. Subtract previous payments (minus refunds) to get balance owed
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount, refunded_amount')
      .eq('boarding_reservation_id', reservationId)

    const paidSoFar = (existingPayments || []).reduce((sum: number, p: any) => {
      const paidAmt = parseFloat(p.amount || 0)
      const refunded = parseFloat(p.refunded_amount || 0)
      return sum + Math.max(0, paidAmt - refunded)
    }, 0)
    const balance = totalPrice - paidSoFar

    if (balance <= 0.001) {
      return jsonError('This reservation is already paid in full', 400)
    }

    // 9. Look up shop settings for the "pass card fees to client" toggle
    const { data: shopSettings } = await supabase
      .from('shop_settings')
      .select('pass_fees_to_client')
      .eq('groomer_id', groomer.id)
      .maybeSingle()
    const passFeesToClient = shopSettings && shopSettings.pass_fees_to_client === true

    let cardFeeSurcharge = 0
    if (passFeesToClient) {
      const netNeeded = balance + tipAmount
      const gross = (netNeeded + 0.30) / (1 - 0.029)
      cardFeeSurcharge = Math.ceil((gross - netNeeded) * 100) / 100
    }

    const amountToChargeDollars = balance + tipAmount + cardFeeSurcharge
    const amountToChargeCents = Math.round(amountToChargeDollars * 100)

    // 10. Init Stripe + create PaymentIntent on connected account
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
        // off_session=true → merchant-initiated, authorized via original SetupIntent
        off_session: true,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          boarding_reservation_id: reservationId,
          client_id: client.id,
          groomer_id: groomer.id,
          tip_amount: String(tipAmount),
          initiated_by: 'groomer',
        },
        description: `Boarding payment (groomer-initiated) — res ${reservationId.substring(0, 8)}`,
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-groomer-charge-boarding] Stripe error:', stripeErr.message)
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

    // 11. Write payment row — boarding_reservation_id links it to the stay
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        groomer_id: groomer.id,
        client_id: client.id,
        boarding_reservation_id: reservationId,
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
      console.error('[stripe-groomer-charge-boarding] CRITICAL: charge succeeded but DB write failed:', paymentErr)
      return new Response(JSON.stringify({
        success: true,
        warning: 'Payment processed but record could not be saved — please contact support',
        payment_intent_id: paymentIntent.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 12. Fire-and-forget receipt email
    try {
      await supabase.functions.invoke('stripe-send-receipt', {
        body: { payment_id: paymentRow.id }
      })
    } catch (emailErr) {
      console.warn('[stripe-groomer-charge-boarding] Receipt email failed (non-fatal):', emailErr)
    }

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
    console.error('[stripe-groomer-charge-boarding] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
