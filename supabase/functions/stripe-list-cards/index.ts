// =============================================================================
// stripe-list-cards
// =============================================================================
// Lists the saved cards for a logged-in client. Returns safe display info
// only — brand (Visa/MC/etc), last 4 digits, expiration month/year, and
// whether each card is the customer's default. The full card number is
// never sent to or stored in our system.
//
// Flow:
//   1. Client portal calls this when loading the "My Cards" page
//   2. We look up: client → their groomer → groomer's connect account
//   3. If client has no stripe_customer_id yet → return empty list
//   4. Ask Stripe for payment methods on the connected account
//   5. Mark which one is default (from customer.invoice_settings)
//   6. Return clean list to frontend
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
    // 1. Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Missing authorization', 401)
    const token = authHeader.replace('Bearer ', '')

    // Optional body — if a client_id is supplied, this is a GROOMER asking
    // for that client's cards (e.g. ringing them up at the front desk).
    // If no body, it's a CLIENT asking for their own cards (portal flow).
    let bodyClientId: string | null = null
    try {
      const body = await req.json()
      if (body && typeof body.client_id === 'string') bodyClientId = body.client_id
    } catch { /* no body — that's fine, defaults to client-portal mode */ }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // 2. Resolve which client's cards we're listing
    let client: any = null

    if (bodyClientId) {
      // GROOMER MODE — verify caller is a groomer that owns this client
      let { data: groomer } = await supabase
        .from('groomers')
        .select('id, email')
        .eq('id', user.id)
        .maybeSingle()
      if (!groomer && user.email) {
        const fb = await supabase
          .from('groomers')
          .select('id, email')
          .eq('email', user.email)
          .maybeSingle()
        groomer = fb.data
      }
      if (!groomer) return jsonError('Only groomers can list a specific client\'s cards', 403)

      const { data: targetClient } = await supabase
        .from('clients')
        .select('id, groomer_id, stripe_customer_id')
        .eq('id', bodyClientId)
        .maybeSingle()
      if (!targetClient) return jsonError('Client not found', 404)
      if (targetClient.groomer_id !== groomer.id) {
        return jsonError('This client does not belong to your shop', 403)
      }
      client = targetClient
    } else {
      // CLIENT-PORTAL MODE — find client by their auth user_id
      const { data: ownClient } = await supabase
        .from('clients')
        .select('id, groomer_id, stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!ownClient) return jsonError('Client record not found', 404)
      client = ownClient
    }

    // 3. If client has no Stripe customer yet, they have no cards
    if (!client.stripe_customer_id) {
      return new Response(JSON.stringify({ cards: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Find groomer's connect account
    const { data: groomer } = await supabase
      .from('groomers')
      .select('stripe_connect_account_id')
      .eq('id', client.groomer_id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return new Response(JSON.stringify({ cards: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 5. Init Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_TEST_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })

    const stripeAccountOpts = { stripeAccount: groomer.stripe_connect_account_id }

    // 6. Fetch payment methods AND customer in parallel (we need both —
    //    payment methods for the list, customer for the default card flag)
    const [pmList, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: client.stripe_customer_id,
        type: 'card',
        limit: 20,
      }, stripeAccountOpts),
      stripe.customers.retrieve(client.stripe_customer_id, stripeAccountOpts)
    ])

    const defaultPmId = (customer && !('deleted' in customer))
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null

    // 7. Build a clean response — only safe display data, never card_number
    const cards = (pmList.data || []).map(pm => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',           // 'visa', 'mastercard', 'amex', etc
      last4: pm.card?.last4 || '••••',
      exp_month: pm.card?.exp_month || null,
      exp_year: pm.card?.exp_year || null,
      is_default: pm.id === defaultPmId,
      created: pm.created,
    }))

    return new Response(JSON.stringify({ cards }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-list-cards] Error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
