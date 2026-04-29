// =============================================================================
// stripe-delete-card
// =============================================================================
// Removes a saved card. We "detach" the payment method from the customer
// — Stripe's term for unlinking a saved card from a customer record. The
// card data is then no longer reusable by us.
//
// Security: we verify the payment method actually belongs to THIS client
// before letting anyone delete it. Otherwise a malicious user could pass
// someone else's payment_method_id and wipe out their cards.
//
// Flow:
//   1. Client clicks "Remove" on a card in the portal
//   2. Frontend calls this function with { payment_method_id }
//   3. We look up: client → their groomer → groomer's connect account
//   4. We fetch the payment method from Stripe and check it really belongs
//      to THIS client's customer record
//   5. If it does → detach it. If not → 403 forbidden.
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
    // 1. Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Missing authorization', 401)
    const token = authHeader.replace('Bearer ', '')

    // 2. Read payment_method_id from request body
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }
    const paymentMethodId = body.payment_method_id
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return jsonError('payment_method_id is required', 400)
    }

    // 3. Init Supabase admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // 4. Find client by user_id
    const { data: client } = await supabase
      .from('clients')
      .select('id, groomer_id, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!client || !client.stripe_customer_id) {
      return jsonError('No Stripe customer on file', 404)
    }

    // 5. Find groomer's connect account
    const { data: groomer } = await supabase
      .from('groomers')
      .select('stripe_connect_account_id')
      .eq('id', client.groomer_id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError('Shop has no Stripe account', 400)
    }

    // 6. Init Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })
    const stripeAccountOpts = { stripeAccount: groomer.stripe_connect_account_id }

    // 7. Fetch the payment method and verify ownership BEFORE detaching
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId, stripeAccountOpts)

    if (pm.customer !== client.stripe_customer_id) {
      // Either someone is trying to delete a card that isn't theirs, or
      // it's already detached. Either way, reject.
      return jsonError('This card does not belong to your account', 403)
    }

    // 8. Detach — this is Stripe's term for "remove saved card"
    await stripe.paymentMethods.detach(paymentMethodId, stripeAccountOpts)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-delete-card] Error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
