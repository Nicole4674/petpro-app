// =============================================================================
// create-punch-card-checkout — Stripe Checkout for buying a punch card
// =============================================================================
// Called from the client portal when a client taps "Buy" on a punch card.
// Creates a ONE-TIME-payment Checkout Session on the GROOMER'S connected
// Stripe account (mirrors create-subscription-checkout, but mode: 'payment'
// and inline price_data — no Stripe product setup needed per card type).
//
// On success Stripe redirects to /portal?punchcard=1&session_id=... where
// confirm-punch-card verifies payment and issues the card.
//
// Request body:  { type_id: string, return_url: string }
// Returns:       { url: string } | { error: string }
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
    const typeId = body.type_id
    const returnUrl = body.return_url || (req.headers.get("origin") || "") + "/portal"
    if (!typeId) return jsonError("type_id required")

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

    const { data: clientRow } = await adminClient
      .from("clients")
      .select("id, groomer_id, first_name, last_name, email")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!clientRow) return jsonError("Client profile not found.", 403)

    // ─── Look up the punch card type ───
    const { data: cardType } = await adminClient
      .from("punch_card_types")
      .select("*")
      .eq("id", typeId)
      .eq("is_active", true)
      .single()
    if (!cardType) return jsonError("This punch card isn't available right now.", 404)
    if (cardType.groomer_id !== clientRow.groomer_id) return jsonError("That punch card isn't from your groomer.", 403)
    const priceNum = parseFloat(String(cardType.price))
    if (!priceNum || priceNum <= 0) return jsonError("This punch card isn't priced for online purchase — ask your groomer at your next visit.")

    // ─── Groomer's Connect account ───
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", cardType.groomer_id)
      .maybeSingle()
    if (!groomer || !groomer.stripe_connect_account_id || !groomer.stripe_connect_charges_enabled) {
      return jsonError("Your groomer isn't set up for online payments yet — you can buy this at your next visit instead!")
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const stripeOpts = { stripeAccount: groomer.stripe_connect_account_id }

    const successUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "punchcard=1&session_id={CHECKOUT_SESSION_ID}"
    const cancelUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "punchcard=cancelled"

    // ─── One-time payment Checkout Session — inline price, no product sync ───
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(priceNum * 100),
          product_data: {
            name: cardType.name,
            description: cardType.total_punches + " punches" +
              (cardType.expires_months ? " · valid " + cardType.expires_months + " months" : " · never expires"),
          },
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: clientRow.email || undefined,
      metadata: {
        punch_card_type_id: cardType.id,
        client_id: clientRow.id,
        groomer_id: cardType.groomer_id,
        petpro_punch_card: "true",
      },
    }, stripeOpts)

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[create-punch-checkout] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
