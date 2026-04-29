// =============================================================================
// stripe-charge-boarding
// =============================================================================
// Same idea as stripe-charge-card, but for boarding stays. Charges a client's
// saved card for one of their boarding_reservations rows. Creates a Stripe
// PaymentIntent on the groomer's Connect account, confirms it with the chosen
// saved card, records the payment (linked to boarding_reservation_id), and
// auto-flips pending → confirmed if the shop requires prepay.
//
// Backend is authoritative on amount — frontend passes ID + tip; we compute
// the balance ourselves so a malicious client can't pass amount=$0.01.
//
// Flow:
//   1. Frontend sends: { boarding_reservation_id, payment_method_id, tip_amount }
//   2. Auth — must be the client who owns the reservation
//   3. Look up reservation + already-paid payments → compute balance
//   4. Create PaymentIntent on the groomer's connected account
//   5. Confirm immediately with the chosen payment method
//   6. On success → write payment row (with boarding_reservation_id)
//   7. Auto-confirm if pending + require_prepay
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

    // 4. Find the client
    const { data: client } = await supabase
      .from('clients')
      .select('id, groomer_id, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!client) return jsonError('Client record not found', 404)
    if (!client.stripe_customer_id) return jsonError('No Stripe customer on file — add a card first', 400)

    // 5. Look up the reservation. total_price lives directly on the row,
    //    no joins needed (much simpler than the grooming flow).
    const { data: reservation, error: resErr } = await supabase
      .from('boarding_reservations')
      .select('id, client_id, groomer_id, total_price, status')
      .eq('id', reservationId)
      .maybeSingle()

    if (resErr) {
      console.error('[stripe-charge-boarding] Reservation lookup error:', resErr)
      return jsonError('Could not look up reservation: ' + resErr.message, 500)
    }
    if (!reservation) return jsonError('Boarding reservation not found', 404)
    if (reservation.client_id !== client.id) return jsonError('This reservation does not belong to you', 403)

    const totalPrice = parseFloat(reservation.total_price || 0)
    if (!totalPrice || totalPrice <= 0) {
      return jsonError('This reservation has no price set — please contact the shop', 400)
    }

    // 6. Look up shop settings — pass-fees-to-client + require_prepay flags.
    const { data: shopSettings } = await supabase
      .from('shop_settings')
      .select('pass_fees_to_client, require_prepay_to_book')
      .eq('groomer_id', reservation.groomer_id)
      .maybeSingle()

    const passFeesToClient = shopSettings && shopSettings.pass_fees_to_client === true
    const requirePrepay = shopSettings && shopSettings.require_prepay_to_book === true

    // 7. Compute balance from existing payments on THIS reservation
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount, refunded_amount')
      .eq('boarding_reservation_id', reservationId)

    const paidSoFar = (existingPayments || []).reduce((sum, p) => {
      const paid = parseFloat(p.amount || 0)
      const refunded = parseFloat(p.refunded_amount || 0)
      return sum + Math.max(0, paid - refunded)
    }, 0)
    const balance = totalPrice - paidSoFar

    if (balance <= 0.001) {
      return jsonError('This reservation is already paid in full', 400)
    }

    // Card-fee surcharge if pass-fees-to-client is on. Inverts Stripe's
    // 2.9% + $0.30 so the groomer nets exactly the service+tip amount.
    let cardFeeSurcharge = 0
    if (passFeesToClient) {
      const netNeeded = balance + tipAmount
      const gross = (netNeeded + 0.30) / (1 - 0.029)
      cardFeeSurcharge = Math.ceil((gross - netNeeded) * 100) / 100
    }

    const amountToChargeDollars = balance + tipAmount + cardFeeSurcharge
    const amountToChargeCents = Math.round(amountToChargeDollars * 100)

    // 8. Look up groomer's Stripe Connect account
    const { data: groomer } = await supabase
      .from('groomers')
      .select('id, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', reservation.groomer_id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError('Shop has not connected Stripe yet', 400)
    }
    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError('Shop is still completing Stripe setup', 400)
    }

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
        confirm: true,
        off_session: false,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          boarding_reservation_id: reservationId,
          client_id: client.id,
          groomer_id: groomer.id,
          tip_amount: String(tipAmount),
        },
        description: `Boarding stay payment — res ${reservationId.substring(0, 8)}`,
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-charge-boarding] Stripe error:', stripeErr.message)
      return jsonError(stripeErr.message || 'Payment failed', 402)
    }

    if (paymentIntent.status !== 'succeeded') {
      return jsonError(
        `Payment ${paymentIntent.status} — please try a different card`,
        402
      )
    }

    // 10. Write payment row. boarding_reservation_id links it to the stay
    //     so balances + payment history will show the new charge.
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
          ? `Paid via client portal (Stripe) — incl. $${cardFeeSurcharge.toFixed(2)} card fee`
          : 'Paid via client portal (Stripe)',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single()

    if (paymentErr) {
      console.error('[stripe-charge-boarding] CRITICAL: charge succeeded but DB write failed:', paymentErr)
      return new Response(JSON.stringify({
        success: true,
        warning: 'Payment processed but record could not be saved — please contact the shop',
        payment_intent_id: paymentIntent.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 11. Auto-flip pending → confirmed if shop requires prepay
    if (requirePrepay && reservation.status === 'pending') {
      const { error: flipErr } = await supabase
        .from('boarding_reservations')
        .update({ status: 'confirmed' })
        .eq('id', reservationId)
      if (flipErr) {
        console.warn('[stripe-charge-boarding] Could not auto-confirm pending reservation:', flipErr.message)
      }
    }

    // 12. Fire-and-forget receipt email
    try {
      await supabase.functions.invoke('stripe-send-receipt', {
        body: { payment_id: paymentRow.id }
      })
    } catch (emailErr) {
      console.warn('[stripe-charge-boarding] Receipt email failed (non-fatal):', emailErr)
    }

    return new Response(JSON.stringify({
      success: true,
      payment_id: paymentRow.id,
      payment_intent_id: paymentIntent.id,
      amount_charged: amountToChargeDollars,
      service_amount: balance,
      tip_amount: tipAmount,
      card_fee: cardFeeSurcharge,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-charge-boarding] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
