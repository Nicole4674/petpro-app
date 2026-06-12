// =============================================================================
// delete-account — Permanently delete a GROOMER account + all their data
// =============================================================================
// Called from the Account page's Danger Zone (and satisfies Google Play's
// account-deletion requirement — the Play Data Safety form links to the
// Account page).
//
// What it does, in order:
//   1. Verifies the caller is a logged-in GROOMER and typed the confirmation.
//   2. Stripe cleanup FIRST (so nobody keeps getting charged after deletion):
//      a. Cancels the groomer's PetPro subscription (platform account).
//      b. Cancels their clients' membership subscriptions (Connect account).
//      All best-effort — a Stripe hiccup logs loudly but doesn't leave the
//      account half-alive; data deletion proceeds.
//   3. Deletes their data from every groomer-scoped table, children first.
//      Each table is wrapped in its own try/catch: a missing table or
//      column logs + skips instead of aborting (schema drift tolerant).
//   4. Deletes their clients' + staff members' portal logins (auth users).
//   5. Deletes the groomers row, then the groomer's own auth user.
//
// CLIENTS (pet owners) cannot delete here — they're told to ask their
// groomer, since their records belong to the groomer's business.
//
// Request:  POST { confirm: "DELETE" }   + Authorization: Bearer <JWT>
// Returns:  { deleted: true } | { error }
//
// Deploy: supabase functions deploy delete-account
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.10.0?target=denonext"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Tables keyed by groomer_id, deleted in child-before-parent order.
// Missing tables/columns are skipped (try/catch per table) so this list
// can be generous without being fragile.
const GROOMER_TABLES_IN_ORDER = [
  // appointment children
  "appointment_pet_addons", "appointment_pets",
  // punch cards
  "punch_card_uses", "punch_cards", "punch_card_types",
  // boarding children
  "medication_logs", "welfare_logs", "report_cards", "incidents",
  "boarding_addons", "boarding_reservation_pets", "boarding_reservations",
  "kennels", "kennel_categories", "boarding_settings",
  // messaging / AI
  "sms_messages", "sms_blasts", "messages", "threads", "chat_conversations",
  "ai_messages", "ai_conversations", "ai_personalization", "ai_insights", "ai_usage",
  // retail / money
  "sale_items", "sale_payments", "sale_refunds", "sales",
  "inventory_movements", "products", "expenses", "payments",
  "cash_drawer_sessions", "sms_topups", "token_purchases",
  // client memberships
  "subscription_usage", "client_subscriptions", "subscription_plans",
  // scheduling
  "grooming_waitlist", "blocked_times", "recurring_series", "appointments",
  // documents / notes
  "signed_agreements", "agreements", "client_notes", "client_contacts", "notes",
  // pets & vaccinations (fallback by parent ids below if no groomer_id)
  "pet_vaccinations", "vaccinations", "pets",
  // clients
  "clients",
  // staff & payroll
  "staff_permissions", "paycheck_deductions", "staff_deductions",
  "paychecks", "pay_periods", "time_clock", "staff_schedules", "staff_members",
  // shop config
  "services", "zones", "shop_settings", "shop_tax_settings", "shop_memory",
  "groomer_settings", "push_subscriptions",
  // balances & referrals
  "groomer_sms_balance", "groomer_token_balance",
  "groomer_referral_codes",
]

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonError("Method not allowed", 405)

  try {
    const body = await req.json().catch(() => ({}))
    if (body.confirm !== "DELETE") {
      return jsonError('Confirmation missing — send { "confirm": "DELETE" }.', 400)
    }

    // ─── Auth ─────────────────────────────────────────────────────────────
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!jwt) return jsonError("Not authenticated.", 401)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return jsonError("Not authenticated.", 401)

    // ─── Must be a groomer (owners only — staff/clients can't nuke the shop)
    let { data: groomer } = await admin
      .from("groomers")
      .select("id, email, stripe_customer_id, stripe_subscription_id, stripe_connect_account_id")
      .eq("id", user.id)
      .maybeSingle()
    if (!groomer && user.email) {
      const { data: byEmail } = await admin
        .from("groomers")
        .select("id, email, stripe_customer_id, stripe_subscription_id, stripe_connect_account_id")
        .eq("email", user.email)
        .maybeSingle()
      if (byEmail) groomer = byEmail
    }
    if (!groomer) {
      return jsonError("Only the shop owner can delete the account. Pet-owner profiles are managed by your groomer — ask them to remove your records.", 403)
    }
    const gid = groomer.id

    console.log(`[delete-account] ☠️ Deletion requested for groomer ${gid} (${groomer.email})`)

    // ─── Collect ids BEFORE deleting (needed for fallbacks + auth cleanup) ─
    const { data: clientRows } = await admin
      .from("clients").select("id, user_id").eq("groomer_id", gid)
    const clientIds = (clientRows || []).map((c: any) => c.id)
    const clientAuthIds = (clientRows || []).map((c: any) => c.user_id).filter(Boolean)

    const { data: staffRows } = await admin
      .from("staff_members").select("auth_user_id").eq("groomer_id", gid)
    const staffAuthIds = (staffRows || [])
      .map((s: any) => s.auth_user_id)
      .filter((id: string | null) => id && id !== gid) // never the owner here

    let petIds: string[] = []
    if (clientIds.length > 0) {
      const { data: petRows } = await admin
        .from("pets").select("id").in("client_id", clientIds)
      petIds = (petRows || []).map((p: any) => p.id)
    }

    // Client membership subs that must stop billing (on the Connect account)
    const { data: clientSubs } = await admin
      .from("client_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("groomer_id", gid)
      .in("status", ["active", "trialing", "past_due"])

    // ─── 1. Stripe: stop all billing (best-effort, loud on failure) ───────
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" })

      // a) The groomer's own PetPro subscription (platform account)
      try {
        if (groomer.stripe_subscription_id) {
          await stripe.subscriptions.cancel(groomer.stripe_subscription_id)
          console.log(`[delete-account] Canceled platform sub ${groomer.stripe_subscription_id}`)
        } else if (groomer.stripe_customer_id) {
          // No stored sub id — look up any active subs on the customer
          const subs = await stripe.subscriptions.list({
            customer: groomer.stripe_customer_id, status: "active", limit: 10,
          })
          for (const s of subs.data) {
            await stripe.subscriptions.cancel(s.id)
            console.log(`[delete-account] Canceled platform sub ${s.id} (via customer lookup)`)
          }
        }
      } catch (e) {
        console.error("[delete-account] ⚠️ platform sub cancel failed (check Stripe manually!):", (e as Error).message)
      }

      // b) Their clients' membership subscriptions (on the Connect account)
      if (groomer.stripe_connect_account_id && clientSubs && clientSubs.length > 0) {
        for (const cs of clientSubs) {
          if (!cs.stripe_subscription_id) continue
          try {
            await stripe.subscriptions.cancel(cs.stripe_subscription_id, {
              stripeAccount: groomer.stripe_connect_account_id,
            })
            console.log(`[delete-account] Canceled client membership ${cs.stripe_subscription_id}`)
          } catch (e) {
            console.error(`[delete-account] ⚠️ client membership cancel failed (${cs.stripe_subscription_id}):`, (e as Error).message)
          }
        }
      }
    } else {
      console.error("[delete-account] ⚠️ STRIPE_SECRET_KEY missing — subscriptions NOT canceled, check Stripe manually!")
    }

    // ─── 2. Delete data, children first ───────────────────────────────────
    for (const table of GROOMER_TABLES_IN_ORDER) {
      try {
        const { error } = await admin.from(table).delete().eq("groomer_id", gid)
        if (error) throw error
      } catch (e) {
        console.log(`[delete-account] skip ${table} by groomer_id: ${(e as Error).message}`)
      }
    }
    // Fallbacks for tables that hang off parents instead of groomer_id
    try { if (petIds.length) await admin.from("pet_vaccinations").delete().in("pet_id", petIds) } catch (_e) { /* skip */ }
    try { if (petIds.length) await admin.from("vaccinations").delete().in("pet_id", petIds) } catch (_e) { /* skip */ }
    try { if (clientIds.length) await admin.from("pets").delete().in("client_id", clientIds) } catch (_e) { /* skip */ }
    try { if (clientIds.length) await admin.from("clients").delete().in("id", clientIds) } catch (_e) { /* skip */ }
    // Referrals: this groomer may appear on either side
    try { await admin.from("groomer_referrals").delete().eq("referred_groomer_id", gid) } catch (_e) { /* skip */ }
    try { await admin.from("groomer_referrals").delete().eq("referrer_groomer_id", gid) } catch (_e) { /* skip */ }

    // ─── 3. Delete client + staff portal logins ───────────────────────────
    for (const authId of [...clientAuthIds, ...staffAuthIds]) {
      try {
        await admin.auth.admin.deleteUser(authId)
      } catch (e) {
        console.log(`[delete-account] auth user ${authId} delete skipped: ${(e as Error).message}`)
      }
    }

    // ─── 4. The groomer row, then their login ─────────────────────────────
    const { error: gDelErr } = await admin.from("groomers").delete().eq("id", gid)
    if (gDelErr) {
      console.error("[delete-account] groomers row delete failed:", gDelErr)
      return jsonError("Could not fully delete the account — contact nicole@trypetpro.com and we'll finish it manually.", 500)
    }
    try {
      await admin.auth.admin.deleteUser(gid)
    } catch (e) {
      console.error("[delete-account] auth user delete failed:", (e as Error).message)
      // Data is gone + sub canceled; login deletion failing is recoverable
    }

    console.log(`[delete-account] ✅ Groomer ${gid} fully deleted`)
    return new Response(JSON.stringify({ deleted: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[delete-account] uncaught:", err)
    return jsonError("Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
