// =============================================================================
// Refunds.jsx — Retail POS Phase 3.7 (Step 7): Partial + Full Refunds
// =============================================================================
// Lets the groomer find a recent sale, refund part or all of it, write the
// audit row (sale_refunds), reverse inventory for whichever items were
// returned, and flip the parent sale's payment_status accordingly.
//
// The flow is intentionally simple:
//   1. Search recent sales by # or customer name
//   2. Click a sale → side panel shows full breakdown
//   3. Pick refund amount (default = remaining refundable amount)
//   4. Pick reason (wrong item / damaged / dog reaction / etc)
//   5. Optionally check items to restock (for product items only)
//   6. Charge → writes sale_refunds row + restocks selected items
//
// Stripe refunds are not auto-issued — the groomer will refund via Stripe
// dashboard or the card terminal. We just log the refund in PetPro so the
// books match. Phase 5 (Stripe Terminal) will add auto-issue for card.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const REFUND_REASONS = [
  { id: 'wrong_item',             label: '🤷 Wrong item' },
  { id: 'damaged',                label: '📦 Damaged / defective' },
  { id: 'dog_reaction',           label: '🐶 Dog reacted to product' },
  { id: 'customer_changed_mind',  label: '↩️ Customer changed mind' },
  { id: 'duplicate_charge',       label: '🔁 Duplicate charge' },
  { id: 'service_issue',          label: '✂️ Service issue' },
  { id: 'other',                  label: '📝 Other' },
]

