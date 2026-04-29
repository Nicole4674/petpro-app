// =============================================================================
// stripe-setup-intent
// =============================================================================
// Lets a CLIENT (not a groomer) save a card on file with their groomer's
// Stripe Connect account. Returns a Stripe SetupIntent client_secret which
// the client portal frontend uses with Stripe Elements to collect card
// info securely (the card never touches our database — it lives entirely
// on Stripe's side).
//
// Flow:
//   1. Client clicks "Add Card" in client portal
//   2. Frontend calls this function
//   3. We look up: client → their groomer → groomer's connect account
//   4. If client has no stripe_customer_id yet → create one on the
//      groomer's connected account, save it
//   5. Create a SetupIntent on the connected account for that customer
//   6. Return client_secret + groomer's stripe account id (frontend needs
//      it to load Stripe.js with the right account context)
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
    // 1. Auth check — the caller must be a logged-in client
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError('Missing authorization', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    // 2. Init Supabase admin client (service role bypasses RLS for our lookups)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Resolve the user from their JWT
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) {
      return jsonError('Invalid auth token', 401)
    }

    // 4. Find the client record by user_id (client portal accounts link
    //    via clients.user_id → auth.users.id)
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, groomer_id, first_name, last_name, email, phone, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (clientErr || !client) {
      return jsonError('Client record not found for this user', 404)
    }

    // 5. Find the groomer (shop owner) and their Stripe Connect account
    const { data: groomer } = await supabase
      .from('groomers')
      .select('id, stripe_connect_account_id, stripe_connect_charges_enabled')
      .eq('id', client.groomer_id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError('This shop has not connected a Stripe account yet — card payments are not available.', 400)
    }

    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError('This shop is still completing Stripe setup — please try again in a few minutes.', 400)
    }

    // 6. Init Stripe (sandbox key for now)
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })

    // 7. Create a Stripe Customer on the groomer's connected account if one
    //    doesn't exist yet. We pass { stripeAccount: ... } to scope the
    //    customer to the connected account (direct-charge model).
    let customerId = client.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: [client.first_name, client.last_name].filter(Boolean).join(' ') || undefined,
        phone: client.phone || undefined,
        metadata: {
          client_id: client.id,
          groomer_id: client.groomer_id,
        }
      }, {
        stripeAccount: groomer.stripe_connect_account_id
      })
      customerId = customer.id

      // Save the customer ID so we can reuse it for future charges
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ stripe_customer_id: customerId })
        .eq('id', client.id)

      if (updateErr) {
        console.error('[stripe-setup-intent] Failed to save customer_id:', updateErr)
      }
    }

    // 8. Create a SetupIntent — this is what the frontend uses to collect
    //    a card via Stripe Elements. usage: 'off_session' lets us charge
    //    the card later without the customer being present (e.g., no-show
    //    fee, pre-pay confirmation).
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    }, {
      stripeAccount: groomer.stripe_connect_account_id
    })

    // 9. Return everything the frontend needs
    return new Response(JSON.stringify({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
      // Frontend needs this to load Stripe.js with { stripeAccount } context
      stripe_account_id: groomer.stripe_connect_account_id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-setup-intent] Error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
