// =============================================================================
// stripe-subscription-webhook — Listen for subscription events from Stripe
// =============================================================================
// Stripe POSTs to this endpoint whenever something happens to a subscription
// that PetPro didn't directly initiate — auto-renewals, failed payments,
// cancellations made in Stripe Dashboard, etc.
//
// Without this, the database drifts: PetPro shows "active" + an old renewal
// date long after the real status changed in Stripe.
//
// Because subscriptions live on the GROOMER's connected Stripe account
// (Connect direct charges), we configure this as a CONNECT webhook in Stripe
// Dashboard. Events come in with an `account` field telling us which
// connected account they came from.
//
// Events handled:
//   invoice.payment_succeeded      → renewal worked, roll period dates forward
//   invoice.payment_failed         → mark sub as past_due
//   customer.subscription.updated  → sync status + period dates + cancel flag
//   customer.subscription.deleted  → mark sub as canceled
//
// Required env vars:
//   STRIPE_SECRET_KEY          — your platform Stripe key
//   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET      — the signing secret from Stripe Dashboard for THIS endpoint
//   SUPABASE_URL               — auto
//   SUPABASE_SERVICE_ROLE_KEY  — auto
//
// One-time setup (after deploying):
//   1. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
//   2. Endpoint URL: https://<project-ref>.supabase.co/functions/v1/stripe-subscription-webhook
//   3. Listen to: "Events on Connected accounts" (CRITICAL — not "Your account")
//   4. Pick events: the 4 listed above
//   5. Copy "Signing secret" → save as STRIPE_SUBSCRIPTION_WEBHOOK_SECRET in Supabase
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.10.0?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

// Webhooks must respond 200 fast (Stripe retries on non-2xx). We don't add
// CORS — Stripe POSTs server-to-server, no browser involved.

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
  const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET")
  if (!stripeKey || !webhookSecret) {
    console.error("[sub-webhook] Missing STRIPE_SECRET_KEY or STRIPE_SUBSCRIPTION_WEBHOOK_SECRET")
    return new Response("Server not configured", { status: 500 })
  }

  // ─── Verify the signature ─────────────────────────────────────────────
  // Stripe signs every webhook with HMAC. If signature doesn't match, the
  // request is fake (or the secret is wrong) — we MUST reject.
  // Use the RAW body — JSON.parse + restringify breaks the signature.
  const rawBody = await req.text()
  const sig = req.headers.get("stripe-signature") || ""
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret)
  } catch (err: any) {
    console.error("[sub-webhook] Signature verification failed:", err.message)
    return new Response("Invalid signature", { status: 400 })
  }

  // ─── Connect account context ──────────────────────────────────────────
  // For Connect events, `event.account` is the connected account ID. If it's
  // missing this isn't a Connect event — log and ignore (we only care about
  // events from groomer accounts).
  const connectedAccountId = (event as any).account as string | undefined
  if (!connectedAccountId) {
    console.log("[sub-webhook] Non-Connect event, ignoring:", event.type)
    return new Response("ok", { status: 200 })
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  console.log(`[sub-webhook] event=${event.type} account=${connectedAccountId}`)

  // ─── Route by event type ──────────────────────────────────────────────
  try {
    switch (event.type) {
      case "invoice.payment_succeeded": {
        // A subscription invoice was paid. Roll period dates forward.
        const invoice = event.data.object as Stripe.Invoice
        // Sub-related invoices have a `subscription` field
        const subId = (invoice as any).subscription as string | undefined
        if (!subId) break
        await syncSubscriptionFromStripe(adminClient, stripe, subId, connectedAccountId, "active")
        break
      }

      case "invoice.payment_failed": {
        // Card declined or other payment issue — mark past_due so groomer can chase.
        const invoice = event.data.object as Stripe.Invoice
        const subId = (invoice as any).subscription as string | undefined
        if (!subId) break
        await adminClient
          .from("client_subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId)
        console.log(`[sub-webhook] Marked ${subId} as past_due`)
        break
      }

      case "customer.subscription.updated": {
        // Catches everything else: cancel toggled, plan changed, status flip
        // back to active after past_due, etc. We re-pull from Stripe and
        // sync everything to be safe.
        const sub = event.data.object as Stripe.Subscription
        await syncSubscriptionFromStripe(adminClient, stripe, sub.id, connectedAccountId)
        break
      }

      case "customer.subscription.deleted": {
        // Sub fully terminated in Stripe (either by us, the groomer in Stripe
        // Dashboard, or because all retries failed and Stripe gave up).
        const sub = event.data.object as Stripe.Subscription
        await adminClient
          .from("client_subscriptions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            cancel_at_period_end: false,  // already canceled, no point waiting
          })
          .eq("stripe_subscription_id", sub.id)
        console.log(`[sub-webhook] Canceled ${sub.id}`)
        break
      }

      default:
        // Don't error on unknown events — Stripe ships new ones over time
        // and we don't want our endpoint to start 500-ing if they add one.
        console.log(`[sub-webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err: any) {
    console.error("[sub-webhook] Handler error:", err.message)
    // Return 500 so Stripe retries (gives DB a chance to recover from
    // transient failures). For permanent errors this'll keep retrying for
    // a few days then stop — check Stripe Dashboard → Webhooks for failures.
    return new Response("Handler error: " + err.message, { status: 500 })
  }

  return new Response("ok", { status: 200 })
})

// Pull the latest sub state from Stripe and overwrite our row. Defensive —
// if Stripe and PetPro got out of sync for any reason this brings us back.
async function syncSubscriptionFromStripe(
  adminClient: any,
  stripe: Stripe,
  stripeSubId: string,
  connectedAccountId: string,
  forceStatus?: string,
) {
  const sub = await stripe.subscriptions.retrieve(stripeSubId, {
    stripeAccount: connectedAccountId,
  })
  const update: any = {
    status: forceStatus || sub.status || "active",
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_start: (sub as any).current_period_start
      ? new Date((sub as any).current_period_start * 1000).toISOString()
      : null,
    current_period_end: (sub as any).current_period_end
      ? new Date((sub as any).current_period_end * 1000).toISOString()
      : null,
  }
  if (sub.canceled_at) {
    update.canceled_at = new Date(sub.canceled_at * 1000).toISOString()
  }
  const { error } = await adminClient
    .from("client_subscriptions")
    .update(update)
    .eq("stripe_subscription_id", stripeSubId)
  if (error) throw error
  console.log(`[sub-webhook] Synced ${stripeSubId} status=${update.status} period_end=${update.current_period_end}`)
}
