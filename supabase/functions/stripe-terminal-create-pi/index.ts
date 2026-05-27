// =============================================================================
// stripe-terminal-create-pi — Create PaymentIntent for Stripe Terminal sale
// =============================================================================
// Creates a card_present PaymentIntent for the in-person sale. Returns the
// client_secret which the SDK uses to collect payment from the reader.
//
// Request body:
//   {
//     amount_cents: number          // total amount in cents
//     description?: string
//     metadata?: Record<string,string>  // e.g. sale_id, appointment_id
//   }
// Response:
//   { client_secret: "pi_xxx_secret_yyy", payment_intent_id: "pi_xxx" }
//
// Stripe docs: https://stripe.com/docs/terminal/payments
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
    const body = await req.json()
    const amountCents = parseInt(body.amount_cents, 10)
    if (!amountCents || amountCents < 50) {
      return jsonError("amount_cents must be at least 50 (Stripe minimum)")
    }
    const description = (body.description || "").toString().slice(0, 200)
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {}

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
      return jsonError("Stripe Connect not set up.")
    }
    if (!groomer.stripe_connect_charges_enabled) {
      return jsonError("Stripe Connect not yet able to process charges.")
    }

    // ─── Create PaymentIntent on the groomer's account ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("STRIPE_SECRET_KEY not configured", 500)

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" })
    const pi = await stripe.paymentIntents.create({
      amount:                amountCents,
      currency:              "usd",
      payment_method_types:  ["card_present"],   // Required for Terminal
      capture_method:        "automatic",
      description:           description || "PetPro retail sale",
      metadata: {
        groomer_id: user.id,
        source: "petpro_terminal",
        ...metadata,
      },
    }, {
      stripeAccount: groomer.stripe_connect_account_id,
    })

    return new Response(JSON.stringify({
      client_secret:     pi.client_secret,
      payment_intent_id: pi.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return jsonError(err?.message || "Unknown error", 500)
  }
})
