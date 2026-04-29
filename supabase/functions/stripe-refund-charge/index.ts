// =============================================================================
// stripe-refund-charge
// =============================================================================
// Refunds a Stripe charge through the groomer's Connect account. Triggered
// from the appointment popup on the groomer side when they click "Refund"
// on a Stripe-paid payment row.
//
// Supports partial refunds — pass an `amount` in dollars to refund less than
// the original charge. Omit `amount` to refund the full remaining balance.
//
// Flow:
//   1. Frontend (groomer-side) sends: { payment_id, amount? }
//   2. Auth check — caller must be the groomer who owns this payment
//   3. Look up the payment row → verify it has stripe_payment_intent_id
//   4. Verify not already fully refunded
//   5. Call Stripe refunds.create on the connected account
//   6. Update payments row with refunded_amount, refunded_at, stripe_refund_id
//   7. Return success
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

    const paymentId = body.payment_id
    const requestedAmount = body.amount != null ? parseFloat(body.amount) : null

    if (!paymentId) return jsonError('payment_id is required', 400)
    if (requestedAmount != null && (isNaN(requestedAmount) || requestedAmount <= 0)) {
      return jsonError('amount must be a positive number', 400)
    }

    // 3. Init Supabase admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // 4. Look up the payment row
    const { data: payment } = await supabase
      .from('payments')
      .select('id, groomer_id, amount, tip_amount, stripe_payment_intent_id, refunded_amount, method')
      .eq('id', paymentId)
      .maybeSingle()

    if (!payment) return jsonError('Payment not found', 404)
    if (!payment.stripe_payment_intent_id) {
      return jsonError('This payment was not processed through Stripe and cannot be refunded here', 400)
    }

    // 5. Verify caller is the groomer that owns this payment.
    //     Look up by id first, then fall back to email (legacy mismatches).
    let { data: groomer } = await supabase
      .from('groomers')
      .select('id, email, stripe_connect_account_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!groomer && user.email) {
      const fb = await supabase
        .from('groomers')
        .select('id, email, stripe_connect_account_id')
        .eq('email', user.email)
        .maybeSingle()
      groomer = fb.data
    }

    if (!groomer) return jsonError('Groomer record not found', 404)
    if (groomer.id !== payment.groomer_id) {
      return jsonError('This payment does not belong to your shop', 403)
    }
    if (!groomer.stripe_connect_account_id) {
      return jsonError('No Stripe Connect account on file for this shop', 400)
    }

    // 6. Compute refund amount (and verify not already fully refunded)
    const totalCharged = parseFloat(payment.amount || 0) + parseFloat(payment.tip_amount || 0)
    const alreadyRefunded = parseFloat(payment.refunded_amount || 0)
    const refundableLeft = totalCharged - alreadyRefunded

    if (refundableLeft <= 0.001) {
      return jsonError('This payment has already been fully refunded', 400)
    }

    const refundDollars = requestedAmount != null ? requestedAmount : refundableLeft
    if (refundDollars > refundableLeft + 0.001) {
      return jsonError(`Refund amount ($${refundDollars.toFixed(2)}) exceeds remaining refundable balance ($${refundableLeft.toFixed(2)})`, 400)
    }

    // 7. Init Stripe + create refund on connected account
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })
    const stripeAccountOpts = { stripeAccount: groomer.stripe_connect_account_id }

    let refund: Stripe.Refund
    try {
      refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: Math.round(refundDollars * 100),  // dollars → cents
        metadata: {
          payment_id: paymentId,
          groomer_id: groomer.id,
          initiated_by: 'groomer_portal',
        }
      }, stripeAccountOpts)
    } catch (stripeErr: any) {
      console.error('[stripe-refund-charge] Stripe error:', stripeErr.message)
      return jsonError(stripeErr.message || 'Refund failed at Stripe', 502)
    }

    if (refund.status !== 'succeeded' && refund.status !== 'pending') {
      return jsonError(`Refund ${refund.status} — please try again or contact Stripe`, 502)
    }

    // 8. Update the payment row with refund info. We track cumulative
    //    refunded_amount so multiple partial refunds add up correctly.
    const newRefundedTotal = alreadyRefunded + refundDollars

    const { error: updateErr } = await supabase
      .from('payments')
      .update({
        refunded_amount: newRefundedTotal,
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refund.id,
      })
      .eq('id', paymentId)

    if (updateErr) {
      console.error('[stripe-refund-charge] DB update failed after refund succeeded:', updateErr)
      // Refund went through on Stripe's side. Returning success with a warning
      // since the money IS refunded.
      return new Response(JSON.stringify({
        success: true,
        warning: 'Refund processed at Stripe but record could not be saved — please contact support',
        stripe_refund_id: refund.id,
        refunded_amount: refundDollars,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 9. Done!
    return new Response(JSON.stringify({
      success: true,
      refunded_amount: refundDollars,
      total_refunded: newRefundedTotal,
      stripe_refund_id: refund.id,
      stripe_status: refund.status,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-refund-charge] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
