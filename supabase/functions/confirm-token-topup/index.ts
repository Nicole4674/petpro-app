// =============================================================================
// confirm-token-topup — DORMANT ALTERNATIVE (not deployed, not used)
// =============================================================================
// ⚠️ PRODUCTION USES THE PAYMENT LINKS + stripe-webhook INSTEAD (see
// supabase/functions/stripe-webhook/index.ts — verified working May 3, 2026).
// This is the confirm half of the spare code-built flow. Keep undeployed.
//
// Called when Stripe redirects back with ?tokentopup=1&session_id=... .
// Verifies the session was PAID on PetPro's platform account, then:
//   1. Logs into token_purchases (unique session index = idempotent)
//   2. Grants topup_tokens_remaining += tokens (never expire)
//   3. Bumps lifetime_tokens_purchased for the stats badge
//
// Request body:  { session_id: string }
// Returns:       { granted: true, tokens_added, topup_remaining }
//             | { granted: false, reason } | { error }
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
    const sessionId = body.session_id
    if (!sessionId) return jsonError("session_id required")

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

    // ─── Already granted? (refresh / double redirect) ───
    const { data: existing } = await adminClient
      .from("token_purchases")
      .select("id, pack_size, status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()
    if (existing && existing.status === "completed") {
      const { data: bal0 } = await adminClient
        .from("groomer_token_balance")
        .select("topup_tokens_remaining")
        .eq("groomer_id", user.id)
        .maybeSingle()
      return jsonOk({ granted: true, already: true, tokens_added: existing.pack_size, topup_remaining: bal0?.topup_tokens_remaining ?? null })
    }

    // ─── Verify with Stripe (platform account) ───
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session || session.metadata?.petpro_token_topup !== "true") {
      return jsonError("That checkout session isn't a token top-up.", 400)
    }
    if (session.metadata?.groomer_id !== user.id) {
      return jsonError("This purchase belongs to a different account.", 403)
    }
    if (session.payment_status !== "paid") {
      return jsonOk({ granted: false, reason: "Payment not completed (" + session.payment_status + "). If you just paid, wait a few seconds and try again." })
    }

    const tokens = parseInt(session.metadata?.tokens || "0", 10) || 0
    if (tokens <= 0) return jsonError("Invalid token amount on session.", 400)

    // ─── Log first (unique session index = idempotency gate) ───
    const { error: logErr } = await adminClient.from("token_purchases").insert({
      groomer_id: user.id,
      pack_size: tokens,
      amount_cents: session.amount_total || 0,
      stripe_session_id: sessionId,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    if (logErr) {
      // Unique violation = another request won the race — report success
      const { data: bal1 } = await adminClient
        .from("groomer_token_balance")
        .select("topup_tokens_remaining")
        .eq("groomer_id", user.id)
        .maybeSingle()
      return jsonOk({ granted: true, already: true, tokens_added: tokens, topup_remaining: bal1?.topup_tokens_remaining ?? null })
    }

    // ─── Grant to the never-expire top-up bucket ───
    const { data: balRow } = await adminClient
      .from("groomer_token_balance")
      .select("topup_tokens_remaining, lifetime_tokens_purchased")
      .eq("groomer_id", user.id)
      .maybeSingle()

    let newTopup = tokens
    if (balRow) {
      newTopup = (balRow.topup_tokens_remaining || 0) + tokens
      await adminClient
        .from("groomer_token_balance")
        .update({
          topup_tokens_remaining: newTopup,
          lifetime_tokens_purchased: (balRow.lifetime_tokens_purchased || 0) + tokens,
          updated_at: new Date().toISOString(),
        })
        .eq("groomer_id", user.id)
    } else {
      // No balance row yet — create one carrying the paid tokens.
      await adminClient.from("groomer_token_balance").insert({
        groomer_id: user.id,
        monthly_tokens_remaining: 0,
        monthly_tokens_total: 0,
        monthly_period_start: new Date().toISOString().slice(0, 10),
        topup_tokens_remaining: tokens,
        lifetime_tokens_purchased: tokens,
      })
    }

    return jsonOk({ granted: true, tokens_added: tokens, topup_remaining: newTopup })
  } catch (err: any) {
    console.error("[confirm-token-topup] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
