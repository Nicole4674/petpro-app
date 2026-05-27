// =============================================================================
// RetailReports.jsx — Phase 6: Sales reports
// =============================================================================
// Gives the groomer a clean view of how their shop is performing on retail:
//   • Summary cards: Revenue, # Sales, Tips, Refunds, Avg Sale
//   • Top sellers (qty + revenue)
//   • Sales by category
//   • Sales by payment method
//   • Recent sales (clickable to drill into)
//   • CSV export
//
// Date ranges: Today / This Week / This Month / Year to Date / All Time
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORY_LABELS = {
  shampoo:     '🧴 Shampoo',
  conditioner: '💆 Conditioner',
  treats:      '🦴 Treats',
  food:        '🥣 Food',
  supplements: '💊 Supplements',
  brushes:     '🪮 Brushes',
  toys:        '🧸 Toys',
  apparel:     '👕 Apparel',
  accessories: '🎀 Accessories',
  other:       '📦 Other',
}

function money(n) {
  var v = parseFloat(n) || 0
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function shortDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x }

function getRange(preset) {
  var now = new Date()
  if (preset === 'today') {
    return [startOfDay(now), endOfDay(now)]
  }
  if (preset === 'week') {
    var start = startOfDay(now)
    start.setDate(start.getDate() - start.getDay())   // Sunday
    return [start, endOfDay(now)]
  }
  if (preset === 'month') {
    var ms = new Date(now.getFullYear(), now.getMonth(), 1)
    return [startOfDay(ms), endOfDay(now)]
  }
  if (preset === 'ytd') {
    var ys = new Date(now.getFullYear(), 0, 1)
    return [startOfDay(ys), endOfDay(now)]
  }
  // 'all'
  return [new Date('2020-01-01'), endOfDay(now)]
}

