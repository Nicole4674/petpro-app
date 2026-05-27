// =============================================================================
// check-low-stock — Daily cron that emails groomers about low-stock products
// =============================================================================
// Runs daily (set up as a Supabase scheduled function). For each groomer who
// has low_stock_alerts_enabled=true in shop_settings, queries their active
// products and emails them a list of items at/below the low_stock_at
// threshold.
//
// Skips groomers with no low-stock items so nobody gets "all good" spam.
//
// Can also be called manually (e.g. from a "Run Now" button) — same behavior.
//
// Required env vars:
//   RESEND_API_KEY            — Resend API key
//   SUPABASE_URL              — auto
//   SUPABASE_SERVICE_ROLE_KEY — auto
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const FROM_EMAIL = "alerts@trypetpro.com"

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) return jsonError("RESEND_API_KEY not configured", 500)

    // ─── Allow caller to limit to a specific groomer (for manual "Run Now") ──
    let limitGroomerId: string | null = null
    try {
      const body = await req.json()
      if (body && body.groomer_id) limitGroomerId = String(body.groomer_id)
    } catch (_) {
      // No body / not JSON — full cron pass over everyone
    }

    // ─── Find groomers who want alerts ──
    let query = admin.from("shop_settings").select("groomer_id, shop_name, email").eq("low_stock_alerts_enabled", true)
    if (limitGroomerId) query = query.eq("groomer_id", limitGroomerId)
    const { data: shops, error: shopsErr } = await query
    if (shopsErr) throw shopsErr

    const results: any[] = []

    for (const shop of shops || []) {
      // Their groomer email (fallback to auth email)
      let toEmail = shop.email
      if (!toEmail) {
        const { data: u } = await admin.auth.admin.getUserById(shop.groomer_id)
        toEmail = u?.user?.email || ""
      }
      if (!toEmail || !toEmail.includes("@")) {
        results.push({ groomer_id: shop.groomer_id, status: "skipped_no_email" })
        continue
      }

      // Their low-stock products
      const { data: lowItems } = await admin
        .from("products")
        .select("id, name, qty_on_hand, low_stock_at, category")
        .eq("groomer_id", shop.groomer_id)
        .eq("is_active", true)
        .not("low_stock_at", "is", null)

      const triggered = (lowItems || []).filter((p: any) =>
        Number(p.qty_on_hand) <= Number(p.low_stock_at)
      ).sort((a: any, b: any) => Number(a.qty_on_hand) - Number(b.qty_on_hand))

      if (triggered.length === 0) {
        results.push({ groomer_id: shop.groomer_id, status: "nothing_low" })
        continue
      }

      // ─── Build email ──
      const shopName = shop.shop_name || "Your Shop"
      const rowsHtml = triggered.map((p: any) => {
        const out = Number(p.qty_on_hand) <= 0
        const color = out ? "#dc2626" : "#b45309"
        const label = out ? "OUT" : `${p.qty_on_hand} left`
        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(p.name)}</td>
            <td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;">${escapeHtml(p.category || "")}</td>
            <td style="padding:8px;border-bottom:1px solid #f3f4f6;color:${color};font-weight:700;text-align:right;">${label}</td>
          </tr>`
      }).join("")

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
          <h1 style="font-size:20px;margin:0 0 4px;">📦 Low Stock Alert</h1>
          <p style="margin:0 0 18px;color:#6b7280;font-size:13px;">
            ${triggered.length} product${triggered.length === 1 ? "" : "s"} at or below threshold at ${escapeHtml(shopName)}.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;background:#f9fafb;font-weight:700;">Product</th>
                <th style="text-align:left;padding:8px;background:#f9fafb;font-weight:700;font-size:12px;">Category</th>
                <th style="text-align:right;padding:8px;background:#f9fafb;font-weight:700;">Stock</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#6b7280;">
            Time to reorder. Open PetPro → Retail → Products to restock.<br/>
            <a href="https://trypetpro.com/products" style="color:#7c3aed;">View Products →</a>
          </p>
          <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">
            You're getting this because low-stock alerts are enabled in your Shop Settings. You can turn them off any time.
          </p>
        </div>
      `

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `PetPro Alerts <${FROM_EMAIL}>`,
          to: [toEmail],
          subject: `📦 ${triggered.length} product${triggered.length === 1 ? "" : "s"} low at ${shopName}`,
          html,
        }),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        results.push({ groomer_id: shop.groomer_id, status: "email_failed", error: errText })
      } else {
        results.push({ groomer_id: shop.groomer_id, status: "emailed", count: triggered.length, sent_to: toEmail })
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return jsonError(err?.message || "Unknown error", 500)
  }
})
