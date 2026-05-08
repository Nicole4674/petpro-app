// =============================================================================
// cancel-subscription — Cancel a client's subscription (immediate or at period end)
// =============================================================================
// Called from both:
//   • Client portal — client cancels their own subscription
//   • Groomer side — groomer cancels on behalf of a client
//
// Request body:
//   { subscription_id: string, at_period_end: boolean }
//
// Returns:
//   { ok: true }
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
    const { subscription_id, at_period_end } = await req.json()
    if (!subscription_id) return jsonError("subscription_id required")

    // ─── Auth ───
    const authHeader = req.headers.get("Authorization") || ""
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return jsonError("Not authenticated", 401)

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ─── Pull the subscription + verify caller is owner (groomer OR client) ───
    const { data: sub } = await adminClient
      .from("client_subscriptions")
      .select("*, clients(user_id)")
      .eq("id", subscription_id)
      .maybeSingle()
    if (!sub) return jsonError("Subscription not found.", 404)

    const isGroomer = sub.groomer_id === user.id
    const isClient = sub.clients?.user_id === user.id
    if (!isGroomer && !isClient) return jsonError("Not authorized.", 403)

    // ─── Talk to Stripe (if there's a Stripe sub linked) ───
    if (sub.stripe_subscription_id) {
      const { data: groomer } = await adminClient
        .from("groomers")
        .select("stripe_connect_account_id")
        .eq("id", sub.groomer_id)
        .maybeSingle()
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
      if (groomer?.stripe_connect_account_id && stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
        const stripeOpts = { stripeAccount: groomer.stripe_connect_account_id }
        try {
          if (at_period_end) {
            await stripe.subscriptions.update(
              sub.stripe_subscription_id,
              { cancel_at_period_end: true },
              stripeOpts
            )
          } else {
            await stripe.subscriptions.cancel(sub.stripe_subscription_id, stripeOpts)
          }
        } catch (stripeErr: any) {
          console.error("[cancel-sub] Stripe error:", stripeErr.message)
          // Don't fail the whole call — still update our DB. Stripe can be reconciled.
        }
      }
    }

    // ─── Update DB row ───
    const update: any = at_period_end
      ? { cancel_at_period_end: true }
      : { status: "canceled", canceled_at: new Date().toISOString() }
    const { error: upErr } = await adminClient
      .from("client_subscriptions")
      .update(update)
      .eq("id", subscription_id)
    if (upErr) throw upErr

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[cancel-sub] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
