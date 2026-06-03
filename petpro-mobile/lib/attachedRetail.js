// attachedRetail.js — retail items attached to an appointment (parked sale).
// Ported from the website's src/lib/attachedRetail.js so the app reads/writes
// the exact same `sales` + `sale_items` tables and inventory flow.
import { supabase } from './supabase';

export async function loadAttached({ appointmentId, boardingReservationId, groomerId }) {
  if (!appointmentId && !boardingReservationId) return { sale: null, items: [] };
  let q = supabase
    .from('sales')
    .select('*, sale_items(*, products(*))')
    .eq('groomer_id', groomerId)
    .eq('status', 'parked');
  q = appointmentId ? q.eq('appointment_id', appointmentId) : q.eq('boarding_reservation_id', boardingReservationId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return { sale: null, items: [] };
  const items = (data.sale_items || []).map((li) => {
    const prod = li.products;
    return {
      product_id: li.product_id,
      custom_name: li.custom_name,
      name: li.custom_name || (prod && prod.name) || '(removed product)',
      qty: li.qty,
      unit_price: parseFloat(li.unit_price) || 0,
      line_total: parseFloat(li.line_total) || 0,
      product: prod || null,
    };
  });
  return { sale: data, items };
}

export async function saveAttached({ appointmentId, boardingReservationId, groomerId, clientId, items }) {
  if (!groomerId || (!appointmentId && !boardingReservationId)) throw new Error('groomerId and a target id required');

  let findQ = supabase.from('sales').select('id').eq('groomer_id', groomerId).eq('status', 'parked');
  findQ = appointmentId ? findQ.eq('appointment_id', appointmentId) : findQ.eq('boarding_reservation_id', boardingReservationId);
  const { data: existing } = await findQ.maybeSingle();

  if (!items || items.length === 0) {
    if (existing && existing.id) {
      await supabase.from('sale_items').delete().eq('sale_id', existing.id);
      await supabase.from('sales').delete().eq('id', existing.id);
    }
    return null;
  }

  const subtotal = items.reduce((s, l) => s + (parseFloat(l.line_total) || 0), 0);
  let saleId = existing && existing.id;
  if (saleId) {
    const { error: uErr } = await supabase.from('sales')
      .update({ subtotal, total: subtotal, client_id: clientId || null }).eq('id', saleId);
    if (uErr) throw uErr;
    await supabase.from('sale_items').delete().eq('sale_id', saleId);
  } else {
    const { data: created, error: iErr } = await supabase.from('sales').insert({
      groomer_id: groomerId,
      client_id: clientId || null,
      appointment_id: appointmentId || null,
      boarding_reservation_id: boardingReservationId || null,
      subtotal,
      discount_amount: 0,
      tax_amount: 0,
      tip_amount: 0,
      total: subtotal,
      payment_status: 'unpaid',
      status: 'parked',
      parked_label: appointmentId ? 'Attached to appointment' : 'Attached to boarding pickup',
    }).select().single();
    if (iErr) throw iErr;
    saleId = created.id;
  }

  const itemPayloads = items.map((li) => ({
    sale_id: saleId,
    product_id: li.product_id || null,
    custom_name: li.custom_name || null,
    qty: li.qty,
    unit_price: li.unit_price,
    line_total: li.line_total,
  }));
  const { error: siErr } = await supabase.from('sale_items').insert(itemPayloads);
  if (siErr) throw siErr;
  return { id: saleId };
}

export async function markCompleted({ saleId, paymentMethod, userId }) {
  if (!saleId) return;
  const { data: items, error: e1 } = await supabase
    .from('sale_items').select('*, products(qty_on_hand)').eq('sale_id', saleId);
  if (e1) throw e1;
  const { error: eUp } = await supabase.from('sales').update({
    status: 'completed', payment_status: 'paid', payment_method: paymentMethod || 'attached_to_appointment',
  }).eq('id', saleId);
  if (eUp) throw eUp;
  for (let i = 0; i < (items || []).length; i++) {
    const li = items[i];
    if (!li.product_id) continue;
    const currentQty = parseInt(li.products && li.products.qty_on_hand, 10) || 0;
    await supabase.from('products').update({ qty_on_hand: currentQty - li.qty }).eq('id', li.product_id);
    await supabase.from('inventory_movements').insert({
      groomer_id: userId, product_id: li.product_id, qty_change: -li.qty, reason: 'sale', reference_id: saleId,
    });
  }
}
