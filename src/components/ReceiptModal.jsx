// =============================================================================
// ReceiptModal.jsx — Printable / on-screen receipt for an appointment
// =============================================================================
// Reusable from BOTH sides of the app:
//   • Groomer-side Calendar appointment popup ("🧾 Receipt" button)
//   • Client portal past-appointment list ("Receipt" button)
//
// Renders on-screen as a clean modal AND offers a 🖨️ Print button that
// pops a new window with print-styled HTML and triggers window.print().
//
// Props:
//   appointment    (required) — the appointments row, ideally already joined
//                              with clients(*), pets(*), services(*), and
//                              appointment_pets(*, services(*),
//                              appointment_pet_addons(*, services(*))).
//                              Falls back gracefully if any joins are missing.
//   payments       (optional) — array of payments rows for this appointment.
//                              If empty, the totals show "Unpaid."
//   shopName       (optional) — shop_settings.shop_name for the header
//   shopAddress    (optional) — free-form address string (we don't store this
//                              yet — passed in if/when we add a column)
//   shopPhone      (optional) — same idea
//   shopEmail      (optional) — fallback to groomer's email
//   groomerName    (optional) — for the signature line at bottom
//   onClose        (required) — function to close the modal
// =============================================================================

import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ReceiptModal({
  appointment,
  payments = [],
  shopName = '',
  shopAddress = '',
  shopPhone = '',
  shopEmail = '',
  groomerName = '',
  onClose,
  // When true, shows the "📧 Email" button (groomer-side only — clients
  // don't need to email themselves a receipt). Defaults to false so the
  // client portal usage stays clean.
  allowEmail = false,
}) {
  // ─── Email Receipt state (only used when allowEmail) ───
  const [emailing, setEmailing] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)  // 'sent to ...' or error text

  async function handleEmail() {
    if (!appointment?.id) return
    const clientEmail = appointment.clients?.email || ''
    if (!clientEmail || !clientEmail.includes('@')) {
      setEmailMsg("⚠️ This client doesn't have an email on file. Add one in their profile first.")
      return
    }
    if (!confirm(`Email receipt to ${clientEmail}?`)) return
    setEmailing(true)
    setEmailMsg(null)
    try {
      // Boarding rows have end_date — send reservation_id; grooming sends appointment_id.
      const body = isBoarding(appointment)
        ? { reservation_id: appointment.id }
        : { appointment_id: appointment.id }
      const { data, error } = await supabase.functions.invoke('email-receipt', { body })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setEmailMsg(`✅ Sent to ${data?.sent_to || clientEmail}`)
    } catch (err) {
      console.error('[ReceiptModal] email error:', err)
      setEmailMsg('⚠️ ' + (err.message || 'Could not send'))
    } finally {
      setEmailing(false)
    }
  }

  // Build the line items list once. Handles both modern multi-pet bookings
  // (appointment_pets array) and legacy single-pet bookings (top-level service).
  const lineItems = useMemo(() => buildLineItems(appointment), [appointment])

  // Number crunching. We separate tip from amount so the receipt can show
  // each line clearly (some clients want to see the tip broken out).
  const subtotal     = lineItems.reduce((sum, li) => sum + li.price, 0)
  const discount     = parseFloat(appointment?.discount_amount || 0)
  const discReason   = appointment?.discount_reason || ''
  const total        = Math.max(0, subtotal - discount)

  // Sum payments — net of refunds (refunded_amount stored on the payment row).
  let amountPaid = 0
  let tipPaid    = 0
  for (const p of payments) {
    const amt = parseFloat(p.amount || 0)
    const tip = parseFloat(p.tip_amount || 0)
    const refunded = parseFloat(p.refunded_amount || 0)
    amountPaid += Math.max(0, amt - refunded)
    tipPaid    += tip
  }
  const grandTotal = total + tipPaid
  const balance    = Math.max(0, total - amountPaid)

  // Date display — boarding shows a range, grooming a single date.
  let apptDate = ''
  let apptTime = ''
  if (isBoarding(appointment)) {
    const s = appointment.start_date ? new Date(appointment.start_date + 'T00:00:00') : null
    const e = appointment.end_date ? new Date(appointment.end_date + 'T00:00:00') : null
    if (s && e && s.toDateString() !== e.toDateString()) {
      apptDate = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } else if (s) {
      apptDate = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
  } else if (appointment?.appointment_date) {
    apptDate = new Date(appointment.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    apptTime = appointment.start_time ? formatTime(appointment.start_time) : ''
  }

  // Client + pet display strings
  const clientName = appointment?.clients
    ? `${appointment.clients.first_name || ''} ${appointment.clients.last_name || ''}`.trim()
    : ''
  const petsList = getPetsList(appointment)

  // Receipt number = last 8 chars of appointment id (uppercase). Stable + unique enough.
  const receiptNo = appointment?.id ? appointment.id.replace(/-/g, '').slice(-8).toUpperCase() : '—'

  function handlePrint() {
    const html = buildPrintHtml({
      shopName, shopAddress, shopPhone, shopEmail, groomerName,
      receiptNo, apptDate, apptTime, clientName, petsList,
      lineItems, subtotal, discount, discReason, total, payments,
      amountPaid, tipPaid, grandTotal, balance,
    })
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) {
      alert('Please allow popups to print the receipt.')
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => { w.print() }, 300)
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '14px', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>

        {/* ─── Header bar (sticky-feel) ─── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: '#1f2937' }}>🧾 Receipt</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {allowEmail && (
              <button onClick={handleEmail} disabled={emailing}
                title="Email this receipt to the client"
                style={{ padding: '7px 14px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: emailing ? 'wait' : 'pointer' }}>
                {emailing ? 'Sending…' : '📧 Email'}
              </button>
            )}
            <button onClick={handlePrint}
              style={{ padding: '7px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              🖨️ Print
            </button>
            <button onClick={onClose}
              style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9ca3af', lineHeight: 1, padding: '0 6px' }}>×</button>
          </div>
        </div>
        {/* Email status banner (just below header) */}
        {emailMsg && (
          <div style={{ padding: '8px 20px', background: emailMsg.startsWith('✅') ? '#ecfdf5' : '#fef2f2', color: emailMsg.startsWith('✅') ? '#065f46' : '#991b1b', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>
            {emailMsg}
          </div>
        )}

        {/* ─── Receipt body ─── */}
        <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1f2937' }}>

          {/* Shop block */}
          <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '2px solid #7c3aed', marginBottom: '14px' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#7c3aed' }}>{shopName || 'Your Shop'}</div>
            {shopAddress && <div style={{ fontSize: '12px', color: '#6b7280' }}>{shopAddress}</div>}
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              {[shopPhone, shopEmail].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Receipt # / date */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '14px' }}>
            <div><strong>Receipt #</strong> {receiptNo}</div>
            <div>{apptDate}{apptTime ? ' · ' + apptTime : ''}</div>
          </div>

          {/* Client / pet */}
          <div style={{ background: '#f9fafb', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
            <div><strong>Client:</strong> {clientName || '—'}</div>
            {petsList && <div style={{ marginTop: '4px' }}><strong>Pet{petsList.includes(',') ? 's' : ''}:</strong> {petsList}</div>}
          </div>

          {/* Line items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
                <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr><td colSpan={2} style={{ padding: '10px 0', color: '#9ca3af', fontStyle: 'italic' }}>No services recorded.</td></tr>
              ) : lineItems.map((li, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 0', verticalAlign: 'top' }}>
                    {li.indent && <span style={{ color: '#9ca3af', marginRight: '4px' }}>↳</span>}
                    {li.label}
                    {li.petName && <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>({li.petName})</span>}
                  </td>
                  <td style={{ padding: '8px 0', textAlign: 'right', verticalAlign: 'top' }}>${li.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ borderTop: '2px solid #1f2937', paddingTop: '10px', fontSize: '13px' }}>
            <Row label="Subtotal" value={subtotal} />
            {discount > 0 && (
              <Row label={'Discount' + (discReason ? ' — ' + discReason : '')} value={-discount} color="#dc2626" />
            )}
            <Row label="Total" value={total} bold />
            {tipPaid > 0 && <Row label="Tip" value={tipPaid} color="#16a34a" />}
            {tipPaid > 0 && <Row label="Grand Total" value={grandTotal} bold />}
          </div>

          {/* Payment(s) */}
          {payments.length > 0 && (
            <div style={{ marginTop: '14px', background: '#f0fdf4', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: '6px' }}>💳 Payment{payments.length > 1 ? 's' : ''}</div>
              {payments.map(p => {
                const refunded = parseFloat(p.refunded_amount || 0)
                const net = Math.max(0, parseFloat(p.amount || 0) - refunded)
                const tip = parseFloat(p.tip_amount || 0)
                const dt = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{(p.method || 'paid').toUpperCase()}{tip > 0 ? ` (+$${tip.toFixed(2)} tip)` : ''} · {dt}{refunded > 0 ? ' · refund $' + refunded.toFixed(2) : ''}</span>
                    <span style={{ fontWeight: 700 }}>${(net + tip).toFixed(2)}</span>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid #bbf7d0', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>Total Paid</span>
                <span>${(amountPaid + tipPaid).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Balance due */}
          {balance > 0.01 && (
            <div style={{ marginTop: '10px', background: '#fef2f2', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#dc2626' }}>
              <span>Balance Due</span>
              <span>${balance.toFixed(2)}</span>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
            Thank you for your business! 🐾
            {groomerName && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>— {groomerName}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Tiny totals-row helper
function Row({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: color || '#1f2937', fontWeight: bold ? 800 : 500 }}>
      <span>{label}</span>
      <span>{value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// True if the passed object looks like a boarding reservation (has end_date)
// instead of a grooming appointment (has appointment_date).
function isBoarding(appt) {
  return !!(appt && (appt.end_date || appt.start_date))
}

// Build a flat line-items array out of an appointment OR a boarding reservation.
// Supports:
//   grooming modern: appointment.appointment_pets[].services + appointment_pet_addons[].services
//   grooming legacy: appointment.services (single top-level service)
//   boarding: total_price + boarding_addons + boarding_reservation_pets
function buildLineItems(appt) {
  const items = []
  if (!appt) return items

  // ─── Boarding path ─────────────────────────────────────────────────
  // Boarding doesn't have per-service line items the same way grooming
  // does — the main "service" is the stay itself (X nights at total_price)
  // plus any boarding_addons. Pets are shown as a comma-separated suffix.
  if (isBoarding(appt)) {
    const nights = nightCount(appt.start_date, appt.end_date)
    const petNames = (appt.boarding_reservation_pets || [])
      .map(brp => brp.pets?.name)
      .filter(Boolean)
      .join(', ')
    const stayPrice = parseFloat(appt.total_price || 0) -
      ((appt.boarding_addons || []).reduce((s, a) => s + parseFloat(a.price || 0), 0))
    items.push({
      label: `Boarding${nights ? ` (${nights} night${nights === 1 ? '' : 's'})` : ''}`,
      price: Math.max(0, stayPrice),  // never negative if addons total exceeds stored total
      petName: petNames,
    })
    for (const addon of (appt.boarding_addons || [])) {
      items.push({
        label: addon.description || prettyAddonType(addon.addon_type) || 'Add-on',
        price: parseFloat(addon.price || 0),
        indent: true,
      })
    }
    return items
  }

  // ─── Grooming multi-pet (modern) path ─────────────────────────────
  if (appt.appointment_pets && appt.appointment_pets.length > 0) {
    for (const ap of appt.appointment_pets) {
      const petName = ap.pets?.name || ''
      const svc = ap.services
      if (svc) {
        items.push({
          label: svc.service_name || 'Service',
          price: parseFloat(ap.price ?? svc.price ?? 0),
          petName,
        })
      }
      // Add-ons under this pet
      if (ap.appointment_pet_addons && ap.appointment_pet_addons.length > 0) {
        for (const addon of ap.appointment_pet_addons) {
          const addonSvc = addon.services
          items.push({
            label: addonSvc?.service_name || 'Add-on',
            price: parseFloat(addon.price ?? addonSvc?.price ?? 0),
            petName,
            indent: true,
          })
        }
      }
    }
    return items
  }

  // ─── Grooming legacy single-pet path ──────────────────────────────
  if (appt.services) {
    items.push({
      label: appt.services.service_name || 'Service',
      price: parseFloat(appt.quoted_price ?? appt.services.price ?? 0),
    })
  } else if (appt.quoted_price) {
    items.push({
      label: 'Service',
      price: parseFloat(appt.quoted_price),
    })
  }
  return items
}

// Inclusive night count between two ISO dates (YYYY-MM-DD).
// "May 15 to May 18" = 3 nights.
function nightCount(startISO, endISO) {
  if (!startISO || !endISO) return 0
  const s = new Date(startISO + 'T00:00:00')
  const e = new Date(endISO + 'T00:00:00')
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

// Friendly label for boarding_addons.addon_type enum
function prettyAddonType(t) {
  const map = {
    bath: 'Bath', groom: 'Groom', playtime: 'Playtime',
    meds_admin: 'Medication Administration', daycare: 'Daycare',
    extra_walk: 'Extra Walk', other: 'Other',
  }
  return map[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : '')
}

function getPetsList(appt) {
  if (!appt) return ''
  // Boarding multi-pet
  if (appt.boarding_reservation_pets && appt.boarding_reservation_pets.length > 0) {
    return appt.boarding_reservation_pets.map(brp => brp.pets?.name).filter(Boolean).join(', ')
  }
  // Grooming multi-pet
  if (appt.appointment_pets && appt.appointment_pets.length > 0) {
    return appt.appointment_pets.map(ap => ap.pets?.name).filter(Boolean).join(', ')
  }
  return appt.pets?.name || ''
}

function formatTime(t) {
  // "14:30:00" -> "2:30 PM"
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

// Build the print-window HTML (clean, branded, single-page-friendly).
function buildPrintHtml(d) {
  const esc = (s) => s == null ? '' : String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')

  let lineRows = ''
  for (const li of d.lineItems) {
    lineRows += `<tr>
      <td>${li.indent ? '↳ ' : ''}${esc(li.label)}${li.petName ? ` <span class="pet">(${esc(li.petName)})</span>` : ''}</td>
      <td class="r">$${li.price.toFixed(2)}</td>
    </tr>`
  }
  if (!lineRows) lineRows = '<tr><td colspan="2" class="muted">No services recorded.</td></tr>'

  let payRows = ''
  for (const p of d.payments) {
    const refunded = parseFloat(p.refunded_amount || 0)
    const net = Math.max(0, parseFloat(p.amount || 0) - refunded)
    const tip = parseFloat(p.tip_amount || 0)
    const dt = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    payRows += `<tr>
      <td>${esc((p.method || 'paid').toUpperCase())}${tip > 0 ? ` (+$${tip.toFixed(2)} tip)` : ''} · ${esc(dt)}${refunded > 0 ? ' · refund $' + refunded.toFixed(2) : ''}</td>
      <td class="r">$${(net + tip).toFixed(2)}</td>
    </tr>`
  }

  return `<!DOCTYPE html><html><head>
<title>Receipt — ${esc(d.shopName || 'Your Shop')}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1f2937; font-size: 13px; }
  .head { text-align: center; padding-bottom: 14px; border-bottom: 3px solid #7c3aed; margin-bottom: 18px; }
  .shop { font-size: 22px; font-weight: 800; color: #7c3aed; }
  .meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 12px; }
  .info { background: #f9fafb; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { padding: 7px 0; }
  th { text-align: left; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
  td { border-bottom: 1px solid #f3f4f6; }
  .r { text-align: right; }
  .pet { color: #9ca3af; font-size: 10px; }
  .muted { color: #9ca3af; font-style: italic; }
  .totals { border-top: 2px solid #1f2937; padding-top: 8px; }
  .totals .line { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .line.bold { font-weight: 800; }
  .pay-block { background: #f0fdf4; padding: 10px 14px; border-radius: 8px; margin-top: 14px; font-size: 12px; }
  .pay-title { font-weight: 700; color: #166534; margin-bottom: 6px; }
  .pay-total { border-top: 1px solid #bbf7d0; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-weight: 800; }
  .balance { background: #fef2f2; padding: 10px 14px; border-radius: 8px; margin-top: 10px; display: flex; justify-content: space-between; font-weight: 800; color: #dc2626; }
  .foot { margin-top: 22px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 12px; }
  @media print {
    body { padding: 16px; }
    .head, .info, .pay-block, .balance { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
  <div class="head">
    <div class="shop">${esc(d.shopName || 'Your Shop')}</div>
    ${d.shopAddress ? `<div class="meta">${esc(d.shopAddress)}</div>` : ''}
    ${(d.shopPhone || d.shopEmail) ? `<div class="meta">${esc([d.shopPhone, d.shopEmail].filter(Boolean).join(' · '))}</div>` : ''}
  </div>
  <div class="row">
    <div><strong>Receipt #</strong> ${esc(d.receiptNo)}</div>
    <div>${esc(d.apptDate)}${d.apptTime ? ' · ' + esc(d.apptTime) : ''}</div>
  </div>
  <div class="info">
    <div><strong>Client:</strong> ${esc(d.clientName || '—')}</div>
    ${d.petsList ? `<div style="margin-top:4px;"><strong>Pet${d.petsList.includes(',') ? 's' : ''}:</strong> ${esc(d.petsList)}</div>` : ''}
  </div>
  <table>
    <thead><tr><th>Item</th><th class="r">Price</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div class="line"><span>Subtotal</span><span>$${d.subtotal.toFixed(2)}</span></div>
    ${d.discount > 0 ? `<div class="line" style="color:#dc2626;"><span>Discount${d.discReason ? ' — ' + esc(d.discReason) : ''}</span><span>-$${d.discount.toFixed(2)}</span></div>` : ''}
    <div class="line bold"><span>Total</span><span>$${d.total.toFixed(2)}</span></div>
    ${d.tipPaid > 0 ? `<div class="line" style="color:#16a34a;"><span>Tip</span><span>$${d.tipPaid.toFixed(2)}</span></div>` : ''}
    ${d.tipPaid > 0 ? `<div class="line bold"><span>Grand Total</span><span>$${d.grandTotal.toFixed(2)}</span></div>` : ''}
  </div>
  ${d.payments.length > 0 ? `
  <div class="pay-block">
    <div class="pay-title">💳 Payment${d.payments.length > 1 ? 's' : ''}</div>
    <table style="margin:0;"><tbody>${payRows}</tbody></table>
    <div class="pay-total"><span>Total Paid</span><span>$${(d.amountPaid + d.tipPaid).toFixed(2)}</span></div>
  </div>` : ''}
  ${d.balance > 0.01 ? `<div class="balance"><span>Balance Due</span><span>$${d.balance.toFixed(2)}</span></div>` : ''}
  <div class="foot">
    Thank you for your business! 🐾
    ${d.groomerName ? `<div style="margin-top:4px;font-style:italic;">— ${esc(d.groomerName)}</div>` : ''}
  </div>
</body></html>`
}
