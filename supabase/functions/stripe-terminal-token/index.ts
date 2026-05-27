// =============================================================================
// stripe-terminal-token — Generate a Stripe Terminal connection token
// =============================================================================
// The Stripe Terminal JS SDK needs a connection_token to authenticate with
// Stripe before discovering / connecting to a reader. This endpoint mints
// one on demand, scoped to the groomer's Connect account so the reader bills
// the groomer directly (not PetPro).
//
// Tokens are short-lived (single-use) — the SDK calls this endpoint each
// time it needs one.
//
// Request body: {} (auth header identifies the groomer)
// Response: { secret: "pst_xxx..." }
//
// Stripe docs: https://stripe.com/docs/terminal/payments/connection-tokens
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    // ─── Auth ──
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

    // ─── Get groomer's Connect account ──
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", user.id)
      .maybeSingle()

    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError("Stripe Connect not set up. Finish Stripe Connect onboarding first.")
    }
    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError("Stripe Connect not yet able to process charges. Finish Stripe onboarding.")
    }

    // ─── Mint a connection token scoped to the groomer's account ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("STRIPE_SECRET_KEY not configured", 500)

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" })
    const token = await stripe.terminal.connectionTokens.create({}, {
      stripeAccount: groomer.stripe_connect_account_id,
    })

    return new Response(JSON.stringify({ secret: token.secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return jsonError(err?.message || "Unknown error", 500)
  }
})
