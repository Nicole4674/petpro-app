// =============================================================================
// confirm-subscription — Finalize a subscription after Stripe Checkout returns
// =============================================================================
// Called when client lands back on /portal?subscribed=1&session_id=cs_...
// Looks up the Checkout Session, pulls the resulting Subscription, writes
// it to client_subscriptions (status='active', period dates filled in).
//
// Why we do this here AND have webhooks: webhooks are async + can lag.
// Confirming on return means the UI shows "active" immediately, no wait.
// Webhooks (when wired up later) handle ongoing renewal events.
//
// Request body:
//   { session_id: string }   — the Stripe Checkout session id from the URL
//
// Returns:
//   { ok: true, subscription_id: string }
//   { error: string }
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
    const { session_id } = await req.json()
    if (!session_id) return jsonError("session_id required")

    // ─── Auth — caller must be the client ───
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

    // ─── Look up the client ───
    const { data: clientRow } = await adminClient
      .from("clients")
      .select("id, groomer_id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!clientRow) return jsonError("Client profile not found.", 403)

    // ─── Look up the groomer's Connect account ───
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id")
      .eq("id", clientRow.groomer_id)
      .maybeSingle()
    if (!groomer?.stripe_connect_account_id) return jsonError("Groomer Stripe not set up.", 400)

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const stripeOpts = { stripeAccount: groomer.stripe_connect_account_id }

    // ─── Pull the Checkout Session + its Subscription ───
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    }, stripeOpts)

    if (!session) return jsonError("Checkout session not found.", 404)
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return jsonError("Checkout not completed yet — try again in a moment.", 400)
    }
    if (!session.metadata?.plan_id || !session.metadata?.client_id) {
      return jsonError("Checkout session is missing PetPro metadata.", 400)
    }
    if (session.metadata.client_id !== clientRow.id) {
      return jsonError("This session is for a different client.", 403)
    }

    const sub: any = session.subscription
    if (!sub || !sub.id) return jsonError("No subscription found on this session.", 400)

    // ─── Upsert client_subscriptions row ───
    // We may already have a 'pending' row from create-subscription-checkout —
    // mark it active. If not, insert a new row.
    const { data: existing } = await adminClient
      .from("client_subscriptions")
      .select("id")
      .eq("client_id", clientRow.id)
      .eq("plan_id", session.metadata.plan_id)
      .eq("status", "pending")
      .maybeSingle()

    const row = {
      groomer_id: clientRow.groomer_id,
      client_id: clientRow.id,
      plan_id: session.metadata.plan_id,
      stripe_subscription_id: sub.id,
      stripe_customer_id: session.customer || null,
      status: sub.status === "trialing" ? "active" : (sub.status || "active"),
      current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    }

    let savedId
    if (existing) {
      const { data, error } = await adminClient
        .from("client_subscriptions")
        .update(row)
        .eq("id", existing.id)
        .select("id")
        .single()
      if (error) throw error
      savedId = data.id
    } else {
      const { data, error } = await adminClient
        .from("client_subscriptions")
        .insert(row)
        .select("id")
        .single()
      if (error) throw error
      savedId = data.id
    }

    return new Response(JSON.stringify({ ok: true, subscription_id: savedId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[confirm-sub] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
