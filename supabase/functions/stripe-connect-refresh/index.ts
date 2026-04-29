// =============================================================================
// stripe-connect-refresh
// =============================================================================
// Asks Stripe directly: "What's the current state of this groomer's connected
// account?" Then updates our DB so the UI shows the freshest status.
//
// Why this exists: webhooks aren't 100% reliable (network issues, missed
// events, API version mismatch). This function lets the UI ask Stripe for
// ground truth on demand. It's called:
//   • Automatically on Shop Settings page load (so status always reflects reality)
//   • When the groomer returns from Stripe onboarding (?stripe_return=1)
//   • Manually when the groomer hits a "Refresh" button
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
    if (!authHeader) {
      return jsonError('Missing authorization', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    // 2. Init Supabase admin (service role bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Resolve user → find their groomers row
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) {
      return jsonError('Invalid auth token', 401)
    }

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

    if (!groomer) {
      return jsonError('Groomer record not found', 404)
    }

    // 4. If no Stripe account ID yet, nothing to refresh — return not_started
    if (!groomer.stripe_connect_account_id) {
      return new Response(JSON.stringify({
        status: 'not_started',
        charges_enabled: false,
        payouts_enabled: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 5. Ask Stripe for current account state
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })

    let account: Stripe.Account
    try {
      account = await stripe.accounts.retrieve(groomer.stripe_connect_account_id)
    } catch (stripeErr: any) {
      console.error('[stripe-connect-refresh] Stripe API error:', stripeErr.message)
      return jsonError('Could not fetch account from Stripe: ' + stripeErr.message, 500)
    }

    // 6. Compute our app's status from Stripe's flags
    let appStatus = 'pending'
    const reqs = (account.requirements as any) || {}
    if (reqs.disabled_reason) {
      appStatus = 'restricted'
    } else if (account.charges_enabled && account.payouts_enabled) {
      appStatus = 'enabled'
    } else if (!account.details_submitted) {
      appStatus = 'pending'
    }

    // 7. Update the groomers row
    const { error: updateErr } = await supabase
      .from('groomers')
      .update({
        stripe_connect_status: appStatus,
        stripe_connect_charges_enabled: account.charges_enabled === true,
        stripe_connect_payouts_enabled: account.payouts_enabled === true,
      })
      .eq('id', groomer.id)

    if (updateErr) {
      console.error('[stripe-connect-refresh] DB update failed:', updateErr)
      return jsonError('Could not update database: ' + updateErr.message, 500)
    }

    console.log(`[stripe-connect-refresh] Refreshed acct ${account.id} → ${appStatus} (charges=${account.charges_enabled}, payouts=${account.payouts_enabled})`)

    // 8. Return the fresh state to the UI
    return new Response(JSON.stringify({
      status: appStatus,
      charges_enabled: account.charges_enabled === true,
      payouts_enabled: account.payouts_enabled === true,
      account_id: account.id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-connect-refresh] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
