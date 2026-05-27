// =============================================================================
// email-sale-receipt — Email a retail POS receipt to a customer
// =============================================================================
// Called from the POS receipt screen ("📧 Email" button). Pulls the sale +
// items + payments + shop branding, builds a clean HTML receipt, and sends
// it via Resend.
//
// Request body:
//   {
//     sale_id: string,
//     to_email?: string   // optional override; defaults to client.email
//   }
//
// Returns:
//   { ok: true, sent_to: 'customer@example.com' }
//   { error: 'reason' }
//
// Required env vars:
//   RESEND_API_KEY            — Resend API key (already in Supabase secrets)
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

const FROM_EMAIL_DEFAULT = "receipts@trypetpro.com"

function money(n: any) {
  const v = parseFloat(n) || 0
  return "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const saleId = body.sale_id
    const overrideEmail = body.to_email
    if (!saleId) return jsonError("sale_id required")

    // ─── Auth ──
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

    // ─── Pull sale + everything we need ──
    const { data: sale, error: saleErr } = await adminClient
      .from("sales")
      .select(`
        *,
        clients ( id, first_name, last_name, email, phone ),
        sale_items ( id, product_id, custom_name, qty, unit_price, line_total, products ( name ) ),
        sale_payments ( method, amount, cash_tendered, cash_change ),
        staff_members!sales_tip_recipient_staff_id_fkey ( first_name )
      `)
      .eq("id", saleId)
      .eq("groomer_id", user.id)
      .maybeSingle()
    if (saleErr || !sale) return jsonError("Sale not found or not yours", 404)

    // ─── Shop branding ──
    const { data: shop } = await adminClient
      .from("shop_settings")
      .select("shop_name, address, phone, email, logo_url, receipt_footer_text")
      .eq("groomer_id", user.id)
      .maybeSingle()

    // ─── Pick destination email ──
    const toEmail = (overrideEmail || sale.clients?.email || "").trim()
    if (!toEmail || !toEmail.includes("@")) {
      return jsonError("No email on file for this customer. Add one or pass to_email.")
    }

    // ─── Build HTML ──
    const shopName = shop?.shop_name || "PetPro Shop"
    const dateStr = new Date(sale.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    const tipStaffName = sale.staff_members?.first_name || null

    const itemsHtml = (sale.sale_items || []).map((li: any) => {
      const name = li.custom_name || li.products?.name || "Item"
      return `
        <tr>
          <td style="padding:4px 0;">${li.qty} × ${escapeHtml(name)}</td>
          <td style="padding:4px 0;text-align:right;">${money(li.line_total)}</td>
        </tr>`
    }).join("")

    const paymentsHtml = (sale.sale_payments || []).map((p: any) =>
      `<tr><td style="padding:2px 0;color:#6b7280;">Paid via ${p.method}</td><td style="padding:2px 0;text-align:right;color:#6b7280;">${money(p.amount)}</td></tr>`
    ).join("")

    const html = `
      <!DOCTYPE html>
      <html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">
        <div style="text-align:center;margin-bottom:18px;">
          ${shop?.logo_url ? `<img src="${shop.logo_url}" alt="" style="max-height:60px;max-width:180px;margin-bottom:8px;" />` : ""}
          <div style="font-weight:800;font-size:18px;">${escapeHtml(shopName)}</div>
          ${shop?.address ? `<div style="color:#6b7280;font-size:12px;">${escapeHtml(shop.address)}</div>` : ""}
          ${shop?.phone ? `<div style="color:#6b7280;font-size:12px;">${escapeHtml(shop.phone)}</div>` : ""}
        </div>

        <div style="border-top:1px dashed #d1d5db;padding-top:12px;text-align:center;font-size:12px;color:#6b7280;">
          ${escapeHtml(dateStr)}<br/>
          Sale #${sale.id.slice(0, 8).toUpperCase()}
          ${sale.clients ? `<br/>Customer: ${escapeHtml((sale.clients.first_name || "") + " " + (sale.clients.last_name || ""))}` : ""}
        </div>

        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px;font-family:monospace;">
          ${itemsHtml}
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:14px;border-top:1px dashed #d1d5db;padding-top:10px;font-size:13px;font-family:monospace;">
          <tr><td>Subtotal</td><td style="text-align:right;">${money(sale.subtotal)}</td></tr>
          ${parseFloat(sale.discount_amount) > 0 ? `<tr><td>Discount${sale.discount_reason ? ` (${escapeHtml(sale.discount_reason)})` : ""}</td><td style="text-align:right;">−${money(sale.discount_amount)}</td></tr>` : ""}
          ${parseFloat(sale.tax_amount) > 0 ? `<tr><td>Tax</td><td style="text-align:right;">${money(sale.tax_amount)}</td></tr>` : ""}
          ${parseFloat(sale.tip_amount) > 0 ? `<tr><td>Tip${tipStaffName ? ` (${escapeHtml(tipStaffName)})` : ""}</td><td style="text-align:right;">${money(sale.tip_amount)}</td></tr>` : ""}
          <tr style="border-top:1px solid #111827;"><td style="padding-top:6px;font-weight:800;font-size:14px;">TOTAL</td><td style="padding-top:6px;text-align:right;font-weight:800;font-size:14px;">${money(sale.total)}</td></tr>
          ${paymentsHtml}
        </table>

        <div style="margin-top:20px;text-align:center;font-size:12px;color:#6b7280;white-space:pre-wrap;">
          ${shop?.receipt_footer_text ? escapeHtml(shop.receipt_footer_text) : "Thank you! 🐾"}
        </div>
      </body></html>
    `

    // ─── Send via Resend ──
    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) return jsonError("Email is not configured. Missing RESEND_API_KEY.")

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${shopName} <${FROM_EMAIL_DEFAULT}>`,
        to: [toEmail],
        subject: `Receipt from ${shopName} — ${money(sale.total)}`,
        html,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      return jsonError(`Resend error: ${errText}`)
    }

    return new Response(JSON.stringify({ ok: true, sent_to: toEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return jsonError(err?.message || "Unknown error", 500)
  }
})
