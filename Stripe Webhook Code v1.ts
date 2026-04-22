// =============================================================================
// PetPro Stripe Webhook Handler v1
// =============================================================================
// Purpose: Listen for Stripe subscription events and sync them to the
//          groomers table in Supabase so the app knows who is on which tier.
//
// Events handled:
//   - checkout.session.completed    -> new subscription created
//   - customer.subscription.updated -> tier changed, trial ending, status change
//   - customer.subscription.deleted -> subscription canceled
//   - invoice.payment_failed        -> card declined, mark past_due
//   - invoice.payment_succeeded     -> payment cleared, back to active
//
// Deploy: Supabase Dashboard -> Edge Functions -> "Deploy a new function" ->
//         "Via editor" -> Function name: stripe-webhook -> paste this code.
//
// Required secrets (add in Supabase Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY       (starts with sk_test_ in sandbox, sk_live_ in prod)
//   STRIPE_WEBHOOK_SECRET   (starts with whsec_, given by Stripe when you
//                            register the webhook endpoint)
//
// Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
//       by Supabase to every Edge Function - no need to set those.
//
// Date: April 22, 2026
// Task: #91
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

// ---------------------------------------------------------------------------
// Init Stripe + Supabase clients
// ---------------------------------------------------------------------------

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Required for Stripe signature verification in the Deno / edge runtime
const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Service-role client = full database access, bypasses Row Level Security.
// Safe to use here because this function only runs on Supabase's servers
// and is not exposed to browsers.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ---------------------------------------------------------------------------
// Price ID -> Tier mapping (SANDBOX)
// When we go LIVE, these IDs will change - see "Stripe Price IDs.md"
// ---------------------------------------------------------------------------

const PRICE_TO_TIER: Record<string, string> = {
  'price_1TOtWmLx8nm3a7PZNUYZuMbt': 'basic',     // $70
  'price_1TOtqULx8nm3a7PZMlqDZaHa': 'pro',       // $129
  'price_1TOtupLx8nm3a7PZYktElWcP': 'pro_plus',  // $199
  'price_1TOtzFLx8nm3a7PZI6CsmUIO': 'growing',   // $399
}

// Helper: convert Stripe's unix-second timestamp to an ISO string (or null)
function tsToIso(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // 1. Verify this request actually came from Stripe (not a bad actor)
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    )
  } catch (err) {
    console.error('Signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Received event: ${event.type} (${event.id})`)

  // 2. Route the event to the right handler
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      }
      default:
        // We don't care about this event type - tell Stripe we got it so it
        // doesn't keep retrying.
        console.log(`Ignoring event type: ${event.type}`)
    }
  } catch (err) {
    console.error('Handler error:', err)
    return new Response(`Handler Error: ${err.message}`, { status: 500 })
  }

  // 3. Acknowledge receipt so Stripe stops retrying
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// NEW SUBSCRIPTION: fires when a groomer finishes Stripe checkout.
// We use client_reference_id (passed in the Subscribe URL) to know which
// groomer row to update.
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const groomerId = session.client_reference_id
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

  if (!groomerId) {
    console.warn('checkout.session.completed had no client_reference_id. Cannot match to a groomer.')
    return
  }
  if (!subscriptionId) {
    console.warn('No subscription on this session (one-time payment?). Skipping.')
    return
  }

  // Fetch full subscription details so we know price, status, trial end
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? PRICE_TO_TIER[priceId] ?? null : null

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      trial_ends_at: tsToIso(subscription.trial_end),
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('id', groomerId)

  if (error) throw error
  console.log(`Groomer ${groomerId} subscribed to ${tier} (status: ${subscription.status})`)
}

// TIER CHANGE / TRIAL END / STATUS CHANGE
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? PRICE_TO_TIER[priceId] ?? null : null

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      trial_ends_at: tsToIso(subscription.trial_end),
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Subscription updated for customer ${customerId}: ${tier} / ${subscription.status}`)
}

// CANCELLATION
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: null,
      subscription_status: 'canceled',
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Subscription canceled for customer ${customerId}`)
}

// CARD DECLINED
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const { error } = await supabase
    .from('groomers')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Payment failed for customer ${customerId}, marked past_due`)
}

// PAYMENT CLEARED (e.g. after a past_due groomer updates their card)
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  // Only flip back to active if currently past_due - don't overwrite trialing etc.
  const { error } = await supabase
    .from('groomers')
    .update({ subscription_status: 'active' })
    .eq('stripe_customer_id', customerId)
    .eq('subscription_status', 'past_due')

  if (error) throw error
}
