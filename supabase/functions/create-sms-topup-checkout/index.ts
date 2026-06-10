// =============================================================================
// create-sms-topup-checkout — Stripe Checkout for buying extra SMS credits
// =============================================================================
// Called from the groomer dashboard when they tap "Buy 500 more texts."
// One-time $10 payment on PETPRO'S platform Stripe account (this is PetPro
// revenue — NOT the groomer's Connect account). Mirrors the punch card
// checkout pattern: inline price, metadata-tagged, confirmed server-side.
//
// On success Stripe redirects to <return_url>?smstopup=1&session_id=...
// where confirm-sms-topup verifies payment and grants the credits.
//
// Request body:  { return_url: string }
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

// The top-up product. One option keeps the decision instant — "$10, 500
// texts, done." (More sizes later if groomers ask.)
const TOPUP_SMS = 500
const TOPUP_PRICE_CENTS = 1000   // $10.00

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const returnUrl = body.return_url || (req.headers.get("origin") || "") + "/clients"

    // ─── Auth — must be a logged-in groomer ───
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })

    const successUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "smstopup=1&session_id={CHECKOUT_SESSION_ID}"
    const cancelUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "smstopup=cancelled"

    // NOTE: no stripeAccount option — this charge lands on PetPro's own
    // platform account (top-ups are PetPro revenue).
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: TOPUP_PRICE_CENTS,
          product_data: {
            name: "PetPro SMS Top-Up — " + TOPUP_SMS + " texts",
            description: "One-time charge. Texts never expire — used automatically after your monthly allowance runs out. No subscription, no recurring charge.",
          },
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email || undefined,
      metadata: {
        petpro_sms_topup: "true",
        groomer_id: user.id,
        sms_amount: String(TOPUP_SMS),
      },
    })

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[create-sms-topup] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
