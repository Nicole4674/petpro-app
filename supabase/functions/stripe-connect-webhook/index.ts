// =============================================================================
// stripe-connect-webhook
// =============================================================================
// Receives webhook events from Stripe about Connected accounts (i.e. the
// individual groomer accounts our platform creates). Whenever something
// changes on Stripe's side — onboarding finished, capabilities enabled,
// account restricted — Stripe POSTs an event here and we update our DB
// so the groomer's UI reflects the latest state.
//
// Events we listen for:
//   • account.updated — fires for nearly any change. We use this to
//     update charges_enabled, payouts_enabled, and overall status.
//   • capability.updated — fires when a specific capability flips
//     (card_payments, transfers). Same DB updates — we stay redundant
//     so we never miss a state change.
//
// Setup (one-time, in Stripe Dashboard):
//   1. Stripe Sandbox → Developers → Webhooks
//   2. Click "+ Add an event destination" → "Connected accounts"
//      (NOT the regular "Your account" tab — Connect events come from
//      a separate destination type)
//   3. Endpoint URL:
//      https://<your-project>.supabase.co/functions/v1/stripe-connect-webhook
//   4. Events to send: account.updated, capability.updated
//   5. After saving, Stripe shows a "Signing secret" (starts with whsec_).
//      Copy it.
//   6. In Supabase → Edge Functions → Secrets, add a new secret:
//      Name: STRIPE_CONNECT_WEBHOOK_SECRET
//      Value: paste the whsec_ value from Stripe
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.10.0?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    // 1. Read the raw body — needed for signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      console.error('[stripe-connect-webhook] Missing stripe-signature header')
      return new Response('Missing signature', { status: 400, headers: corsHeaders })
    }

    // 2. Init Stripe with the TEST secret key (sandbox mode)
    //    To go live: change STRIPE_TEST_SECRET_KEY → STRIPE_SECRET_KEY
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2024-04-10',
    })

    const webhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? ''
    if (!webhookSecret) {
      console.error('[stripe-connect-webhook] STRIPE_CONNECT_WEBHOOK_SECRET not configured')
      return new Response('Webhook secret not configured', { status: 500, headers: corsHeaders })
    }

    // 3. Verify the signature — proves the request really came from Stripe
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret
      )
    } catch (verifyErr: any) {
      console.error('[stripe-connect-webhook] Signature verification failed:', verifyErr.message)
      return new Response(`Webhook signature error: ${verifyErr.message}`, {
        status: 400,
        headers: corsHeaders
      })
    }

    console.log(`[stripe-connect-webhook] Event: ${event.type} (${event.id})`)

    // 4. Init Supabase admin client (service role bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 5. Handle the event
    switch (event.type) {
      case 'account.updated': {
        // The data.object is the Account itself
        const account = event.data.object as Stripe.Account

        // Compute our app's status from Stripe's flags:
        //   • details_submitted false → still onboarding (pending)
        //   • charges_enabled true + payouts_enabled true → enabled
        //   • requirements.disabled_reason set → restricted
        //   • else → pending
        let appStatus = 'pending'
        const reqs = (account.requirements as any) || {}
        if (reqs.disabled_reason) {
          appStatus = 'restricted'
        } else if (account.charges_enabled && account.payouts_enabled) {
          appStatus = 'enabled'
        } else if (!account.details_submitted) {
          appStatus = 'pending'
        }

        // Update the groomer row matching this account_id
        const { error: updateErr } = await supabase
          .from('groomers')
          .update({
            stripe_connect_status: appStatus,
            stripe_connect_charges_enabled: account.charges_enabled === true,
            stripe_connect_payouts_enabled: account.payouts_enabled === true,
          })
          .eq('stripe_connect_account_id', account.id)

        if (updateErr) {
          console.error('[stripe-connect-webhook] DB update failed:', updateErr)
        } else {
          console.log(`[stripe-connect-webhook] Updated groomer for acct ${account.id} → ${appStatus}`)
        }
        break
      }

      case 'capability.updated': {
        // Capability change — fetch the parent account to get fresh flags
        const capability = event.data.object as Stripe.Capability
        const accountId = typeof capability.account === 'string'
          ? capability.account
          : capability.account?.id

        if (!accountId) break

        try {
          const account = await stripe.accounts.retrieve(accountId)

          let appStatus = 'pending'
          const reqs = (account.requirements as any) || {}
          if (reqs.disabled_reason) appStatus = 'restricted'
          else if (account.charges_enabled && account.payouts_enabled) appStatus = 'enabled'

          await supabase
            .from('groomers')
            .update({
              stripe_connect_status: appStatus,
              stripe_connect_charges_enabled: account.charges_enabled === true,
              stripe_connect_payouts_enabled: account.payouts_enabled === true,
            })
            .eq('stripe_connect_account_id', accountId)

          console.log(`[stripe-connect-webhook] Capability update synced for ${accountId}`)
        } catch (fetchErr) {
          console.error('[stripe-connect-webhook] Capability sync failed:', fetchErr)
        }
        break
      }

      default:
        // Other events — log and acknowledge so Stripe doesn't retry
        console.log(`[stripe-connect-webhook] Ignoring event: ${event.type}`)
    }

    // 6. Always 200 once we've processed (or chosen to ignore) the event,
    //    otherwise Stripe will retry forever.
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[stripe-connect-webhook] Unexpected error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