export default function RetailReports() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [datePreset, setDatePreset] = useState('month')
  const [sales, setSales] = useState([])
  const [refunds, setRefunds] = useState([])
  const [products, setProducts] = useState([])

  useEffect(function () { loadAll() }, [datePreset])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      var range = getRange(datePreset)
      var startIso = range[0].toISOString()
      var endIso = range[1].toISOString()

      const [salesRes, refundsRes, productsRes] = await Promise.all([
        supabase
          .from('sales')
          .select(`
            id, total, subtotal, tip_amount, discount_amount, tax_amount,
            payment_method, payment_status, status, created_at, client_id,
            clients(first_name, last_name),
            sale_items(id, qty, unit_price, line_total, product_id, custom_name, products(name, category))
          `)
          .eq('groomer_id', user.id)
          .eq('status', 'completed')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('sale_refunds')
          .select('id, sale_id, amount, reason, created_at')
          .eq('groomer_id', user.id)
          .gte('created_at', startIso)
          .lte('created_at', endIso),
        supabase
          .from('products')
          .select('id, name, category, qty_on_hand, low_stock_at, is_active'),
      ])

      if (salesRes.error) throw salesRes.error
      if (refundsRes.error) throw refundsRes.error
      if (productsRes.error) throw productsRes.error

      setSales(salesRes.data || [])
      setRefunds(refundsRes.data || [])
      setProducts(productsRes.data || [])
    } catch (err) {
      setError(err.message || 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived stats ───────────────────────────────────────────────────
  const totals = useMemo(function () {
    var revenue = 0, tips = 0, salesCount = 0
    sales.forEach(function (s) {
      revenue   += parseFloat(s.total) || 0
      tips      += parseFloat(s.tip_amount) || 0
      salesCount++
    })
    var refundedTotal = refunds.reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0) }, 0)
    var net = revenue - refundedTotal
    var avg = salesCount > 0 ? (revenue / salesCount) : 0
    return { revenue: revenue, tips: tips, salesCount: salesCount, refundedTotal: refundedTotal, net: net, avg: avg }
  }, [sales, refunds])

  // Top sellers (qty + revenue)
  const topSellers = useMemo(function () {
    var bucket = {}   // productId → { name, qty, revenue }
    sales.forEach(function (s) {
      (s.sale_items || []).forEach(function (li) {
        if (!li.product_id) return  // skip custom line items
        var key = li.product_id
        var name = (li.products && li.products.name) || '(removed)'
        if (!bucket[key]) bucket[key] = { name: name, qty: 0, revenue: 0 }
        bucket[key].qty += li.qty
        bucket[key].revenue += parseFloat(li.line_total) || 0
      })
    })
    return Object.values(bucket).sort(function (a, b) { return b.qty - a.qty }).slice(0, 10)
  }, [sales])

  // Sales by category
  const byCategory = useMemo(function () {
    var bucket = {}
    sales.forEach(function (s) {
      (s.sale_items || []).forEach(function (li) {
        var cat = (li.products && li.products.category) || (li.custom_name ? 'custom' : 'other')
        if (!bucket[cat]) bucket[cat] = { qty: 0, revenue: 0 }
        bucket[cat].qty += li.qty
        bucket[cat].revenue += parseFloat(li.line_total) || 0
      })
    })
    return Object.entries(bucket)
      .map(function (e) { return { id: e[0], label: CATEGORY_LABELS[e[0]] || (e[0] === 'custom' ? '✨ Custom items' : e[0]), qty: e[1].qty, revenue: e[1].revenue } })
      .sort(function (a, b) { return b.revenue - a.revenue })
  }, [sales])

  // Sales by payment method
  const byPaymentMethod = useMemo(function () {
    var bucket = {}
    sales.forEach(function (s) {
      var m = s.payment_method || 'unknown'
      if (!bucket[m]) bucket[m] = { count: 0, revenue: 0 }
      bucket[m].count++
      bucket[m].revenue += parseFloat(s.total) || 0
    })
    return Object.entries(bucket).map(function (e) { return { method: e[0], count: e[1].count, revenue: e[1].revenue } }).sort(function (a, b) { return b.revenue - a.revenue })
  }, [sales])

  // Low stock products (regardless of date range)
  const lowStock = useMemo(function () {
    return products
      .filter(function (p) { return p.is_active && p.low_stock_at != null && p.qty_on_hand <= p.low_stock_at })
      .sort(function (a, b) { return a.qty_on_hand - b.qty_on_hand })
  }, [products])

  // Max value for bar widths
  const maxCatRevenue = byCategory[0]?.revenue || 1

  // ─── CSV export ──────────────────────────────────────────────────────
  function exportCsv() {
    if (sales.length === 0) { alert('No sales to export in this range.'); return }
    var header = ['Date', 'Sale #', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Tip', 'Total', 'Payment Method', 'Status']
    var rows = sales.map(function (s) {
      var name = s.clients ? (s.clients.first_name + ' ' + (s.clients.last_name || '')).trim() : 'Walk-in'
      var itemsList = (s.sale_items || []).map(function (li) { return li.qty + 'x ' + (li.custom_name || (li.products && li.products.name) || '?') }).join('; ')
      return [
        shortDateTime(s.created_at),
        s.id.slice(0, 8).toUpperCase(),
        name,
        itemsList,
        parseFloat(s.subtotal || 0).toFixed(2),
        parseFloat(s.discount_amount || 0).toFixed(2),
        parseFloat(s.tax_amount || 0).toFixed(2),
        parseFloat(s.tip_amount || 0).toFixed(2),
        parseFloat(s.total || 0).toFixed(2),
        s.payment_method || '',
        s.payment_status || '',
      ]
    })
    var csv = [header, ...rows].map(function (row) { return row.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"' }).join(',') }).join('\n')
    var blob = new Blob([csv], { type: 'text/csv' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = 'petpro-retail-sales-' + datePreset + '-' + new Date().toISOString().split('T')[0] + '.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading && sales.length === 0) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#111827' }}>📊 Retail Reports</h1>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>📊 Retail Reports</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Sales, top sellers, payment breakdown, low stock — all in one place.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={sales.length === 0}
          style={{ padding: '8px 14px', background: '#fff', color: sales.length === 0 ? '#9ca3af' : '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: sales.length === 0 ? 'not-allowed' : 'pointer' }}
        >
          📥 Export CSV
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Date range chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'today', label: 'Today' },
          { id: 'week',  label: 'This Week' },
          { id: 'month', label: 'This Month' },
          { id: 'ytd',   label: 'Year to Date' },
          { id: 'all',   label: 'All Time' },
        ].map(function (p) {
          var isActive = datePreset === p.id
          return (
            <button
              key={p.id}
              onClick={function () { setDatePreset(p.id) }}
              style={{
                padding: '8px 14px',
                background: isActive ? '#7c3aed' : '#fff',
                color: isActive ? '#fff' : '#374151',
                border: '1px solid ' + (isActive ? '#7c3aed' : '#d1d5db'),
                borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <SummaryCard label="Revenue" value={money(totals.revenue)} color="#16a34a" hint={totals.salesCount + ' sales'} />
        <SummaryCard label="Net Revenue" value={money(totals.net)} color="#7c3aed" hint={totals.refundedTotal > 0 ? '−' + money(totals.refundedTotal) + ' refunded' : 'No refunds'} />
        <SummaryCard label="Tips Earned" value={money(totals.tips)} color="#f59e0b" />
        <SummaryCard label="Refunds" value={money(totals.refundedTotal)} color={totals.refundedTotal > 0 ? '#dc2626' : '#6b7280'} hint={refunds.length + ' refunds'} />
        <SummaryCard label="Avg Sale" value={money(totals.avg)} color="#0891b2" />
      </div>

      {/* Low stock alert (always visible if any) */}
      {lowStock.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#854d0e', marginBottom: '8px' }}>
            ⚠️ Low Stock — {lowStock.length} product{lowStock.length === 1 ? '' : 's'} need{lowStock.length === 1 ? 's' : ''} restocking
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
            {lowStock.map(function (p) {
              var out = p.qty_on_hand <= 0
              return (
                <div key={p.id} style={{ fontSize: '12px', padding: '6px 10px', background: '#fff', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: out ? '#dc2626' : '#b45309', fontWeight: 700 }}>{p.qty_on_hand} left</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Sellers + Categories side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#111827', fontWeight: 700 }}>🔥 Top Sellers</h2>
          {topSellers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No sales in this range yet.</div>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>Product</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map(function (t, idx) {
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 6px', color: '#111827' }}>{t.name}</td>
                      <td style={{ padding: '8px 6px', color: '#111827', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.qty}</td>
                      <td style={{ padding: '8px 6px', color: '#111827', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(t.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#111827', fontWeight: 700 }}>📦 By Category</h2>
          {byCategory.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No data yet.</div>
          ) : (
            byCategory.map(function (c) {
              return (
                <div key={c.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#374151' }}>{c.label}</span>
                    <span style={{ color: '#111827', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(c.revenue)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: ((c.revenue / maxCatRevenue) * 100) + '%', height: '100%', background: '#7c3aed', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Payment Method + Recent Sales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 2fr)', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#111827', fontWeight: 700 }}>💳 Payment Methods</h2>
          {byPaymentMethod.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No data.</div>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <tbody>
                {byPaymentMethod.map(function (p) {
                  return (
                    <tr key={p.method} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 4px', color: '#374151', textTransform: 'capitalize' }}>{p.method.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '8px 4px', color: '#6b7280', textAlign: 'right' }}>{p.count}×</td>
                      <td style={{ padding: '8px 4px', color: '#111827', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(p.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '14px', color: '#111827', fontWeight: 700 }}>🧾 Recent Sales</h2>
          {sales.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No sales in this range yet.</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', position: 'sticky', top: 0, background: '#fff' }}>
                    <th style={{ padding: '6px', fontWeight: 600 }}>When</th>
                    <th style={{ padding: '6px', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '6px', fontWeight: 600 }}>Items</th>
                    <th style={{ padding: '6px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.slice(0, 50).map(function (s) {
                    var name = s.clients ? (s.clients.first_name + ' ' + (s.clients.last_name || '')).trim() : 'Walk-in'
                    var nItems = (s.sale_items || []).reduce(function (sum, li) { return sum + li.qty }, 0)
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 6px', color: '#6b7280', fontSize: '11px' }}>{shortDateTime(s.created_at)}</td>
                        <td style={{ padding: '8px 6px', color: '#111827' }}>{name}</td>
                        <td style={{ padding: '8px 6px', color: '#6b7280' }}>{nItems} item{nItems === 1 ? '' : 's'}</td>
                        <td style={{ padding: '8px 6px', color: '#111827', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(s.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {sales.length > 50 && (
                <div style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>
                  Showing 50 of {sales.length}. Use CSV export to see all.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, hint }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '22px', color: color || '#111827', fontWeight: 800, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{hint}</div>}
    </div>
  )
}
