// =============================================================================
// lib/receipt.js — Build receipt data + print HTML for the mobile app.
// Mirrors the website's ReceiptModal logic so app + web receipts match.
// Works for grooming appointments, boarding reservations, and POS sales.
// =============================================================================

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
export function money(v) { return `$${num(v).toFixed(2)}`; }

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}
function nightCount(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO + 'T00:00:00');
  const e = new Date(endISO + 'T00:00:00');
  return Math.max(0, Math.round((e - s) / 86400000));
}
function prettyAddonType(t) {
  const map = { bath: 'Bath', groom: 'Groom', playtime: 'Playtime', meds_admin: 'Medication Administration', daycare: 'Daycare', extra_walk: 'Extra Walk', other: 'Other' };
  return map[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
}
function isBoarding(r) { return !!(r && (r.end_date || r.start_date)); }

// ---- line items -----------------------------------------------------------
export function buildLineItems(appt) {
  const items = [];
  if (!appt) return items;

  if (isBoarding(appt)) {
    const nights = nightCount(appt.start_date, appt.end_date);
    const petNames = (appt.boarding_reservation_pets || []).map((b) => b.pets && b.pets.name).filter(Boolean).join(', ');
    const addonsTotal = (appt.boarding_addons || []).reduce((s, a) => s + num(a.price), 0);
    const stayPrice = num(appt.total_price) - addonsTotal;
    items.push({ label: `Boarding${nights ? ` (${nights} night${nights === 1 ? '' : 's'})` : ''}`, price: Math.max(0, stayPrice), petName: petNames });
    (appt.boarding_addons || []).forEach((a) => items.push({ label: a.description || prettyAddonType(a.addon_type) || 'Add-on', price: num(a.price), indent: true }));
    return items;
  }

  if (appt.appointment_pets && appt.appointment_pets.length > 0) {
    appt.appointment_pets.forEach((ap) => {
      const petName = (ap.pets && ap.pets.name) || '';
      if (ap.services) items.push({ label: ap.services.service_name || 'Service', price: num(ap.quoted_price != null ? ap.quoted_price : ap.services.price), petName });
      (ap.appointment_pet_addons || []).forEach((addon) => {
        const svc = addon.services;
        items.push({ label: (svc && svc.service_name) || 'Add-on', price: num(addon.quoted_price != null ? addon.quoted_price : (svc && svc.price)), petName, indent: true });
      });
    });
    return items;
  }

  if (appt.services) items.push({ label: appt.services.service_name || 'Service', price: num(appt.quoted_price != null ? appt.quoted_price : appt.services.price) });
  else if (appt.quoted_price) items.push({ label: 'Service', price: num(appt.quoted_price) });
  return items;
}

export function buildSaleLineItems(sale) {
  if (!sale) return [];
  return (sale.sale_items || []).map((li) => ({
    label: (li.products && li.products.name) || li.custom_name || 'Item',
    price: num(li.line_total),
    petName: li.qty > 1 ? `${li.qty} × ${money(li.unit_price)}` : '',
  }));
}

export function petsListOf(appt) {
  if (!appt) return '';
  if (appt.boarding_reservation_pets && appt.boarding_reservation_pets.length) return appt.boarding_reservation_pets.map((b) => b.pets && b.pets.name).filter(Boolean).join(', ');
  if (appt.appointment_pets && appt.appointment_pets.length) return appt.appointment_pets.map((ap) => ap.pets && ap.pets.name).filter(Boolean).join(', ');
  return (appt.pets && appt.pets.name) || '';
}

// ---- full receipt model ---------------------------------------------------
// kind: 'appointment' | 'boarding' | 'sale'
export function buildReceiptModel({ kind, row, payments = [], shop = {}, groomerName = '' }) {
  const isSale = kind === 'sale';
  const lineItems = isSale ? buildSaleLineItems(row) : buildLineItems(row);
  const subtotal = isSale ? num(row.subtotal != null ? row.subtotal : lineItems.reduce((s, li) => s + li.price, 0))
    : lineItems.reduce((s, li) => s + li.price, 0);
  const discount = isSale ? num(row.discount_amount) : num(row.discount_amount);
  const discReason = row.discount_reason || '';
  const total = Math.max(0, subtotal - discount);

  // payments + tip
  let amountPaid = 0, tipPaid = 0, payList = [];
  if (isSale) {
    tipPaid = num(row.tip_amount);
    if (row.payment_status === 'paid') {
      amountPaid = total;
      payList = [{ id: row.id, method: row.payment_method || 'paid', amount: total, tip_amount: tipPaid, created_at: row.created_at }];
    }
  } else {
    payList = payments || [];
    payList.forEach((p) => {
      const refunded = num(p.refunded_amount);
      amountPaid += Math.max(0, num(p.amount) - refunded);
      tipPaid += num(p.tip_amount);
    });
  }
  const grandTotal = total + tipPaid;
  const balance = Math.max(0, total - amountPaid);

  // dates
  let dateLabel = '', timeLabel = '';
  if (kind === 'boarding') {
    const s = row.start_date ? new Date(row.start_date + 'T00:00:00') : null;
    const e = row.end_date ? new Date(row.end_date + 'T00:00:00') : null;
    if (s && e && s.toDateString() !== e.toDateString()) dateLabel = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    else if (s) dateLabel = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } else if (kind === 'appointment' && row.appointment_date) {
    dateLabel = new Date(row.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    timeLabel = row.start_time ? fmtTime(row.start_time) : '';
  } else if (isSale && row.created_at) {
    dateLabel = new Date(row.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  const c = row.clients || {};
  const clientName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
  const receiptNo = row.id ? String(row.id).replace(/-/g, '').slice(-8).toUpperCase() : '—';

  return {
    shopName: shop.shop_name || 'Your Shop',
    shopAddress: shop.address || '',
    shopPhone: shop.phone || '',
    shopEmail: shop.email || '',
    groomerName,
    receiptNo, dateLabel, timeLabel,
    clientName, clientEmail: c.email || '', clientPhone: c.phone || '',
    petsList: isSale ? '' : petsListOf(row),
    lineItems, subtotal, discount, discReason, total,
    tipPaid, grandTotal, amountPaid, balance,
    payments: payList,
  };
}

// ---- SMS summary (full itemized list is unreadable over SMS) ---------------
export function smsSummary(m) {
  const lines = [];
  lines.push(`Receipt from ${m.shopName}`);
  if (m.dateLabel) lines.push(m.dateLabel + (m.timeLabel ? ` · ${m.timeLabel}` : ''));
  if (m.petsList) lines.push(`Pet${m.petsList.includes(',') ? 's' : ''}: ${m.petsList}`);
  lines.push(`Total: ${money(m.grandTotal)}`);
  if (m.balance > 0.01) lines.push(`Balance due: ${money(m.balance)}`);
  else if (m.amountPaid > 0) lines.push('Paid in full ✓');
  lines.push('Thank you! 🐾');
  return lines.join('\n');
}

// ---- print HTML (mirrors web buildPrintHtml) ------------------------------
function esc(s) {
  return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
export function receiptHtml(m) {
  let lineRows = '';
  m.lineItems.forEach((li) => {
    lineRows += `<tr><td>${li.indent ? '↳ ' : ''}${esc(li.label)}${li.petName ? ` <span class="pet">(${esc(li.petName)})</span>` : ''}</td><td class="r">${money(li.price)}</td></tr>`;
  });
  if (!lineRows) lineRows = '<tr><td colspan="2" class="muted">No services recorded.</td></tr>';

  let payRows = '';
  m.payments.forEach((p) => {
    const refunded = num(p.refunded_amount);
    const net = Math.max(0, num(p.amount) - refunded);
    const tip = num(p.tip_amount);
    const dt = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    payRows += `<tr><td>${esc(String(p.method || 'paid').toUpperCase())}${tip > 0 ? ` (+${money(tip)} tip)` : ''} · ${esc(dt)}${refunded > 0 ? ' · refund ' + money(refunded) : ''}</td><td class="r">${money(net + tip)}</td></tr>`;
  });

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt — ${esc(m.shopName)}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1f2937; font-size: 13px; }
  .head { text-align: center; padding-bottom: 14px; border-bottom: 3px solid #7c3aed; margin-bottom: 18px; }
  .shop { font-size: 22px; font-weight: 800; color: #7c3aed; }
  .meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 12px; }
  .info { background: #f9fafb; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { padding: 7px 0; }
  th { text-align: left; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e5e7eb; }
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
</style></head><body>
  <div class="head">
    <div class="shop">${esc(m.shopName)}</div>
    ${m.shopAddress ? `<div class="meta">${esc(m.shopAddress)}</div>` : ''}
    ${(m.shopPhone || m.shopEmail) ? `<div class="meta">${esc([m.shopPhone, m.shopEmail].filter(Boolean).join(' · '))}</div>` : ''}
  </div>
  <div class="row"><div><strong>Receipt #</strong> ${esc(m.receiptNo)}</div><div>${esc(m.dateLabel)}${m.timeLabel ? ' · ' + esc(m.timeLabel) : ''}</div></div>
  <div class="info">
    <div><strong>Client:</strong> ${esc(m.clientName || '—')}</div>
    ${m.petsList ? `<div style="margin-top:4px;"><strong>Pet${m.petsList.includes(',') ? 's' : ''}:</strong> ${esc(m.petsList)}</div>` : ''}
  </div>
  <table><thead><tr><th>Item</th><th class="r">Price</th></tr></thead><tbody>${lineRows}</tbody></table>
  <div class="totals">
    <div class="line"><span>Subtotal</span><span>${money(m.subtotal)}</span></div>
    ${m.discount > 0 ? `<div class="line" style="color:#dc2626;"><span>Discount${m.discReason ? ' — ' + esc(m.discReason) : ''}</span><span>-${money(m.discount)}</span></div>` : ''}
    <div class="line bold"><span>Total</span><span>${money(m.total)}</span></div>
    ${m.tipPaid > 0 ? `<div class="line" style="color:#16a34a;"><span>Tip</span><span>${money(m.tipPaid)}</span></div>` : ''}
    ${m.tipPaid > 0 ? `<div class="line bold"><span>Grand Total</span><span>${money(m.grandTotal)}</span></div>` : ''}
  </div>
  ${m.payments.length > 0 ? `<div class="pay-block"><div class="pay-title">💳 Payment${m.payments.length > 1 ? 's' : ''}</div><table style="margin:0;"><tbody>${payRows}</tbody></table><div class="pay-total"><span>Total Paid</span><span>${money(m.amountPaid + m.tipPaid)}</span></div></div>` : ''}
  ${m.balance > 0.01 ? `<div class="balance"><span>Balance Due</span><span>${money(m.balance)}</span></div>` : ''}
  <div class="foot">Thank you for your business! 🐾${m.groomerName ? `<div style="margin-top:4px;font-style:italic;">— ${esc(m.groomerName)}</div>` : ''}</div>
</body></html>`;
}
