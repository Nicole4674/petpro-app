// =============================================================================
// start-free-trial — Card-free 14-day trial, MOBILE APP ONLY
// =============================================================================
// Called by the PetPro mobile app right after account creation, INSTEAD of
// opening Stripe (Google Play forbids in-app subscription payments). Stamps
// the groomer as trialing for 14 days with their chosen tier and grants that
// tier's AI-token + SMS quotas so the app is fully usable during the trial.
//
// When the trial ends, SubscriptionGate (web) + the app both block access and
// point them to trypetpro.com/plans — the existing Stripe checkout. The WEB
// signup flow is NOT changed: web users still go through Stripe up front
// (Nicole keeps Stripe as the bot gate on the website).
//
// SECURITY (two locks, both required):
//   1. x-petpro-app-key header must match the PETPRO_APP_TRIAL_KEY secret —
//      only the mobile app ships this key, so the website/bots can't call it.
//      FAIL-CLOSED: if the secret isn't configured, every request is refused.
//   2. ONCE EVER per account: refused if the groomer has ANY subscription
//      status or trial date already — no trial farming, no trial refresh,
//      no "trial" for someone who canceled a paid plan.
//
// Request:  POST { tier: 'basic' | 'pro' | 'pro_plus' | 'growing' }
//           Headers: Authorization: Bearer <user JWT>
//                    x-petpro-app-key: <PETPRO_APP_TRIAL_KEY>
// Returns:  { trial_started: true, tier, trial_ends_at } | { error }
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   PETPRO_APP_TRIAL_KEY — long random string, same value baked into the app
//
// Deploy: supabase functions deploy start-free-trial
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-petpro-app-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const TRIAL_DAYS = 14

// Mirrors stripe-webhook's TIER_TO_MONTHLY_TOKENS — keep these in sync.
const TIER_TO_MONTHLY_TOKENS: Record<string, number> = {
  "basic": 500,
  "pro": 800,
  "pro_plus": 1000,
  "growing": 3000,
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonError("Method not allowed", 405)

  try {
    // ─── Lock 1: app key (fail-closed) ───────────────────────────────────
    const expectedKey = Deno.env.get("PETPRO_APP_TRIAL_KEY") || ""
    const givenKey = req.headers.get("x-petpro-app-key") || ""
    if (!expectedKey) {
      console.error("[start-free-trial] PETPRO_APP_TRIAL_KEY not configured — refusing all requests")
      return jsonError("Trial signup is not available right now.", 503)
    }
    if (givenKey !== expectedKey) {
      console.warn("[start-free-trial] bad or missing app key — rejected")
      return jsonError("Not authorized.", 403)
    }

    // ─── Validate tier ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const tier = String(body.tier || "").toLowerCase()
    if (TIER_TO_MONTHLY_TOKENS[tier] === undefined) {
      return jsonError("Invalid tier. Expected basic, pro, pro_plus, or growing.", 400)
    }

    // ─── Auth: must be a logged-in user (the account the app just made) ──
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!jwt) return jsonError("Not authenticated.", 401)

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(jwt)
    if (authErr || !user) return jsonError("Not authenticated.", 401)

    // ─── Find the groomer row (id = auth user id; email fallback) ────────
    let { data: groomer } = await adminClient
      .from("groomers")
      .select("id, subscription_status, subscription_tier, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle()
    if (!groomer && user.email) {
      const { data: byEmail } = await adminClient
        .from("groomers")
        .select("id, subscription_status, subscription_tier, trial_ends_at")
        .eq("email", user.email)
        .maybeSingle()
      if (byEmail) groomer = byEmail
    }
    if (!groomer) {
      return jsonError("Account profile not found — finish creating your account first.", 404)
    }

    // ─── Lock 2: once EVER ────────────────────────────────────────────────
    // Any prior subscription status OR trial date means this account already
    // had its shot (trialing, active, canceled, past_due — all of them).
    if (groomer.subscription_status || groomer.trial_ends_at) {
      return jsonError("This account already has a plan or has used its free trial. Manage your plan at trypetpro.com.", 409)
    }

    // ─── Start the trial ──────────────────────────────────────────────────
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { error: updErr } = await adminClient
      .from("groomers")
      .update({
        subscription_tier: tier,
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
      })
      .eq("id", groomer.id)
      .is("trial_ends_at", null) // belt-and-suspenders vs. double-tap race
    if (updErr) {
      console.error("[start-free-trial] groomers update failed:", updErr)
      return jsonError("Could not start your trial — please try again.", 500)
    }

    // ─── Grant tier quotas (mirrors stripe-webhook's tier sync) ──────────
    // Tokens — create-or-refill the balance row
    const monthlyTokens = TIER_TO_MONTHLY_TOKENS[tier]
    const { data: existingBal } = await adminClient
      .from("groomer_token_balance")
      .select("groomer_id")
      .eq("groomer_id", groomer.id)
      .maybeSingle()
    if (!existingBal) {
      await adminClient.from("groomer_token_balance").insert({
        groomer_id: groomer.id,
        monthly_tokens_remaining: monthlyTokens,
        monthly_tokens_total: monthlyTokens,
        monthly_period_start: new Date().toISOString().slice(0, 10),
      })
    } else {
      await adminClient
        .from("groomer_token_balance")
        .update({
          monthly_tokens_total: monthlyTokens,
          monthly_tokens_remaining: monthlyTokens,
          monthly_period_start: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq("groomer_id", groomer.id)
    }

    // SMS — same RPC the live webhook uses (handles tier amounts atomically)
    const { error: smsErr } = await adminClient.rpc("sync_sms_allocation_for_tier", {
      p_groomer_id: groomer.id,
      p_tier: tier,
    })
    if (smsErr) {
      // Non-fatal: trial still starts; SMS quota syncs again when they pay.
      console.error("[start-free-trial] SMS allocation sync failed (non-fatal):", smsErr)
    }

    console.log(`[start-free-trial] 🎉 ${groomer.id} started ${TRIAL_DAYS}-day ${tier} trial (ends ${trialEndsAt})`)
    return new Response(
      JSON.stringify({ trial_started: true, tier, trial_ends_at: trialEndsAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[start-free-trial] uncaught:", err)
    return jsonError("Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
