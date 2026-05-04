// =============================================================================
// Expenses.jsx — PetPro Expense Tracking
// =============================================================================
// Lets the groomer log business expenses for tax-deductible write-offs.
// Pulls revenue from the existing payments table to show a real P&L view:
//   Revenue − Expenses = Profit
//
// Educational tooltips on each category teach groomers what's deductible
// (most solo groomers don't know).
//
// CSV export for accountants / QuickBooks users.
//
// Future: receipt photo upload, per-staff tracking, AI-assisted entry.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Categories (must match SQL CHECK constraint exactly) ──────────────────
const CATEGORIES = [
  { id: 'supplies',         label: 'Supplies',           emoji: '🧴', help: 'Shampoo, conditioner, brushes, blades, scissors. 100% deductible — keep receipts.' },
  { id: 'equipment',        label: 'Equipment',          emoji: '⚙️', help: 'Clippers, dryers, tables. Big-ticket items may need to be depreciated over years — ask a CPA if it\'s over $2,500.' },
  { id: 'blade_sharpening', label: 'Blade Sharpening',   emoji: '🔪', help: 'Routine sharpening + small tool repairs. 100% deductible.' },
  { id: 'rent',             label: 'Rent',               emoji: '🏠', help: 'Shop space rent. If you work from home, ask a CPA about the "home office deduction."' },
  { id: 'utilities',        label: 'Utilities',          emoji: '⚡', help: 'Electric, water, internet for the shop space.' },
  { id: 'phone',            label: 'Phone',              emoji: '📱', help: 'Business portion of your phone bill. If 100% business, deduct fully. Otherwise estimate the % used for work.' },
  { id: 'vehicle_mileage',  label: 'Vehicle / Mileage',  emoji: '🚗', help: 'Mobile groomers — track ALL business miles. IRS lets you deduct $0.67 per mile in 2026. Drives to PetSmart for supplies count too!' },
  { id: 'marketing',        label: 'Marketing',          emoji: '📢', help: 'Ads, business cards, social media spend, website costs, business gifts.' },
  { id: 'software',         label: 'Software',           emoji: '💻', help: 'PetPro itself, Stripe fees, any other subscriptions you pay to run the business.' },
  { id: 'insurance',        label: 'Insurance',          emoji: '🛡️', help: 'Business liability, equipment insurance, professional indemnity.' },
  { id: 'education',        label: 'Education',          emoji: '📚', help: 'Grooming classes, conferences, certifications, books. 100% deductible if related to your business.' },
  { id: 'doggy_supplies',   label: 'Doggy Supplies',     emoji: '🐶', help: 'Treats, bandanas, bows, toys you give clients. Deductible as cost of service.' },
  { id: 'other',            label: 'Other',              emoji: '✂️', help: 'Anything that doesn\'t fit a category — add notes describing what it was.' },
]

const PAYMENT_METHODS = ['cash', 'card', 'zelle', 'venmo', 'check', 'paypal', 'other']

// Money formatter: dollars (input) → "$1,234.56"
function money(dollars) {
  return '$' + (parseFloat(dollars) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Convert YYYY-MM-DD → "Mon, May 3"
function shortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Get [start, end] dates as YYYY-MM-DD for a preset range
function getDateRange(preset) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const iso = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  if (preset === 'this_month') {
    return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(today)]
  }
  if (preset === 'last_month') {
    return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))]
  }
  if (preset === 'ytd') {
    return [iso(new Date(now.getFullYear(), 0, 1)), iso(today)]
  }
  if (preset === 'all') {
    return ['2020-01-01', iso(today)]
  }
  return [iso(today), iso(today)]
}

