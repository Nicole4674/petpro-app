// =============================================================================
// confirm-sms-topup — Verify payment + grant the SMS credits
// =============================================================================
// Called when Stripe redirects back with ?smstopup=1&session_id=... .
// Verifies the session was PAID on PetPro's platform account, then:
//   1. Logs the top-up (sms_topups — unique session id = idempotent)
//   2. Adds the credits to groomer_sms_balance.monthly_sms_remaining
//
// Request body:  { session_id: string }
// Returns:       { granted: true, sms_added, remaining } | { granted: false, reason } | { error }
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
      .from("sms_topups")
      .select("id, sms_amount")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()
    if (existing) {
      const { data: bal } = await adminClient
        .from("groomer_sms_balance")
        .select("monthly_sms_remaining, extra_sms_balance")
        .eq("groomer_id", user.id)
        .maybeSingle()
      return jsonOk({
        granted: true,
        already: true,
        sms_added: existing.sms_amount,
        extra_balance: bal?.extra_sms_balance ?? null,
        remaining: (bal?.monthly_sms_remaining ?? 0) + (bal?.extra_sms_balance ?? 0),
      })
    }

    // ─── Verify with Stripe (platform account — no stripeAccount option) ───
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session || session.metadata?.petpro_sms_topup !== "true") {
      return jsonError("That checkout session isn't an SMS top-up.", 400)
    }
    if (session.metadata?.groomer_id !== user.id) {
      return jsonError("This purchase belongs to a different account.", 403)
    }
    if (session.payment_status !== "paid") {
      return jsonOk({ granted: false, reason: "Payment not completed (" + session.payment_status + "). If you just paid, wait a few seconds and try again." })
    }

    const smsAmount = parseInt(session.metadata?.sms_amount || "0", 10) || 0
    if (smsAmount <= 0) return jsonError("Invalid top-up amount on session.", 400)

    // ─── Log first (unique index = idempotency gate) ───
    const { error: logErr } = await adminClient.from("sms_topups").insert({
      groomer_id: user.id,
      sms_amount: smsAmount,
      price_paid: (session.amount_total || 0) / 100,
      stripe_session_id: sessionId,
    })
    if (logErr) {
      // Unique violation = another request won the race — report success
      const { data: bal2 } = await adminClient
        .from("groomer_sms_balance")
        .select("monthly_sms_remaining, extra_sms_balance")
        .eq("groomer_id", user.id)
        .maybeSingle()
      return jsonOk({
        granted: true,
        already: true,
        sms_added: smsAmount,
        extra_balance: bal2?.extra_sms_balance ?? null,
        remaining: (bal2?.monthly_sms_remaining ?? 0) + (bal2?.extra_sms_balance ?? 0),
      })
    }

    // ─── Grant the credits to the NEVER-EXPIRE extras bucket ───
    // (Matches the token model: monthly allowance spends first, extras
    // after, and extras survive the monthly reset forever.)
    const { data: balRow } = await adminClient
      .from("groomer_sms_balance")
      .select("monthly_sms_remaining, monthly_sms_total, extra_sms_balance")
      .eq("groomer_id", user.id)
      .maybeSingle()

    let newExtra = smsAmount
    let monthlyRemaining = 0
    if (balRow) {
      newExtra = (balRow.extra_sms_balance || 0) + smsAmount
      monthlyRemaining = balRow.monthly_sms_remaining || 0
      await adminClient
        .from("groomer_sms_balance")
        .update({ extra_sms_balance: newExtra, updated_at: new Date().toISOString() })
        .eq("groomer_id", user.id)
    } else {
      // No balance row yet (subscription not synced) — create one so the
      // paid credits exist either way.
      await adminClient.from("groomer_sms_balance").insert({
        groomer_id: user.id,
        monthly_sms_total: 0,
        monthly_sms_remaining: 0,
        extra_sms_balance: smsAmount,
        monthly_period_start: new Date().toISOString().slice(0, 10),
      })
    }

    return jsonOk({
      granted: true,
      sms_added: smsAmount,
      extra_balance: newExtra,
      remaining: monthlyRemaining + newExtra,
    })
  } catch (err: any) {
    console.error("[confirm-sms-topup] uncaught:", err)
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
