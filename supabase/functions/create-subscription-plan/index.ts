// =============================================================================
// create-subscription-plan — Sync a PetPro subscription plan to Stripe Connect
// =============================================================================
// Called from the Subscriptions page when a groomer creates or updates a plan.
// Creates (or updates) a Stripe Product + recurring Price on the groomer's
// connected Stripe account, then writes back stripe_product_id +
// stripe_price_id to the subscription_plans row so clients can subscribe.
//
// Why this matters: subscriptions live on the groomer's OWN Stripe account
// (Connect direct charges). PetPro never touches the money. Clients pay the
// groomer; PetPro just orchestrates.
//
// Request body:
//   { plan_id: string }
//
// Returns:
//   { ok: true, stripe_product_id, stripe_price_id }
//   { error: 'reason' }
//
// Required env vars:
//   STRIPE_SECRET_KEY        — your platform Stripe key (live or test)
//   SUPABASE_URL             — auto
//   SUPABASE_SERVICE_ROLE_KEY — auto
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.10.0?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { plan_id } = await req.json()
    if (!plan_id) return jsonError("plan_id required")

    // ─── Auth: verify caller owns this plan ───
    const authHeader = req.headers.get("Authorization") || ""
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return jsonError("Not authenticated", 401)

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ─── Pull the plan + verify ownership ───
    const { data: plan, error: planErr } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("groomer_id", user.id)
      .single()
    if (planErr || !plan) return jsonError("Plan not found or not yours", 404)

    // ─── Pull groomer's Stripe Connect account ───
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id, stripe_charges_enabled")
      .eq("id", user.id)
      .maybeSingle()
    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError("Stripe not connected. Set up Stripe Connect first in Shop Settings.")
    }
    if (!groomer.stripe_charges_enabled) {
      return jsonError("Stripe Connect is not fully enabled yet. Finish onboarding in Stripe Dashboard.")
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })

    const stripeOpts = { stripeAccount: groomer.stripe_connect_account_id }

    // ─── 1. Create or update the Product ───
    let productId = plan.stripe_product_id
    if (productId) {
      // Update existing product (only mutable fields — name, description, metadata)
      try {
        await stripe.products.update(productId, {
          name: plan.name,
          description: plan.description || undefined,
          active: plan.active !== false,
          metadata: {
            plan_id: plan.id,
            groomer_id: plan.groomer_id,
            petpro_plan: "true",
          },
        }, stripeOpts)
      } catch (updErr) {
        console.warn("[create-sub-plan] product update failed, creating new:", updErr)
        productId = null  // fall through to create
      }
    }
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        active: plan.active !== false,
        metadata: {
          plan_id: plan.id,
          groomer_id: plan.groomer_id,
          petpro_plan: "true",
        },
      }, stripeOpts)
      productId = product.id
    }

    // ─── 2. Create the recurring Price ───
    // Stripe doesn't let you change a Price's amount once created. So if the
    // plan's price changed, we create a new Price and archive the old one.
    let priceId = plan.stripe_price_id
    let needNewPrice = !priceId
    if (priceId) {
      try {
        const existing = await stripe.prices.retrieve(priceId, stripeOpts)
        if (existing.unit_amount !== plan.price_cents ||
            existing.recurring?.interval !== plan.billing_interval) {
          // Price changed — archive the old one, create a new one
          await stripe.prices.update(priceId, { active: false }, stripeOpts)
          needNewPrice = true
        }
      } catch (e) {
        // Old price not found (deleted/stale) — make a new one
        needNewPrice = true
      }
    }

    if (needNewPrice) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: plan.price_cents,
        currency: "usd",
        recurring: {
          interval: plan.billing_interval,
        },
        metadata: {
          plan_id: plan.id,
          petpro_plan: "true",
        },
      }, stripeOpts)
      priceId = price.id
    }

    // ─── 3. Save IDs back to the plan row ───
    const { error: updateErr } = await adminClient
      .from("subscription_plans")
      .update({
        stripe_product_id: productId,
        stripe_price_id: priceId,
      })
      .eq("id", plan.id)
    if (updateErr) {
      console.error("[create-sub-plan] could not save Stripe IDs:", updateErr)
      // Don't fail — Stripe-side worked, the IDs just aren't saved. Groomer can retry.
    }

    return new Response(JSON.stringify({
      ok: true,
      stripe_product_id: productId,
      stripe_price_id: priceId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err: any) {
    console.error("[create-sub-plan] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
}
