// =============================================================================
// stripe-subscription-webhook — Listen for subscription events from Stripe
// =============================================================================
// ⚠️ SYNCED WITH THE DEPLOYED VERSION on Jun 11, 2026 (Nicole pasted the
// dashboard copy; charge.refunded handling was merged in at the same time).
// If you edit this file, deploy it with:
//   supabase functions deploy stripe-subscription-webhook
//
// Stripe POSTs to this endpoint whenever something happens to a subscription
// that PetPro didn't directly initiate — auto-renewals, failed payments,
// cancellations made in Stripe Dashboard, etc.
//
// Without this, the database drifts: PetPro shows "active" + an old renewal
// date long after the real status changed in Stripe.
//
// Because subscriptions live on the GROOMER's connected Stripe account
// (Connect direct charges), we configure this as a CONNECT webhook in Stripe
// Dashboard ("PetPro Subscription Events" destination). Events come in with
// an `account` field telling us which connected account they came from.
//
// Events handled:
//   invoice.payment_succeeded      → renewal worked, roll period dates forward
//   invoice.payment_failed         → mark sub as past_due
//   customer.subscription.updated  → sync status + period dates + cancel flag
//   customer.subscription.deleted  → mark sub as canceled
//   charge.refunded                → 🎟️ punch card purchase refunded →
//                                    auto-pause the card (added Jun 11 2026)
//
// Required env vars:
//   STRIPE_SECRET_KEY — your platform Stripe key
//   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET — signing secret for THIS endpoint
//     (falls back to STRIPE_WEBHOOK_SECRET, which the previously-deployed
//      version used. Each Stripe endpoint has its OWN whsec_, and the
//      platform stripe-webhook also reads STRIPE_WEBHOOK_SECRET — so setting
//      the dedicated var avoids the two endpoints fighting over one secret.)
//   SUPABASE_URL               — auto
//   SUPABASE_SERVICE_ROLE_KEY  — auto
//
// One-time setup (after deploying):
//   1. Stripe Dashboard → Developers → Webhooks → "PetPro Subscription Events"
//   2. Endpoint URL: https://<project-ref>.supabase.co/functions/v1/stripe-subscription-webhook
//   3. Listen to: "Events on Connected accounts" (CRITICAL — not "Your account")
//   4. Events: the 4 subscription events above + charge.refunded
//   5. Reveal this endpoint's "Signing secret" (whsec_...) → save it in
//      Supabase → Edge Functions → Secrets as STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
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
  // Dedicated secret for this endpoint, falling back to the shared var the
  // previously-deployed version used (preserves current behavior exactly).
  const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET") ||
    Deno.env.get("STRIPE_WEBHOOK_SECRET")
  if (!stripeKey || !webhookSecret) {
    console.error("[sub-webhook] Missing STRIPE_SECRET_KEY or webhook secret")
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

      case "charge.refunded": {
        // 🎟️ Punch card refund → auto-pause the card so refunded punches
        // can't keep being redeemed at checkout. Matched on the payment
        // intent saved by confirm-punch-card at purchase time. Most refunds
        // are regular groom payments with no matching card — those fall
        // through silently. In-person card sales (cash/Zelle) have no Stripe
        // payment, so their refunds stay manual (Pause button on the
        // Punch Cards page).
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent as any)?.id ?? null
        if (!paymentIntentId) break

        const { data: refundedCards, error: refundErr } = await adminClient
          .from("punch_cards")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", paymentIntentId)
          .neq("status", "refunded")
          .select("id, name, client_id, punches_remaining")
        if (refundErr) {
          console.error("[sub-webhook] punch card refund-pause failed:", refundErr)
          break
        }
        if (refundedCards && refundedCards.length > 0) {
          refundedCards.forEach((c: any) => {
            console.log(`[sub-webhook] 🎟️ Punch card ${c.id} ("${c.name}") auto-paused after refund — ${c.punches_remaining} unused punches voided`)
          })
        } else {
          console.log(`[sub-webhook] charge.refunded ${paymentIntentId} matched no punch cards (normal for groom-payment refunds)`)
        }
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
