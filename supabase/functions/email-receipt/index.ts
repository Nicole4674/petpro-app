// =============================================================================
// email-receipt — Email a printable receipt for one appointment to the client
// =============================================================================
// Called from the groomer-side Calendar appointment popup ("📧 Email" button
// next to "🖨️ Print" inside the Receipt modal). Pulls the appointment +
// services + payments + shop info, builds a clean HTML receipt, and sends
// it via Resend to the client's email on file.
//
// Mirrors the same HTML the React ReceiptModal renders for printing, so the
// email + the printed page look identical.
//
// Request body (one of):
//   { appointment_id: string, to_email?: string }   — grooming receipt
//   { reservation_id: string, to_email?: string }   — boarding receipt
// to_email is optional — defaults to client.email on the row.
//
// Returns:
//   { ok: true, sent_to: 'client@example.com' }
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

// Verified Resend domain — matches the other email functions.
const FROM_EMAIL_DEFAULT = "receipts@trypetpro.com"

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const apptId = body.appointment_id
    const reservationId = body.reservation_id
    const overrideEmail = body.to_email
    if (!apptId && !reservationId) return jsonError("appointment_id or reservation_id required")
    const isBoardingReq = !apptId && !!reservationId

    // ─── Auth — groomer calling from their own browser ───
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

    // ─── Pull the row + everything we need to build the receipt ───
    // Branches on grooming (appointments) vs boarding (boarding_reservations).
    let appt: any
    if (isBoardingReq) {
      const { data, error: bErr } = await adminClient
        .from("boarding_reservations")
        .select(`
          *,
          clients ( id, first_name, last_name, email, phone ),
          boarding_reservation_pets ( id, pets ( name ) ),
          boarding_addons ( * )
        `)
        .eq("id", reservationId)
        .eq("groomer_id", user.id)
        .maybeSingle()
      if (bErr || !data) return jsonError("Boarding reservation not found or not yours", 404)
      appt = data
    } else {
      const { data, error: apptErr } = await adminClient
        .from("appointments")
        .select(`
          *,
          clients ( id, first_name, last_name, email, phone ),
          services ( service_name, price ),
          appointment_pets (
            *,
            pets ( name ),
            services ( service_name, price ),
            appointment_pet_addons ( *, services ( service_name, price ) )
          )
        `)
        .eq("id", apptId)
        .eq("groomer_id", user.id)
        .maybeSingle()
      if (apptErr || !data) return jsonError("Appointment not found or not yours", 404)
      appt = data
    }

    // Pull payments — different FK column for boarding vs grooming
    const paymentsQuery = adminClient.from("payments").select("*")
    const { data: payments } = isBoardingReq
      ? await paymentsQuery.eq("boarding_reservation_id", reservationId).order("created_at", { ascending: true })
      : await paymentsQuery.eq("appointment_id", apptId).order("created_at", { ascending: true })

    // Pull shop info for the header
    const { data: shop } = await adminClient
      .from("shop_settings")
      .select("shop_name, address, phone, email")
      .eq("user_id", user.id)
      .maybeSingle()

    // ─── Pick the destination email ───
    const toEmail = (overrideEmail || appt.clients?.email || "").trim()
    if (!toEmail || !toEmail.includes("@")) {
      return jsonError("This client doesn't have an email on file. Add one or pass to_email.")
    }

    // ─── Build numbers for the receipt ───
    const lineItems = buildLineItems(appt)
    const subtotal = lineItems.reduce((s, li) => s + li.price, 0)
    const discount = parseFloat(appt.discount_amount || 0)
    const discReason = appt.discount_reason || ""
    const total = Math.max(0, subtotal - discount)
    let amountPaid = 0
    let tipPaid = 0
    for (const p of payments || []) {
      const amt = parseFloat(p.amount || 0)
      const tip = parseFloat(p.tip_amount || 0)
      const refunded = parseFloat(p.refunded_amount || 0)
      amountPaid += Math.max(0, amt - refunded)
      tipPaid += tip
    }
    const grandTotal = total + tipPaid
    const balance = Math.max(0, total - amountPaid)
    // Date display — boarding shows a range, grooming a single date.
    let apptDate = ""
    let apptTime = ""
    if (isBoardingReq) {
      const s = appt.start_date ? new Date(appt.start_date + "T00:00:00") : null
      const e = appt.end_date ? new Date(appt.end_date + "T00:00:00") : null
      if (s && e && s.toDateString() !== e.toDateString()) {
        apptDate = s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
          " – " + e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      } else if (s) {
        apptDate = s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      }
    } else if (appt.appointment_date) {
      apptDate = new Date(appt.appointment_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      apptTime = appt.start_time ? formatTime(appt.start_time) : ""
    }
    const clientName = appt.clients ? `${appt.clients.first_name || ""} ${appt.clients.last_name || ""}`.trim() : ""
    const petsList = isBoardingReq
      ? (appt.boarding_reservation_pets || []).map((brp: any) => brp.pets?.name).filter(Boolean).join(", ")
      : (appt.appointment_pets || []).map((ap: any) => ap.pets?.name).filter(Boolean).join(", ")
    const receiptNo = appt.id ? appt.id.replace(/-/g, "").slice(-8).toUpperCase() : "—"
    const shopName = shop?.shop_name || "Your Groomer"

    const html = buildEmailHtml({
      shopName,
      shopAddress: shop?.address || "",
      shopPhone: shop?.phone || "",
      shopEmail: shop?.email || "",
      receiptNo, apptDate, apptTime, clientName, petsList,
      lineItems, subtotal, discount, discReason, total,
      payments: payments || [],
      amountPaid, tipPaid, grandTotal, balance,
    })

    // ─── Send via Resend ───
    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) {
      console.error("[email-receipt] RESEND_API_KEY missing")
      return jsonError("Email not configured (no Resend API key).", 500)
    }
    const fromLabel = shopName ? `${shopName} <${FROM_EMAIL_DEFAULT}>` : FROM_EMAIL_DEFAULT
    const subject = `Receipt #${receiptNo} from ${shopName}`
    const replyTo = shop?.email || undefined

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromLabel,
        to: [toEmail],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error("[email-receipt] Resend failed:", resendRes.status, errBody)
      return jsonError("Email send failed: " + errBody, 502)
    }

    return new Response(JSON.stringify({ ok: true, sent_to: toEmail }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("[email-receipt] uncaught:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

// Mirror of ReceiptModal.buildLineItems — keep these in sync.
function buildLineItems(appt: any): Array<{ label: string; price: number; petName?: string; indent?: boolean }> {
  const items: Array<{ label: string; price: number; petName?: string; indent?: boolean }> = []
  if (!appt) return items

  // Boarding: total_price minus addon prices = the stay portion + each addon
  if (appt.end_date || appt.start_date) {
    const nights = nightCount(appt.start_date, appt.end_date)
    const petNames = (appt.boarding_reservation_pets || [])
      .map((brp: any) => brp.pets?.name).filter(Boolean).join(", ")
    const stayPrice = parseFloat(appt.total_price || 0) -
      ((appt.boarding_addons || []).reduce((s: number, a: any) => s + parseFloat(a.price || 0), 0))
    items.push({
      label: `Boarding${nights ? ` (${nights} night${nights === 1 ? "" : "s"})` : ""}`,
      price: Math.max(0, stayPrice),
      petName: petNames,
    })
    for (const addon of (appt.boarding_addons || [])) {
      items.push({
        label: addon.description || prettyAddonType(addon.addon_type) || "Add-on",
        price: parseFloat(addon.price || 0),
        indent: true,
      })
    }
    return items
  }

  // Grooming multi-pet
  if (appt.appointment_pets && appt.appointment_pets.length > 0) {
    for (const ap of appt.appointment_pets) {
      const petName = ap.pets?.name || ""
      const svc = ap.services
      if (svc) {
        items.push({ label: svc.service_name || "Service", price: parseFloat(ap.price ?? svc.price ?? 0), petName })
      }
      if (ap.appointment_pet_addons && ap.appointment_pet_addons.length > 0) {
        for (const addon of ap.appointment_pet_addons) {
          items.push({
            label: addon.services?.service_name || "Add-on",
            price: parseFloat(addon.price ?? addon.services?.price ?? 0),
            petName,
            indent: true,
          })
        }
      }
    }
    return items
  }
  // Grooming legacy
  if (appt.services) {
    items.push({ label: appt.services.service_name || "Service", price: parseFloat(appt.quoted_price ?? appt.services.price ?? 0) })
  } else if (appt.quoted_price) {
    items.push({ label: "Service", price: parseFloat(appt.quoted_price) })
  }
  return items
}

function nightCount(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0
  const s = new Date(startISO + "T00:00:00")
  const e = new Date(endISO + "T00:00:00")
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

function prettyAddonType(t: string): string {
  const map: Record<string, string> = {
    bath: "Bath", groom: "Groom", playtime: "Playtime",
    meds_admin: "Medication Administration", daycare: "Daycare",
    extra_walk: "Extra Walk", other: "Other",
  }
  return map[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : "")
}

function formatTime(t: string): string {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`
}

// Email-friendly HTML — inline CSS, table-based layout in the heavy spots,
// Gmail/Outlook-safe colors. Mirrors ReceiptModal's buildPrintHtml visually.
function buildEmailHtml(d: any): string {
  const esc = (s: any) => s == null ? "" : String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;")

  let lineRows = ""
  for (const li of d.lineItems) {
    lineRows += `<tr>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;">${li.indent ? "↳ " : ""}${esc(li.label)}${li.petName ? ` <span style="color:#9ca3af;font-size:11px;">(${esc(li.petName)})</span>` : ""}</td>
      <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;text-align:right;">$${li.price.toFixed(2)}</td>
    </tr>`
  }
  if (!lineRows) {
    lineRows = `<tr><td colspan="2" style="padding:7px 0;color:#9ca3af;font-style:italic;">No services recorded.</td></tr>`
  }

  let payRows = ""
  for (const p of d.payments) {
    const refunded = parseFloat(p.refunded_amount || 0)
    const net = Math.max(0, parseFloat(p.amount || 0) - refunded)
    const tip = parseFloat(p.tip_amount || 0)
    const dt = p.created_at ? new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""
    payRows += `<tr>
      <td style="padding:2px 0;">${esc((p.method || "paid").toUpperCase())}${tip > 0 ? ` (+$${tip.toFixed(2)} tip)` : ""} · ${esc(dt)}${refunded > 0 ? ` · refund $${refunded.toFixed(2)}` : ""}</td>
      <td style="padding:2px 0;text-align:right;font-weight:700;">$${(net + tip).toFixed(2)}</td>
    </tr>`
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;padding:32px;color:#1f2937;font-size:13px;">

    <div style="text-align:center;padding-bottom:14px;border-bottom:3px solid #7c3aed;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:800;color:#7c3aed;">${esc(d.shopName)}</div>
      ${d.shopAddress ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">${esc(d.shopAddress)}</div>` : ""}
      ${(d.shopPhone || d.shopEmail) ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${esc([d.shopPhone, d.shopEmail].filter(Boolean).join(" · "))}</div>` : ""}
    </div>

    <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:12px;">
      <div><strong>Receipt #</strong> ${esc(d.receiptNo)}</div>
      <div>${esc(d.apptDate)}${d.apptTime ? " · " + esc(d.apptTime) : ""}</div>
    </div>

    <div style="background:#f9fafb;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;">
      <div><strong>Client:</strong> ${esc(d.clientName || "—")}</div>
      ${d.petsList ? `<div style="margin-top:4px;"><strong>Pet${d.petsList.includes(",") ? "s" : ""}:</strong> ${esc(d.petsList)}</div>` : ""}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;">
      <thead>
        <tr><th style="text-align:left;padding:6px 0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Item</th>
        <th style="text-align:right;padding:6px 0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Price</th></tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    <div style="border-top:2px solid #1f2937;padding-top:8px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Subtotal</span><span>$${d.subtotal.toFixed(2)}</span></div>
      ${d.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#dc2626;"><span>Discount${d.discReason ? " — " + esc(d.discReason) : ""}</span><span>-$${d.discount.toFixed(2)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:800;"><span>Total</span><span>$${d.total.toFixed(2)}</span></div>
      ${d.tipPaid > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#16a34a;"><span>Tip</span><span>$${d.tipPaid.toFixed(2)}</span></div>` : ""}
      ${d.tipPaid > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:800;"><span>Grand Total</span><span>$${d.grandTotal.toFixed(2)}</span></div>` : ""}
    </div>

    ${d.payments.length > 0 ? `
    <div style="background:#f0fdf4;padding:10px 14px;border-radius:8px;margin-top:14px;font-size:12px;">
      <div style="font-weight:700;color:#166534;margin-bottom:6px;">💳 Payment${d.payments.length > 1 ? "s" : ""}</div>
      <table style="width:100%;border-collapse:collapse;"><tbody>${payRows}</tbody></table>
      <div style="border-top:1px solid #bbf7d0;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:800;">
        <span>Total Paid</span><span>$${(d.amountPaid + d.tipPaid).toFixed(2)}</span>
      </div>
    </div>` : ""}

    ${d.balance > 0.01 ? `<div style="background:#fef2f2;padding:10px 14px;border-radius:8px;margin-top:10px;display:flex;justify-content:space-between;font-weight:800;color:#dc2626;"><span>Balance Due</span><span>$${d.balance.toFixed(2)}</span></div>` : ""}

    <div style="margin-top:22px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px;">
      Thank you for your business! 🐾
    </div>
  </div>
</body></html>`
}
