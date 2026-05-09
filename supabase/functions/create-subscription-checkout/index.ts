// =============================================================================
// create-subscription-checkout — Start a Stripe Checkout for a subscription
// =============================================================================
// Called from the client portal when a client clicks "Subscribe" on a plan.
// Creates a Stripe Checkout Session in subscription mode, on the GROOMER'S
// connected Stripe account (direct charge / Connect). Returns the URL so we
// can redirect the client to Stripe's hosted checkout.
//
// On successful payment, Stripe redirects them back to /portal?subscribed=1
// where confirm-subscription writes the row to client_subscriptions.
//
// Request body:
//   { plan_id: string, return_url: string }
//
// Returns:
//   { url: string }   — Checkout URL to redirect to
//   { error: string } — failure reason
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const planId = body.plan_id
    const returnUrl = body.return_url || (req.headers.get("origin") || "") + "/portal"
    if (!planId) return jsonError("plan_id required")

    // ─── Auth — must be a logged-in client ───
    const authHeader = req.headers.get("Authorization") || ""
    const jwt = authHeader.replace(/^Bearer\s+/i, "")
    if (!jwt) return jsonError("Not authenticated", 401)

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(jwt)
    if (authErr || !user) return jsonError("Not authenticated", 401)

    // ─── Look up the client ─── (must own this auth user)
    const { data: clientRow } = await adminClient
      .from("clients")
      .select("id, groomer_id, first_name, last_name, email")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!clientRow) return jsonError("Client profile not found.", 403)

    // ─── Look up the plan ───
    const { data: plan } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("active", true)
      .single()
    if (!plan) return jsonError("Plan not available.", 404)
    if (plan.groomer_id !== clientRow.groomer_id) return jsonError("Plan is not from your groomer.", 403)
    if (!plan.stripe_price_id) return jsonError("Plan isn't fully set up yet — please contact your groomer.")

    // ─── Look up groomer's Connect account ───
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", plan.groomer_id)
      .maybeSingle()
    if (!groomer || !groomer.stripe_connect_account_id || !groomer.stripe_connect_charges_enabled) {
      return jsonError("Your groomer's Stripe isn't ready for subscriptions yet.")
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const stripeOpts = { stripeAccount: groomer.stripe_connect_account_id }

    // ─── Build success URL with session_id placeholder so we can confirm ───
    const successUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "subscribed=1&session_id={CHECKOUT_SESSION_ID}"
    const cancelUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "subscribed=cancelled"

    // ─── Create Checkout Session ───
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: clientRow.email || undefined,
      metadata: {
        plan_id: plan.id,
        client_id: clientRow.id,
        groomer_id: plan.groomer_id,
        petpro_subscription: "true",
      },
      subscription_data: {
        metadata: {
          plan_id: plan.id,
          client_id: clientRow.id,
          groomer_id: plan.groomer_id,
        },
      },
    }, stripeOpts)

    // ─── Pre-create a pending subscription row so the client portal can show "pending" state ───
    // Will be updated to 'active' when confirm-subscription runs after Stripe checkout returns.
    await adminClient.from("client_subscriptions").insert({
      groomer_id: plan.groomer_id,
      client_id: clientRow.id,
      plan_id: plan.id,
      status: "pending",
    }).select("id").maybeSingle()

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[create-sub-checkout] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
