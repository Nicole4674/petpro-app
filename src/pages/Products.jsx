// =============================================================================
// Products.jsx — Retail POS Phase 2: Product Catalog
// =============================================================================
// The groomer's shop catalog. Lets them add, edit, search, and archive every
// physical product they sell (shampoos, brushes, treats, food, supplements,
// toys, anything with a barcode or a price tag).
//
// What this page does:
//   • Grid of every active product with photo, name, price, qty, category
//   • Search box that filters by name + barcode (so a scanner just works)
//   • Low-stock badge when qty_on_hand <= low_stock_at
//   • "+ Add Product" modal — name, price, barcode, photo, category, stock
//   • Edit modal (same fields) per row
//   • Archive (soft delete via is_active = false) — keeps history intact
//   • "Receive Stock" modal — bumps qty_on_hand AND writes an
//     inventory_movements row so the audit trail is complete
//
// Tables touched: products, inventory_movements (both RLS-locked to the
// groomer in Retail POS Schema v1.sql).
//
// Available on ALL plans — no tier gate. Small shops on $70 basic get this
// too because retail/POS is the wedge feature competitors don't have.
//
// Next phases (planned):
//   Phase 3 — Standalone POS / Sell page
//   Phase 4 — Embedded POS at end of grooming checkout
//   Phase 5 — Stripe Terminal (tap-to-pay)
//   Phase 6 — Reports & low-stock alerts
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Category options (keep in sync with how we filter / display) ──────────
const CATEGORIES = [
  { id: 'shampoo',     label: 'Shampoo',     emoji: '🧴' },
  { id: 'conditioner', label: 'Conditioner', emoji: '💆' },
  { id: 'treats',      label: 'Treats',      emoji: '🦴' },
  { id: 'food',        label: 'Food',        emoji: '🥣' },
  { id: 'supplements', label: 'Supplements', emoji: '💊' },
  { id: 'brushes',     label: 'Brushes',     emoji: '🪮' },
  { id: 'toys',        label: 'Toys',        emoji: '🧸' },
  { id: 'apparel',     label: 'Apparel',     emoji: '👕' },
  { id: 'accessories', label: 'Accessories', emoji: '🎀' },
  { id: 'other',       label: 'Other',       emoji: '📦' },
]

function categoryMeta(id) {
  return CATEGORIES.find(function (c) { return c.id === id }) || { id: 'other', label: 'Other', emoji: '📦' }
}

function money(n) {
  var v = parseFloat(n)
  if (isNaN(v)) v = 0
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  barcode: '',
  category: 'shampoo',
  price: '',
  cost: '',
  qty_on_hand: 0,
  low_stock_at: 3,
  image_url: '',
}

