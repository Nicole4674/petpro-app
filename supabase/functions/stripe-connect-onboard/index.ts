// =============================================================================
// stripe-connect-onboard
// =============================================================================
// Creates a Stripe Connect Express account for the signed-in groomer (if they
// don't have one yet) and returns a hosted onboarding URL where the groomer
// goes to verify their identity, link a bank account, etc.
//
// Flow:
//   1. Frontend calls this function from Shop Settings → "Connect Stripe"
//   2. We check if the groomer already has a stripe_connect_account_id
//   3. If not → create new Stripe Connect Express account, save the ID
//   4. Generate a one-time onboarding link (Account Link)
//   5. Return the link URL → frontend redirects the groomer to Stripe
//   6. After Stripe onboarding, Stripe redirects back to /settings/shop
//
// Sandbox mode: this function uses STRIPE_TEST_SECRET_KEY (sk_test_...)
// When ready to go live: change to STRIPE_SECRET_KEY in the line below.
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Auth check — caller must be a logged-in groomer
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError('Missing authorization', 401)
    }

    const token = authHeader.replace('Bearer ', '')

    // Use service role to bypass RLS for our internal lookups
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Resolve the user from their JWT
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) {
      return jsonError('Invalid auth token', 401)
    }

    // 2. Look up the groomer's row (by id, fall back to email for legacy mismatches)
    let { data: groomer } = await supabase
      .from('groomers')
      .select('id, email, business_name, stripe_connect_account_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!groomer && user.email) {
      const fallback = await supabase
        .from('groomers')
        .select('id, email, business_name, stripe_connect_account_id')
        .eq('email', user.email)
        .maybeSingle()
      groomer = fallback.data
    }

    if (!groomer) {
      return jsonError('Groomer record not found for this user', 404)
    }

    // 3. Init Stripe with TEST key for sandbox builds
    //    To go live: change this to 'STRIPE_SECRET_KEY'
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })

    let accountId = groomer.stripe_connect_account_id

    // 4. Create a new Connect Express account if they don't have one yet
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: groomer.email ?? undefined,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: groomer.business_name || 'Pet Grooming',
          // MCC 0742 = Veterinary Services (closest match for pet grooming)
          mcc: '0742',
          product_description: 'Pet grooming and boarding services',
        },
        settings: {
          payouts: {
            // Daily payouts per Nicole's requirement
            schedule: { interval: 'daily' }
          }
        }
      })

      accountId = account.id

      // Save the Stripe account ID + mark status as pending onboarding
      await supabase
        .from('groomers')
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_status: 'pending'
        })
        .eq('id', groomer.id)
    }

    // 5. Generate a fresh onboarding link (these expire after a few minutes)
    const origin = req.headers.get('origin') || 'https://app.trypetpro.com'

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/settings/shop?stripe_refresh=1`,
      return_url: `${origin}/settings/shop?stripe_return=1`,
      type: 'account_onboarding',
    })

    return new Response(JSON.stringify({
      url: accountLink.url,
      account_id: accountId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[stripe-connect-onboard] error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
