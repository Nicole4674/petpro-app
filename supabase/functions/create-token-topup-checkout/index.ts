// =============================================================================
// create-token-topup-checkout — DORMANT ALTERNATIVE (not deployed, not used)
// =============================================================================
// ⚠️ PRODUCTION USES THE PAYMENT LINKS + stripe-webhook INSTEAD. That flow is
// proven (verified May 3, 2026 test purchase) — see
// supabase/functions/stripe-webhook/index.ts. This file is a code-built
// alternative kept as a spare in case the payment-link flow ever needs
// rebuilding. DO NOT deploy it alongside the existing flow without removing
// the old one first.
// Mirrors the SMS-topup pattern: one-time payment on PETPRO'S platform
// account, metadata-tagged, verified + granted by confirm-token-topup.
//
// Packs are defined HERE (server-side) — the client only sends a pack key,
// so prices can't be tampered with.
//
// Request body:  { pack: '250' | '500' | '1000', return_url: string }
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

// Same packs/prices as the old Payment Links — single source of truth now.
const PACKS: Record<string, { tokens: number; cents: number; label: string }> = {
  "250":  { tokens: 250,  cents: 2499, label: "250 PetPro AI tokens" },
  "500":  { tokens: 500,  cents: 4499, label: "500 PetPro AI tokens" },
  "1000": { tokens: 1000, cents: 8499, label: "1,000 PetPro AI tokens" },
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const pack = PACKS[String(body.pack || "")]
    if (!pack) return jsonError("Unknown token pack.")
    const returnUrl = body.return_url || (req.headers.get("origin") || "") + "/settings/shop"

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

    const successUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "tokentopup=1&session_id={CHECKOUT_SESSION_ID}"
    const cancelUrl = returnUrl + (returnUrl.includes("?") ? "&" : "?") + "tokentopup=cancelled"

    // Platform account (PetPro revenue) — no stripeAccount option.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: pack.cents,
          product_data: {
            name: pack.label,
            description: "One-time charge. Tokens added instantly to your Extra balance. Never expire. No subscription.",
          },
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email || undefined,
      metadata: {
        petpro_token_topup: "true",
        groomer_id: user.id,
        tokens: String(pack.tokens),
        amount_cents: String(pack.cents),
      },
    })

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[create-token-topup] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