export default function Expenses() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [revenue, setRevenue] = useState(0)
  const [datePreset, setDatePreset] = useState('this_month')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [error, setError] = useState('')

  // ─── Load on mount + when date range changes ────────────────────────
  useEffect(() => {
    loadData()
  }, [datePreset])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      setUserId(user.id)

      const [startDate, endDate] = getDateRange(datePreset)

      // Load expenses in range
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('groomer_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (expErr) throw expErr
      setExpenses(expData || [])

      // Load revenue for the same range (from payments table)
      // Payments uses created_at which is timestamp — convert dates to ISO timestamps
      const startIso = new Date(startDate + 'T00:00:00').toISOString()
      const endIso = new Date(endDate + 'T23:59:59').toISOString()
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, refunded_amount, tip_amount')
        .eq('groomer_id', user.id)
        .gte('created_at', startIso)
        .lte('created_at', endIso)

      // Revenue = service + tips - refunds (total cash flow view, matches
      // what solo groomers see on Dashboard + appointment popup totals).
      let totalRev = 0
      ;(payments || []).forEach((p) => {
        totalRev += (
          parseFloat(p.amount || 0)
          + parseFloat(p.tip_amount || 0)
          - parseFloat(p.refunded_amount || 0)
        )
      })
      setRevenue(totalRev)
    } catch (err) {
      console.error('[Expenses] load error:', err)
      setError('Could not load expenses: ' + (err.message || 'unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // ─── Computed totals ─────────────────────────────────────────────────
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (parseFloat(e.amount_cents || 0) / 100), 0)
  }, [expenses])

  const profit = revenue - totalExpenses

  // Category breakdown — sorted by total descending
  const categoryBreakdown = useMemo(() => {
    const byCategory = {}
    expenses.forEach((e) => {
      const dollars = parseFloat(e.amount_cents || 0) / 100
      byCategory[e.category] = (byCategory[e.category] || 0) + dollars
    })
    const arr = Object.entries(byCategory).map(([cat, total]) => {
      const meta = CATEGORIES.find((c) => c.id === cat) || { label: cat, emoji: '❓' }
      return { category: cat, label: meta.label, emoji: meta.emoji, total }
    })
    return arr.sort((a, b) => b.total - a.total)
  }, [expenses])

  const maxCategoryTotal = categoryBreakdown[0]?.total || 1

  // ─── Delete expense ──────────────────────────────────────────────────
  async function handleDelete(expenseId) {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (error) {
      alert('Could not delete: ' + error.message)
      return
    }
    loadData()
  }

  // ─── CSV export ──────────────────────────────────────────────────────
  function exportCsv() {
    if (expenses.length === 0) {
      alert('No expenses to export.')
      return
    }
    const header = ['Date', 'Amount', 'Category', 'Vendor', 'Payment Method', 'Notes']
    const rows = expenses.map((e) => {
      const cat = CATEGORIES.find((c) => c.id === e.category)?.label || e.category
      return [
        e.expense_date,
        (parseFloat(e.amount_cents) / 100).toFixed(2),
        cat,
        e.vendor || '',
        e.payment_method || '',
        (e.notes || '').replace(/"/g, '""'),
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `petpro-expenses-${getDateRange(datePreset)[0]}-to-${getDateRange(datePreset)[1]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // ─── Render ──────────────────────────────────────────────────────────
  if (loading && expenses.length === 0) {
    return (
      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#111827' }}>💰 Expenses</h1>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>💰 Expenses</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Track tax-deductible business expenses. Hover any category for what counts.
          </p>
        </div>
        <button
          onClick={() => { setEditingExpense(null); setShowAddModal(true) }}
          style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          + Add Expense
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Date range filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'this_month', label: 'This Month' },
          { id: 'last_month', label: 'Last Month' },
          { id: 'ytd', label: 'Year to Date' },
          { id: 'all', label: 'All Time' },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setDatePreset(p.id)}
            style={{
              padding: '8px 14px',
              background: datePreset === p.id ? '#7c3aed' : '#fff',
              color: datePreset === p.id ? '#fff' : '#374151',
              border: '1px solid ' + (datePreset === p.id ? '#7c3aed' : '#d1d5db'),
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* P&L Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <SummaryCard label="Revenue" value={money(revenue)} color="#16a34a" hint="Card payments processed" />
        <SummaryCard label="Expenses" value={money(totalExpenses)} color="#dc2626" hint={expenses.length + ' tracked'} />
        <SummaryCard
          label="Profit"
          value={money(profit)}
          color={profit >= 0 ? '#7c3aed' : '#dc2626'}
          hint={profit >= 0 ? '✅ In the black' : '⚠️ Expenses > revenue'}
        />
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: '15px', color: '#111827', fontWeight: 700 }}>📊 Top Categories</h2>
          {categoryBreakdown.map((c) => (
            <div key={c.category} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: '#374151' }}>
                  {c.emoji} {c.label}
                </span>
                <span style={{ color: '#111827', fontWeight: 700 }}>{money(c.total)}</span>
              </div>
              <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  width: ((c.total / maxCategoryTotal) * 100) + '%',
                  height: '100%',
                  background: '#7c3aed',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent expenses table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', color: '#111827', fontWeight: 700 }}>Recent Expenses</h2>
          <button
            onClick={exportCsv}
            disabled={expenses.length === 0}
            style={{
              padding: '8px 14px',
              background: expenses.length === 0 ? '#f3f4f6' : '#fff',
              color: expenses.length === 0 ? '#9ca3af' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: expenses.length === 0 ? 'not-allowed' : 'pointer',
            }}
            title="Download all expenses in this date range as a CSV file"
          >
            📥 Export CSV
          </button>
        </div>

        {expenses.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
            No expenses logged in this range yet. Click <strong>+ Add Expense</strong> to start tracking. 🐾
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px', color: '#6b7280', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '8px', color: '#6b7280', fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: '8px', color: '#6b7280', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '8px', color: '#6b7280', fontWeight: 600 }}>Vendor</th>
                  <th style={{ padding: '8px', color: '#6b7280', fontWeight: 600 }}>Notes</th>
                  <th style={{ padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const cat = CATEGORIES.find((c) => c.id === e.category)
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 8px', color: '#374151' }}>{shortDate(e.expense_date)}</td>
                      <td style={{ padding: '10px 8px', color: '#111827', fontWeight: 700 }}>
                        {money(parseFloat(e.amount_cents) / 100)}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#374151' }}>
                        {cat?.emoji || ''} {cat?.label || e.category}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#6b7280' }}>{e.vendor || '—'}</td>
                      <td style={{ padding: '10px 8px', color: '#6b7280', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.notes}>
                        {e.notes || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => { setEditingExpense(e); setShowAddModal(true) }}
                          style={{ background: 'transparent', border: 'none', color: '#7c3aed', cursor: 'pointer', fontWeight: 600, fontSize: '12px', marginRight: '8px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showAddModal && (
        <ExpenseModal
          existing={editingExpense}
          userId={userId}
          onClose={() => { setShowAddModal(false); setEditingExpense(null) }}
          onSaved={() => { setShowAddModal(false); setEditingExpense(null); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────
function SummaryCard({ label, value, color, hint }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: '4px solid ' + color, borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: color, marginBottom: '2px' }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{hint}</div>}
    </div>
  )
}

// ─── Add/Edit Expense modal ───────────────────────────────────────────
function ExpenseModal({ existing, userId, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [expenseDate, setExpenseDate] = useState(existing?.expense_date || today)
  const [amount, setAmount] = useState(existing ? (parseFloat(existing.amount_cents) / 100).toFixed(2) : '')
  const [category, setCategory] = useState(existing?.category || 'supplies')
  const [vendor, setVendor] = useState(existing?.vendor || '')
  const [paymentMethod, setPaymentMethod] = useState(existing?.payment_method || 'card')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedCategory = CATEGORIES.find((c) => c.id === category)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const dollars = parseFloat(amount)
    if (isNaN(dollars) || dollars < 0) {
      setError('Please enter a valid amount.')
      return
    }
    if (!expenseDate) {
      setError('Please pick a date.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        groomer_id: userId,
        expense_date: expenseDate,
        amount_cents: Math.round(dollars * 100),
        category,
        vendor: vendor.trim() || null,
        payment_method: paymentMethod || null,
        notes: notes.trim() || null,
      }

      if (existing) {
        const { error: updErr } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', existing.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase.from('expenses').insert(payload)
        if (insErr) throw insErr
      }
      onSaved()
    } catch (err) {
      console.error('[ExpenseModal] save error:', err)
      setError('Could not save: ' + (err.message || 'unknown error'))
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px', padding: '24px',
          maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>
            {existing ? '✏️ Edit Expense' : '➕ Add Expense'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                Date *
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                Amount * ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', boxSizing: 'border-box' }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
            {/* Category help — built-in tax education */}
            {selectedCategory && (
              <div style={{
                marginTop: '6px', padding: '10px 12px', background: '#f0fdf4',
                border: '1px solid #86efac', borderRadius: '8px',
                fontSize: '12px', color: '#166534', lineHeight: 1.5,
              }}>
                💡 {selectedCategory.help}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                Vendor
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. PetEdge, Andis"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', boxSizing: 'border-box' }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — what was this for?"
              rows={2}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '10px 18px', background: saving ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Add Expense')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
