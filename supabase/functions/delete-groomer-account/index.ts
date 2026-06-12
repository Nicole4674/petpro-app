// =============================================================================
// delete-groomer-account — Let a groomer delete their account from the APP
// =============================================================================
// Google Play requires any app with account creation to also offer in-app
// account deletion. This is the app-side deleter (twin of signup-groomer-app /
// start-free-trial). It removes the groomer's login and profile row. Related
// business data is removed via the database's ON DELETE CASCADE foreign keys
// from groomers(id) / auth.users(id); anything not cascaded can be purged on
// the web side.
//
// SECURITY:
//   • x-petpro-app-key header must equal the PETPRO_APP_TRIAL_KEY secret.
//   • Authorization: Bearer <user JWT> — only the logged-in user can delete
//     THEIR OWN account (we delete user.id from the verified token, never an
//     id from the request body).
//
// Request:  POST {}  (no body needed)
//           Headers: Authorization: Bearer <user JWT>, x-petpro-app-key: <key>
// Returns:  { deleted: true } | { error }
//
// Deploy: supabase functions deploy delete-groomer-account
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
    const expectedKey = Deno.env.get("PETPRO_APP_TRIAL_KEY") || ""
    const givenKey = req.headers.get("x-petpro-app-key") || ""
    if (!expectedKey) return jsonError("Account deletion is not available right now.", 503)
    if (givenKey !== expectedKey) return jsonError("Not authorized.", 403)

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!jwt) return jsonError("Not authenticated.", 401)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return jsonError("Not authenticated.", 401)

    // Delete the groomer profile row first (cascades child data if FKs are set).
    // Best-effort: if it errors (e.g. FK restrict), we still remove the login.
    const { error: rowErr } = await admin.from("groomers").delete().eq("id", user.id)
    if (rowErr) console.error("[delete-groomer-account] groomers row delete (non-fatal):", rowErr.message)

    // Remove the auth user — this kills their login permanently and cascades
    // anything tied to auth.users(id).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error("[delete-groomer-account] deleteUser failed:", delErr)
      return jsonError("Could not delete your account — please try again or email nicole@trypetpro.com.", 500)
    }

    return new Response(
      JSON.stringify({ deleted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[delete-groomer-account] uncaught:", err)
    return jsonError("Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}