function money(n) {
  var v = parseFloat(n) || 0
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function dateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Refunds() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [search, setSearch] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [error, setError] = useState('')

  useEffect(function () { loadRecent() }, [])

  async function loadRecent() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      setUserId(user.id)
      // Last 90 days of completed sales — most refunds happen within weeks
      var ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error: e1 } = await supabase
        .from('sales')
        .select('id, total, payment_method, payment_status, created_at, client_id, clients(first_name, last_name)')
        .eq('groomer_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
      if (e1) throw e1
      setRecentSales(data || [])
    } catch (err) {
      setError(err.message || 'Could not load sales.')
    } finally {
      setLoading(false)
    }
  }

  const filteredSales = useMemo(function () {
    var term = (search || '').trim().toLowerCase()
    if (!term) return recentSales
    return recentSales.filter(function (s) {
      var idMatch = s.id.toLowerCase().indexOf(term) !== -1
      var nameMatch = s.clients && ((s.clients.first_name || '') + ' ' + (s.clients.last_name || '')).toLowerCase().indexOf(term) !== -1
      return idMatch || nameMatch
    })
  }, [recentSales, search])

  async function selectSale(saleId) {
    setError('')
    try {
      const { data, error: e1 } = await supabase
        .from('sales')
        .select(`
          *,
          clients(first_name, last_name),
          sale_items(*, products(name)),
          sale_payments(*),
          sale_refunds(*)
        `)
        .eq('id', saleId)
        .single()
      if (e1) throw e1
      setSelectedSale(data)
    } catch (err) {
      setError(err.message || 'Could not load sale.')
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>↩️ Refunds</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          Find a sale → refund all or part → inventory restocks automatically. Refund the customer via your usual method (Stripe, cash, etc).
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 480px)', gap: '16px', alignItems: 'start' }}>
        {/* LEFT — recent sales list */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
          <input
            type="text"
            placeholder="🔍 Search by sale # or customer name…"
            value={search}
            onChange={function (e) { setSearch(e.target.value) }}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' }}
            autoFocus
          />
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
          ) : filteredSales.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
              {recentSales.length === 0 ? 'No sales in the last 90 days.' : 'No sales match your search.'}
            </div>
          ) : (
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {filteredSales.map(function (s) {
                var who = s.clients ? (s.clients.first_name + ' ' + (s.clients.last_name || '')).trim() : 'Walk-in'
                var isSelected = selectedSale && selectedSale.id === s.id
                var refunded = s.payment_status === 'refunded' || s.payment_status === 'partial_refund'
                return (
                  <button
                    key={s.id}
                    onClick={function () { selectSale(s.id) }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: isSelected ? '#ede9fe' : '#fff',
                      border: '1px solid ' + (isSelected ? '#c4b5fd' : '#e5e7eb'),
                      borderRadius: '8px',
                      marginBottom: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{who}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        #{s.id.slice(0, 8).toUpperCase()} • {dateTime(s.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{money(s.total)}</div>
                      {refunded && (
                        <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>
                          {s.payment_status === 'refunded' ? 'Refunded' : 'Partial'}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT — refund panel */}
        {selectedSale ? (
          <RefundPanel
            sale={selectedSale}
            userId={userId}
            onDone={function () { setSelectedSale(null); loadRecent() }}
          />
        ) : (
          <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
            ← Pick a sale to refund
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Refund Panel — pick amount, reason, items to restock
// =============================================================================
function RefundPanel({ sale, userId, onDone }) {
  // Sum of all prior refunds on this sale
  var priorRefunded = (sale.sale_refunds || []).reduce(function (s, r) { return s + (parseFloat(r.amount) || 0) }, 0)
  var maxRefundable = Math.max(0, (parseFloat(sale.total) || 0) - priorRefunded)
  const [amount, setAmount] = useState(maxRefundable > 0 ? maxRefundable.toFixed(2) : '')
  const [reason, setReason] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [restockItems, setRestockItems] = useState({})  // { sale_item_id: true/false }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Re-init when sale changes
  useEffect(function () {
    var max = Math.max(0, (parseFloat(sale.total) || 0) - priorRefunded)
    setAmount(max > 0 ? max.toFixed(2) : '')
    setReason('')
    setReasonNote('')
    setRestockItems({})
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id])

  function toggleRestock(itemId) {
    setRestockItems(function (prev) { var n = Object.assign({}, prev); n[itemId] = !prev[itemId]; return n })
  }

  async function handleRefund() {
    var amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a positive refund amount.'); return }
    if (amt > maxRefundable + 0.001) { setError('Cannot refund more than ' + money(maxRefundable) + ' remaining.'); return }
    if (!reason) { setError('Please pick a reason.'); return }
    setSubmitting(true)
    setError('')
    try {
      // 1) Write sale_refunds row
      const { error: e1 } = await supabase.from('sale_refunds').insert({
        sale_id:    sale.id,
        groomer_id: userId,
        amount:     amt,
        reason:     reason,
        note:       reasonNote.trim() || null,
      })
      if (e1) throw e1

      // 2) Restock checked items (write inventory_movements + bump qty_on_hand)
      var checked = (sale.sale_items || []).filter(function (li) {
        return restockItems[li.id] && li.product_id
      })
      for (var i = 0; i < checked.length; i++) {
        var li = checked[i]
        // Get latest qty_on_hand for the product (concurrency-safe-ish)
        const { data: prod, error: ep } = await supabase.from('products').select('qty_on_hand').eq('id', li.product_id).single()
        if (ep) throw ep
        var newQty = (parseInt(prod.qty_on_hand, 10) || 0) + li.qty
        const { error: eu } = await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', li.product_id)
        if (eu) throw eu
        const { error: em } = await supabase.from('inventory_movements').insert({
          groomer_id:   userId,
          product_id:   li.product_id,
          qty_change:   li.qty,   // positive (stock back in)
          reason:       'return',
          reference_id: sale.id,
          note:         'Refund — restocked from sale ' + sale.id.slice(0, 8).toUpperCase(),
        })
        if (em) throw em
      }

      // 3) Update parent sale's payment_status (full vs partial)
      var newPriorRefunded = priorRefunded + amt
      var newStatus = Math.abs(newPriorRefunded - parseFloat(sale.total)) < 0.01 ? 'refunded' : 'partial_refund'
      const { error: es } = await supabase.from('sales').update({ payment_status: newStatus }).eq('id', sale.id)
      if (es) throw es

      onDone()
    } catch (err) {
      setError(err.message || 'Refund failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '17px', color: '#111827' }}>Refund Sale</h2>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
        #{sale.id.slice(0, 8).toUpperCase()} • {dateTime(sale.created_at)} • Paid via {sale.payment_method}
      </p>

      {/* Items list with restock checkboxes */}
      <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase' }}>Items</div>
        {(sale.sale_items || []).map(function (li) {
          var displayName = li.custom_name || (li.products && li.products.name) || '(deleted product)'
          var restockable = !!li.product_id
          return (
            <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {restockable && (
                  <input
                    type="checkbox"
                    checked={!!restockItems[li.id]}
                    onChange={function () { toggleRestock(li.id) }}
                    title="Restock this item"
                  />
                )}
                <span>{li.qty} × {displayName}</span>
              </div>
              <span style={{ color: '#6b7280' }}>{money(li.line_total)}</span>
            </div>
          )
        })}
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
          ☑ Check items to put back into inventory
        </div>
      </div>

      {/* Totals reference */}
      <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sale total</span><span style={{ fontWeight: 700 }}>{money(sale.total)}</span></div>
        {priorRefunded > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
            <span>Already refunded</span><span style={{ fontWeight: 700 }}>−{money(priorRefunded)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '4px', marginTop: '4px', fontWeight: 800 }}>
          <span>Refundable</span><span>{money(maxRefundable)}</span>
        </div>
      </div>

      {maxRefundable <= 0 ? (
        <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', color: '#065f46', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>
          ✓ This sale is already fully refunded.
        </div>
      ) : (
        <>
          {/* Refund amount */}
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Refund Amount</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={maxRefundable}
              value={amount}
              onChange={function (e) { setAmount(e.target.value) }}
              onFocus={function (e) { e.target.select() }}
              style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
            />
            <button
              onClick={function () { setAmount(maxRefundable.toFixed(2)) }}
              style={{ padding: '8px 12px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Full
            </button>
          </div>

          {/* Reason */}
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Reason *</div>
          <select
            value={reason}
            onChange={function (e) { setReason(e.target.value) }}
            style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', marginBottom: '10px', background: '#fff' }}
          >
            <option value="">— Pick reason —</option>
            {REFUND_REASONS.map(function (r) {
              return <option key={r.id} value={r.id}>{r.label}</option>
            })}
          </select>

          {/* Note */}
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Note (optional)</div>
          <input
            type="text"
            value={reasonNote}
            onChange={function (e) { setReasonNote(e.target.value) }}
            placeholder="e.g. 'dog had reaction to coconut shampoo'"
            style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' }}
          />

          {/* Reminder */}
          <div style={{ padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#854d0e', fontSize: '12px', marginBottom: '12px' }}>
            ⚠️ This logs the refund in PetPro. <strong>You still need to issue the money back</strong> to the customer (Stripe Dashboard, cash, etc).
          </div>

          {error && (
            <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '10px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleRefund}
            disabled={submitting}
            style={{ width: '100%', padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Logging…' : 'Refund ' + money(parseFloat(amount) || 0)}
          </button>
        </>
      )}
    </div>
  )
}