// =============================================================================
// Main page
// =============================================================================
export default function Products() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null)        // product object or EMPTY_PRODUCT
  const [restocking, setRestocking] = useState(null)  // product to receive stock for
  const [error, setError] = useState('')

  // ─── Initial load ──────────────────────────────────────────────────────
  useEffect(function () {
    loadAll()
  }, [showArchived])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      setUserId(user.id)

      var q = supabase.from('products').select('*').order('name', { ascending: true })
      if (!showArchived) q = q.eq('is_active', true)
      const { data, error: e1 } = await q
      if (e1) throw e1
      setProducts(data || [])
    } catch (err) {
      setError(err.message || 'Could not load products.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Filtered view (search + category) ─────────────────────────────────
  const filtered = useMemo(function () {
    var term = (search || '').trim().toLowerCase()
    return products.filter(function (p) {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
      if (!term) return true
      if (p.name && p.name.toLowerCase().indexOf(term) !== -1) return true
      if (p.barcode && p.barcode.toLowerCase().indexOf(term) !== -1) return true
      if (p.description && p.description.toLowerCase().indexOf(term) !== -1) return true
      return false
    })
  }, [products, search, categoryFilter])

  // Counts for header summary
  const totalActive = useMemo(function () {
    return products.filter(function (p) { return p.is_active }).length
  }, [products])
  const lowStockCount = useMemo(function () {
    return products.filter(function (p) {
      return p.is_active && p.low_stock_at != null && p.qty_on_hand <= p.low_stock_at
    }).length
  }, [products])
  const inventoryValue = useMemo(function () {
    return products.reduce(function (sum, p) {
      if (!p.is_active) return sum
      return sum + (parseFloat(p.price) || 0) * (parseInt(p.qty_on_hand, 10) || 0)
    }, 0)
  }, [products])

  // ─── Archive / Unarchive ───────────────────────────────────────────────
  async function toggleArchive(product) {
    var nextActive = !product.is_active
    var verb = nextActive ? 'restore' : 'archive'
    if (!window.confirm('Are you sure you want to ' + verb + ' "' + product.name + '"?')) return
    const { error: e1 } = await supabase
      .from('products')
      .update({ is_active: nextActive })
      .eq('id', product.id)
    if (e1) {
      alert('Could not ' + verb + ': ' + e1.message)
      return
    }
    loadAll()
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading && products.length === 0) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#111827' }}>🛒 Products</h1>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '6px' }}>
        <div>
          <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>🛒 Products</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Your retail catalog. Add shampoos, treats, brushes, anything you sell.
          </p>
        </div>
        <button
          onClick={function () { setEditing(Object.assign({}, EMPTY_PRODUCT)) }}
          style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          + Add Product
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', margin: '16px 0 20px' }}>
        <SummaryCard label="Active Products" value={String(totalActive)} color="#7c3aed" />
        <SummaryCard label="Inventory Value" value={money(inventoryValue)} color="#16a34a" hint="At retail price" />
        <SummaryCard
          label="Low Stock"
          value={String(lowStockCount)}
          color={lowStockCount > 0 ? '#dc2626' : '#6b7280'}
          hint={lowStockCount > 0 ? 'Time to restock' : 'All good'}
        />
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or scan barcode…"
          value={search}
          onChange={function (e) { setSearch(e.target.value) }}
          style={{ flex: '1 1 240px', minWidth: '220px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          autoFocus
        />
        <select
          value={categoryFilter}
          onChange={function (e) { setCategoryFilter(e.target.value) }}
          style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(function (c) {
            return <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
          })}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={function (e) { setShowArchived(e.target.checked) }}
          />
          Show archived
        </label>
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280', fontSize: '14px', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '12px' }}>
          {products.length === 0 ? (
            <>
              No products yet. Click <strong>+ Add Product</strong> to add your first shampoo, treat, or brush. 🐾
            </>
          ) : (
            <>No products match that search.</>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {filtered.map(function (p) {
            return (
              <ProductCard
                key={p.id}
                product={p}
                onEdit={function () { setEditing(p) }}
                onRestock={function () { setRestocking(p) }}
                onArchive={function () { toggleArchive(p) }}
              />
            )
          })}
        </div>
      )}

      {/* Modals */}
      {editing && (
        <ProductModal
          product={editing}
          userId={userId}
          onClose={function () { setEditing(null) }}
          onSaved={function () { setEditing(null); loadAll() }}
        />
      )}
      {restocking && (
        <RestockModal
          product={restocking}
          userId={userId}
          onClose={function () { setRestocking(null) }}
          onSaved={function () { setRestocking(null); loadAll() }}
        />
      )}
    </div>
  )
}

// =============================================================================
// Summary card
// =============================================================================
function SummaryCard({ label, value, color, hint }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '24px', color: color || '#111827', fontWeight: 800, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{hint}</div>}
    </div>
  )
}

