// =============================================================================
// attachedRetail.js — Helper for retail items attached to appointments/boarding
// =============================================================================
// Real workflow: customer drops off dog → asks for a shampoo bottle / dog food.
// Groomer adds it to the appointment NOW (before payment) so when pickup
// happens the bill is already correct + every staff member who opens the
// appointment popup can see what was added.
//
// Implementation: we reuse `sales` with status='parked' + the appointment_id
// OR boarding_reservation_id FK as the link. One parked sale per target.
// When payment is recorded, the sale flips to 'completed', inventory
// decrements, and inventory_movements gets written.
//
// API:
//   loadAttached({ appointmentId, boardingReservationId, groomerId }) → sale + items
//   saveAttached({ appointmentId, boardingReservationId, groomerId, clientId, items }) → upserted sale
//   markCompleted({ saleId, paymentMethod, userId }) → decrements inventory
//   deleteAttached(saleId) → removes parked sale (e.g. customer changed mind)
// =============================================================================

import { supabase } from './supabase'

// Load the parked retail sale (if any) attached to an appointment OR boarding
// reservation. Returns { sale, items } or { sale: null, items: [] }.
export async function loadAttached({ appointmentId, boardingReservationId, groomerId }) {
  if (!appointmentId && !boardingReservationId) return { sale: null, items: [] }

  var q = supabase
    .from('sales')
    .select('*, sale_items(*, products(*))')
    .eq('groomer_id', groomerId)
    .eq('status', 'parked')

  if (appointmentId) q = q.eq('appointment_id', appointmentId)
  else q = q.eq('boarding_reservation_id', boardingReservationId)

  const { data, error } = await q.maybeSingle()
  if (error) {
    console.warn('[attachedRetail] load failed:', error)
    return { sale: null, items: [] }
  }
  if (!data) return { sale: null, items: [] }
  // Normalize items into the same shape AddRetailModal returns
  var items = (data.sale_items || []).map(function (li) {
    var prod = li.products
    return {
      product_id:  li.product_id,
      custom_name: li.custom_name,
      name:        li.custom_name || (prod && prod.name) || '(removed product)',
      qty:         li.qty,
      unit_price:  parseFloat(li.unit_price) || 0,
      line_total:  parseFloat(li.line_total) || 0,
      product:     prod || null,
    }
  })
  return { sale: data, items: items }
}

// Save (upsert) the attached retail. If items is empty, the parked sale is
// deleted so we don't have an empty row hanging around. Returns the sale row.
export async function saveAttached({ appointmentId, boardingReservationId, groomerId, clientId, items }) {
  if (!groomerId) throw new Error('groomerId required')
  if (!appointmentId && !boardingReservationId) throw new Error('Target id required')

  // Find existing parked sale for this target
  var findQ = supabase.from('sales').select('id').eq('groomer_id', groomerId).eq('status', 'parked')
  if (appointmentId) findQ = findQ.eq('appointment_id', appointmentId)
  else findQ = findQ.eq('boarding_reservation_id', boardingReservationId)
  const { data: existing } = await findQ.maybeSingle()

  // No items left? Delete parked sale.
  if (!items || items.length === 0) {
    if (existing && existing.id) {
      await supabase.from('sale_items').delete().eq('sale_id', existing.id)
      await supabase.from('sales').delete().eq('id', existing.id)
    }
    return null
  }

  var subtotal = items.reduce(function (s, l) { return s + (parseFloat(l.line_total) || 0) }, 0)

  // Upsert sale header
  var saleId = existing && existing.id
  if (saleId) {
    const { error: uErr } = await supabase
      .from('sales')
      .update({ subtotal: subtotal, total: subtotal, client_id: clientId || null })
      .eq('id', saleId)
    if (uErr) throw uErr
    // Wipe existing items + re-insert (simpler than diffing)
    await supabase.from('sale_items').delete().eq('sale_id', saleId)
  } else {
    var newSalePayload = {
      groomer_id:              groomerId,
      client_id:               clientId || null,
      appointment_id:          appointmentId || null,
      boarding_reservation_id: boardingReservationId || null,
      subtotal:                subtotal,
      discount_amount:         0,
      tax_amount:              0,
      tip_amount:              0,
      total:                   subtotal,
      payment_status:          'unpaid',
      status:                  'parked',
      parked_label:            appointmentId ? 'Attached to appointment' : 'Attached to boarding pickup',
    }
    const { data: created, error: iErr } = await supabase.from('sales').insert(newSalePayload).select().single()
    if (iErr) throw iErr
    saleId = created.id
  }

  // Insert items
  var itemPayloads = items.map(function (li) {
    return {
      sale_id:     saleId,
      product_id:  li.product_id || null,
      custom_name: li.custom_name || null,
      qty:         li.qty,
      unit_price:  li.unit_price,
      line_total:  li.line_total,
    }
  })
  const { error: siErr } = await supabase.from('sale_items').insert(itemPayloads)
  if (siErr) throw siErr

  return { id: saleId }
}

// Convert a parked sale to a completed one and decrement inventory.
// Called from the Take Payment flows after the customer pays.
export async function markCompleted({ saleId, paymentMethod, userId }) {
  if (!saleId) return
  // Load the items (and current product qty)
  const { data: items, error: e1 } = await supabase
    .from('sale_items')
    .select('*, products(qty_on_hand)')
    .eq('sale_id', saleId)
  if (e1) throw e1

  // Update sale → completed
  const { error: eUp } = await supabase
    .from('sales')
    .update({
      status:         'completed',
      payment_status: 'paid',
      payment_method: paymentMethod || 'attached_to_appointment',
    })
    .eq('id', saleId)
  if (eUp) throw eUp

  // Decrement inventory + log movements for product lines
  for (var i = 0; i < (items || []).length; i++) {
    var li = items[i]
    if (!li.product_id) continue
    var currentQty = parseInt(li.products && li.products.qty_on_hand, 10) || 0
    var newQty = currentQty - li.qty
    await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', li.product_id)
    await supabase.from('inventory_movements').insert({
      groomer_id:   userId,
      product_id:   li.product_id,
      qty_change:   -li.qty,
      reason:       'sale',
      reference_id: saleId,
    })
  }
}

// Hard-delete a parked sale (e.g. customer changed mind before paying).
export async function deleteAttached(saleId) {
  if (!saleId) return
  await supabase.from('sale_items').delete().eq('sale_id', saleId)
  await supabase.from('sales').delete().eq('id', saleId)
}
