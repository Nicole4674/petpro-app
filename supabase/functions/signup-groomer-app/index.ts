// =============================================================================
// signup-groomer-app — Create a groomer account from the MOBILE APP
// =============================================================================
// The app-side twin of start-free-trial. The website creates accounts via
// signup-groomer-with-captcha (Cloudflare Turnstile, browser-only). The app
// can't do Turnstile, so this function authenticates the app with the same
// x-petpro-app-key secret instead, then:
//   1. Creates the auth user via admin API (email auto-confirmed — the free
//      trial + later Stripe payment are the real verification).
//   2. Inserts the groomers profile row { id, email, full_name, business_name }.
//   3. Returns { user_id, email } so the app can sign in and call
//      start-free-trial.
//
// It does NOT start the trial or touch Stripe — start-free-trial handles that.
//
// SECURITY:
//   • x-petpro-app-key header must equal the PETPRO_APP_TRIAL_KEY secret
//     (same key start-free-trial uses). FAIL-CLOSED if the secret is unset.
//
// Request:  POST { email, password, full_name, business_name, phone? }
//           Header: x-petpro-app-key: <PETPRO_APP_TRIAL_KEY>
// Returns:  { user_id, email } | { error }
//
// Deploy: supabase functions deploy signup-groomer-app
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-petpro-app-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonError("Method not allowed", 405)

  try {
    // ─── Lock: app key (fail-closed) ─────────────────────────────────────
    const expectedKey = Deno.env.get("PETPRO_APP_TRIAL_KEY") || ""
    const givenKey = req.headers.get("x-petpro-app-key") || ""
    if (!expectedKey) {
      console.error("[signup-groomer-app] PETPRO_APP_TRIAL_KEY not configured — refusing")
      return jsonError("Signup is not available right now.", 503)
    }
    if (givenKey !== expectedKey) return jsonError("Not authorized.", 403)

    // ─── Validate ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || "").toLowerCase().trim()
    const password = String(body.password || "")
    const fullName = String(body.full_name || "").trim()
    const bizName = String(body.business_name || "").trim()
    const phone = String(body.phone || "").trim()

    if (!email || !email.includes("@")) return jsonError("A valid email is required.", 400)
    if (password.length < 6) return jsonError("Password must be at least 6 characters.", 400)
    if (!fullName) return jsonError("Your name is required.", 400)
    if (!bizName) return jsonError("Business name is required.", 400)

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ─── Create the auth user (email auto-confirmed) ─────────────────────
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, business_name: bizName, phone: phone || null },
    })
    if (createErr) {
      const msg = String(createErr.message || "")
      if (/already.*registered|already exists|duplicate/i.test(msg)) {
        return jsonError("This email is already registered. Try signing in instead.", 409)
      }
      console.error("[signup-groomer-app] createUser error:", createErr)
      return jsonError("Could not create your account — please try again.", 400)
    }
    const userId = created?.user?.id
    if (!userId) return jsonError("Account created but no user ID returned. Try signing in.", 500)

    // ─── Insert groomers profile row ─────────────────────────────────────
    const { error: profileErr } = await adminClient.from("groomers").insert({
      id: userId,
      email,
      full_name: fullName,
      business_name: bizName,
    })
    if (profileErr) {
      console.error("[signup-groomer-app] groomers insert failed:", profileErr)
      // Non-fatal: auth user exists. Surface so the app can decide.
      return jsonError("Account created but profile setup failed. Please try signing in.", 500)
    }

    return new Response(
      JSON.stringify({ user_id: userId, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[signup-groomer-app] uncaught:", err)
    return jsonError("Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