// =============================================================================
// Product card
// =============================================================================
function ProductCard({ product, onEdit, onRestock, onArchive }) {
  var meta = categoryMeta(product.category)
  var isLow = product.low_stock_at != null && product.qty_on_hand <= product.low_stock_at
  var isOut = product.qty_on_hand <= 0
  var archived = !product.is_active

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid ' + (archived ? '#e5e7eb' : isOut ? '#fecaca' : isLow ? '#fde68a' : '#e5e7eb'),
        borderRadius: '12px',
        padding: '14px',
        opacity: archived ? 0.6 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Image / placeholder */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ fontSize: '48px', opacity: 0.6 }}>{meta.emoji}</div>
        )}
        {isOut && !archived && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', background: '#dc2626', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px' }}>
            OUT OF STOCK
          </span>
        )}
        {isLow && !isOut && !archived && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', background: '#f59e0b', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px' }}>
            LOW
          </span>
        )}
        {archived && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', background: '#6b7280', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px' }}>
            ARCHIVED
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>
          {meta.emoji} {meta.label}
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{product.name}</div>
        {product.barcode && (
          <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>📊 {product.barcode}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>{money(product.price)}</div>
          <div style={{ fontSize: '13px', color: isOut ? '#dc2626' : isLow ? '#b45309' : '#6b7280', fontWeight: 600 }}>
            {product.qty_on_hand} on hand
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
        <button
          onClick={onRestock}
          disabled={archived}
          style={{ flex: 1, padding: '8px', background: archived ? '#f3f4f6' : '#16a34a', color: archived ? '#9ca3af' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: archived ? 'not-allowed' : 'pointer' }}
        >
          + Stock
        </button>
        <button
          onClick={onEdit}
          style={{ flex: 1, padding: '8px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          onClick={onArchive}
          style={{ padding: '8px 10px', background: '#fff', color: archived ? '#16a34a' : '#dc2626', border: '1px solid ' + (archived ? '#bbf7d0' : '#fecaca'), borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
          title={archived ? 'Restore' : 'Archive (hides from POS, keeps history)'}
        >
          {archived ? '↩' : '🗄'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Add / Edit modal
// =============================================================================
function ProductModal({ product, userId, onClose, onSaved }) {
  const isEdit = !!product.id
  const [form, setForm] = useState({
    name: product.name || '',
    description: product.description || '',
    barcode: product.barcode || '',
    category: product.category || 'shampoo',
    price: product.price != null ? String(product.price) : '',
    cost: product.cost != null ? String(product.cost) : '',
    qty_on_hand: product.qty_on_hand != null ? product.qty_on_hand : 0,
    low_stock_at: product.low_stock_at != null ? product.low_stock_at : 3,
    image_url: product.image_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function set(field, val) {
    setForm(function (f) { var n = Object.assign({}, f); n[field] = val; return n })
  }

  // ─── Photo upload (Supabase Storage: product-photos bucket) ──────────
  async function handlePhotoUpload(e) {
    var f = e.target.files && e.target.files[0]
    if (!f) return
    setUploading(true)
    setError('')
    try {
      var ext = f.name.split('.').pop().toLowerCase()
      var path = userId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext
      const { error: upErr } = await supabase.storage.from('product-photos').upload(path, f, { upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(path)
      set('image_url', urlData.publicUrl)
    } catch (err) {
      setError('Photo upload failed: ' + (err.message || err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // ─── Save ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    var priceNum = parseFloat(form.price)
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Price must be a number.')
      return
    }
    setSaving(true)
    setError('')
    try {
      var payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        barcode: form.barcode.trim() || null,
        category: form.category,
        price: priceNum,
        cost: form.cost === '' ? null : parseFloat(form.cost),
        qty_on_hand: parseInt(form.qty_on_hand, 10) || 0,
        low_stock_at: form.low_stock_at === '' ? null : parseInt(form.low_stock_at, 10),
        image_url: form.image_url || null,
      }
      if (isEdit) {
        const { error: e1 } = await supabase.from('products').update(payload).eq('id', product.id)
        if (e1) throw e1
      } else {
        payload.groomer_id = userId
        const { data, error: e2 } = await supabase.from('products').insert(payload).select().single()
        if (e2) throw e2
        // If starting qty > 0, log an opening-stock inventory movement
        if (payload.qty_on_hand > 0 && data) {
          await supabase.from('inventory_movements').insert({
            groomer_id: userId,
            product_id: data.id,
            qty_change: payload.qty_on_hand,
            reason: 'restock',
            note: 'Initial stock on product creation',
          })
        }
      }
      onSaved()
    } catch (err) {
      // Friendly hint for the unique barcode constraint
      var msg = err.message || String(err)
      if (msg.indexOf('uq_products_barcode_per_groomer') !== -1 || msg.indexOf('duplicate key') !== -1) {
        msg = 'Another product already uses that barcode. Each barcode must be unique.'
      }
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: '#111827' }}>
        {isEdit ? 'Edit Product' : 'Add Product'}
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
        Fill out the basics — you can edit any of this later.
      </p>

      {error && (
        <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Photo */}
      <Label>Product Photo</Label>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ width: '80px', height: '80px', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {form.image_url ? (
            <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '32px', opacity: 0.6 }}>{categoryMeta(form.category).emoji}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'inline-block' }}>
            {uploading ? 'Uploading…' : (form.image_url ? 'Replace photo' : 'Upload photo')}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          {form.image_url && (
            <button
              onClick={function () { set('image_url', '') }}
              style={{ padding: '4px 8px', background: 'transparent', color: '#dc2626', border: 'none', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {/* Name */}
      <Label>Name *</Label>
      <input
        type="text"
        value={form.name}
        onChange={function (e) { set('name', e.target.value) }}
        placeholder="e.g. Coconut Oatmeal Shampoo 16oz"
        style={fieldStyle}
        autoFocus
      />

      {/* Category */}
      <Label>Category</Label>
      <select
        value={form.category}
        onChange={function (e) { set('category', e.target.value) }}
        style={fieldStyle}
      >
        {CATEGORIES.map(function (c) {
          return <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
        })}
      </select>

      {/* Barcode */}
      <Label>Barcode <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional — scan one in or type)</span></Label>
      <input
        type="text"
        value={form.barcode}
        onChange={function (e) { set('barcode', e.target.value) }}
        placeholder="UPC, EAN, or your own code"
        style={fieldStyle}
      />

      {/* Price + Cost row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <Label>Price *</Label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={function (e) { set('price', e.target.value) }}
            placeholder="0.00"
            style={fieldStyle}
          />
        </div>
        <div>
          <Label>Cost <span style={{ fontWeight: 400, color: '#9ca3af' }}>(what you paid)</span></Label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.cost}
            onChange={function (e) { set('cost', e.target.value) }}
            placeholder="0.00"
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Qty + Low-stock threshold row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <Label>Qty on Hand{isEdit ? <span style={{ fontWeight: 400, color: '#9ca3af' }}> (use + Stock to log restocks)</span> : ''}</Label>
          <input
            type="number"
            min="0"
            value={form.qty_on_hand}
            onChange={function (e) { set('qty_on_hand', e.target.value) }}
            style={fieldStyle}
            disabled={isEdit}
            title={isEdit ? 'To change stock, use the + Stock button on the product card so it logs an audit trail.' : ''}
          />
        </div>
        <div>
          <Label>Low-Stock Alert At <span style={{ fontWeight: 400, color: '#9ca3af' }}>(blank = never)</span></Label>
          <input
            type="number"
            min="0"
            value={form.low_stock_at == null ? '' : form.low_stock_at}
            onChange={function (e) { set('low_stock_at', e.target.value) }}
            style={fieldStyle}
            placeholder="3"
          />
        </div>
      </div>

      {/* Description */}
      <Label>Description <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></Label>
      <textarea
        value={form.description}
        onChange={function (e) { set('description', e.target.value) }}
        placeholder="Any details — size, ingredients, notes"
        rows={2}
        style={Object.assign({}, fieldStyle, { fontFamily: 'inherit', resize: 'vertical' })}
      />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          onClick={onClose}
          disabled={saving}
          style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Product')}
        </button>
      </div>
    </ModalShell>
  )
}

// =============================================================================
// Receive Stock modal
// =============================================================================
function RestockModal({ product, userId, onClose, onSaved }) {
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('restock')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    var qtyNum = parseInt(qty, 10)
    if (isNaN(qtyNum) || qtyNum === 0) {
      setError('Enter a non-zero quantity. Use a negative number to remove stock (e.g. -1 for a damaged item).')
      return
    }
    setSaving(true)
    setError('')
    try {
      // 1) Bump qty_on_hand on the product
      var newQty = (parseInt(product.qty_on_hand, 10) || 0) + qtyNum
      if (newQty < 0) {
        throw new Error('Can\'t go below 0. Current stock is ' + product.qty_on_hand + '.')
      }
      const { error: e1 } = await supabase
        .from('products')
        .update({ qty_on_hand: newQty })
        .eq('id', product.id)
      if (e1) throw e1

      // 2) Log inventory movement (audit trail)
      const { error: e2 } = await supabase.from('inventory_movements').insert({
        groomer_id: userId,
        product_id: product.id,
        qty_change: qtyNum,
        reason: reason,
        note: note.trim() || null,
      })
      if (e2) throw e2

      onSaved()
    } catch (err) {
      setError(err.message || 'Could not log stock change.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: '0 0 6px', fontSize: '18px', color: '#111827' }}>📦 Receive Stock</h2>
      <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>
        <strong>{product.name}</strong> — currently <strong>{product.qty_on_hand}</strong> on hand
      </p>

      {error && (
        <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      <Label>Quantity to Add <span style={{ fontWeight: 400, color: '#9ca3af' }}>(use negative to remove)</span></Label>
      <input
        type="number"
        step="1"
        value={qty}
        onChange={function (e) { setQty(e.target.value) }}
        placeholder="e.g. 12"
        style={fieldStyle}
        autoFocus
      />

      <Label>Reason</Label>
      <select value={reason} onChange={function (e) { setReason(e.target.value) }} style={fieldStyle}>
        <option value="restock">📥 Restock (new shipment)</option>
        <option value="adjustment">📝 Manual adjustment (recount)</option>
        <option value="damage">💥 Damaged / unsellable</option>
        <option value="return">↩️ Return from client</option>
      </select>

      <Label>Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></Label>
      <input
        type="text"
        value={note}
        onChange={function (e) { setNote(e.target.value) }}
        placeholder="e.g. PetEdge order #12345"
        style={fieldStyle}
      />

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          onClick={onClose}
          disabled={saving}
          style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Log Stock Change'}
        </button>
      </div>
    </ModalShell>
  )
}

// =============================================================================
// Helpers
// =============================================================================
function ModalShell({ children, onClose }) {
  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '520px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', margin: '12px 0 4px' }}>
      {children}
    </div>
  )
}

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box',
  background: '#fff',
}
