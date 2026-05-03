// =============================================================================
// signup-groomer-with-captcha
// =============================================================================
// Server-side groomer signup with Cloudflare Turnstile verification.
//
// WHY THIS EXISTS:
//   Supabase's project-wide CAPTCHA Protection setting forces a token on
//   EVERY auth call (signup, login, password reset). That broke login UX.
//   This function lets us turn Supabase CAPTCHA Protection OFF and instead
//   gate JUST groomer signup at the application layer:
//     1. Verify Turnstile token directly with Cloudflare
//     2. If valid → create user via admin API (bypasses Supabase CAPTCHA)
//     3. Insert groomers row
//     4. Return user_id so frontend can redirect to Stripe with it
//
// Login flows (groomer / client / staff) no longer need CAPTCHA tokens —
// they hit Supabase auth directly with no friction. Bots can technically
// hit those endpoints but Supabase has built-in rate limiting + the
// payment wall is the real gate (bots don't pay).
//
// Request body:
//   {
//     email, password, full_name, business_name,
//     turnstile_token  // from the Turnstile widget on the signup form
//   }
//
// Response:
//   { ok: true, user_id, email }
//   OR
//   { error: "..." }
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!turnstileSecret) {
      console.error("[signup-groomer] TURNSTILE_SECRET_KEY missing from secrets")
      return jsonResponse({ error: "Server config error — please try again later." }, 500)
    }

    const body = await req.json()
    const { email, password, full_name, business_name, turnstile_token } = body

    // ─── Validate inputs ─────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return jsonResponse({ error: "Email is required." }, 400)
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters." }, 400)
    }
    if (!full_name || typeof full_name !== "string") {
      return jsonResponse({ error: "Full name is required." }, 400)
    }
    if (!business_name || typeof business_name !== "string") {
      return jsonResponse({ error: "Business name is required." }, 400)
    }
    if (!turnstile_token || typeof turnstile_token !== "string") {
      return jsonResponse({ error: "Security check is required. Please refresh the page." }, 400)
    }

    // ─── Verify Turnstile token with Cloudflare ──────────────────
    const verifyForm = new FormData()
    verifyForm.append("secret", turnstileSecret)
    verifyForm.append("response", turnstile_token)
    // (Could also append remoteip = req.headers.get("x-forwarded-for") for extra signal)

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: verifyForm }
    )
    const verifyData = await verifyRes.json()

    if (!verifyData.success) {
      console.warn("[signup-groomer] Turnstile failed:", verifyData["error-codes"])
      return jsonResponse({
        error: "The browser security check didn't pass. Try opening this link in Safari or Chrome (NOT from inside Instagram, Facebook, or TikTok). If it still fails, please contact support."
      }, 400)
    }

    // ─── Create the auth user via admin API ──────────────────────
    // email_confirm: true skips Supabase's email verification step.
    // The Stripe payment wall is the real verification — bots don't pay,
    // and the post-payment welcome email confirms the address works.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const cleanEmail = email.toLowerCase().trim()
    const cleanFullName = full_name.trim()
    const cleanBizName = business_name.trim()

    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanFullName,
        business_name: cleanBizName,
      },
    })

    if (createErr) {
      console.error("[signup-groomer] createUser error:", createErr)
      const errMsg = createErr.message || "Could not create account"
      // Friendly message for the most common case
      if (/already.*registered/i.test(errMsg) || /already.*exists/i.test(errMsg) || /unique constraint/i.test(errMsg)) {
        return jsonResponse({ error: "This email is already registered. Try signing in instead." }, 400)
      }
      if (/password/i.test(errMsg) && /(weak|short|leak|breach)/i.test(errMsg)) {
        return jsonResponse({ error: "That password isn't strong enough. Try a longer password with a mix of characters." }, 400)
      }
      return jsonResponse({ error: errMsg }, 400)
    }

    const userId = createdUser?.user?.id
    if (!userId) {
      return jsonResponse({ error: "Account created but no user ID returned. Try signing in." }, 500)
    }

    // ─── Insert into groomers table ──────────────────────────────
    const { error: profileErr } = await adminClient
      .from("groomers")
      .insert({
        id: userId,
        email: cleanEmail,
        full_name: cleanFullName,
        business_name: cleanBizName,
      })

    if (profileErr) {
      // Non-fatal — auth user exists, they can recover. Log it loudly though.
      console.error("[signup-groomer] groomers row insert failed:", profileErr)
    }

    return jsonResponse({
      ok: true,
      user_id: userId,
      email: cleanEmail,
    })
  } catch (err: any) {
    console.error("[signup-groomer] uncaught error:", err)
    return jsonResponse({ error: err.message || "Internal error — please try again." }, 500)
  }
})

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
