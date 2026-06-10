// =============================================================================
// confirm-punch-card — Verify Stripe payment + issue the punch card
// =============================================================================
// Called from the client portal when Stripe redirects back with
// ?punchcard=1&session_id=... . Verifies the Checkout Session was PAID
// (server-side, on the groomer's connected account — never trusts the URL),
// then issues the punch_cards row.
//
// IDEMPOTENT: stripe_session_id has a unique index, so a double redirect or
// refresh can't issue two cards for one payment.
//
// Request body:  { session_id: string }
// Returns:       { issued: true, card: {...} } | { issued: false, reason } | { error }
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
      .select("id, groomer_id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!clientRow) return jsonError("Client profile not found.", 403)

    // ─── Already issued? (refresh / double redirect) ───
    const { data: existing } = await adminClient
      .from("punch_cards")
      .select("id, name, punches_remaining, total_punches")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()
    if (existing) {
      return jsonOk({ issued: true, already: true, card: existing })
    }

    // ─── Retrieve the session from Stripe (on the groomer's account) ───
    const { data: groomer } = await adminClient
      .from("groomers")
      .select("stripe_connect_account_id")
      .eq("id", clientRow.groomer_id)
      .maybeSingle()
    if (!groomer || !groomer.stripe_connect_account_id) {
      return jsonError("Groomer's Stripe account not found.", 500)
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (!stripeKey) return jsonError("Stripe not configured.", 500)
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      stripeAccount: groomer.stripe_connect_account_id,
    })

    if (!session || session.metadata?.petpro_punch_card !== "true") {
      return jsonError("That checkout session isn't a punch card purchase.", 400)
    }
    if (session.metadata?.client_id !== clientRow.id) {
      return jsonError("This purchase belongs to a different client.", 403)
    }
    if (session.payment_status !== "paid") {
      return jsonOk({ issued: false, reason: "Payment not completed (" + session.payment_status + "). If you just paid, wait a few seconds and refresh." })
    }

    // ─── Issue the card (snapshot from the type) ───
    const { data: cardType } = await adminClient
      .from("punch_card_types")
      .select("*")
      .eq("id", session.metadata.punch_card_type_id)
      .maybeSingle()
    if (!cardType) return jsonError("Punch card type no longer exists — contact your groomer (your payment went through).", 500)

    let expiresAt: string | null = null
    if (cardType.expires_months) {
      const d = new Date()
      d.setMonth(d.getMonth() + cardType.expires_months)
      expiresAt = d.toISOString().slice(0, 10)
    }

    const { data: newCard, error: insertErr } = await adminClient
      .from("punch_cards")
      .insert({
        groomer_id: clientRow.groomer_id,
        client_id: clientRow.id,
        type_id: cardType.id,
        name: cardType.name,
        service_ids: cardType.service_ids,
        total_punches: cardType.total_punches,
        punches_remaining: cardType.total_punches,
        price_paid: parseFloat(String(cardType.price)) || 0,
        payment_method: "stripe",
        expires_at: expiresAt,
        status: "active",
        stripe_session_id: sessionId,
      })
      .select("id, name, punches_remaining, total_punches")
      .single()

    if (insertErr) {
      // Unique violation = another request already issued it — fetch + return
      const { data: raced } = await adminClient
        .from("punch_cards")
        .select("id, name, punches_remaining, total_punches")
        .eq("stripe_session_id", sessionId)
        .maybeSingle()
      if (raced) return jsonOk({ issued: true, already: true, card: raced })
      console.error("[confirm-punch-card] insert failed:", insertErr)
      return jsonError("Payment received but the card could not be issued — contact your groomer.", 500)
    }

    return jsonOk({ issued: true, card: newCard })
  } catch (err: any) {
    console.error("[confirm-punch-card] uncaught:", err)
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
