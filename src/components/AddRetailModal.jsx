// =============================================================================
// AddRetailModal.jsx — Embed POS into grooming + boarding checkout
// =============================================================================
// A slim, drop-in product picker for use inside the Take Payment popup
// (grooming) and the boarding pickup flow. Lets the groomer add retail
// items (shampoo, treats, etc.) to a customer's bill so they pay ONE total
// instead of two separate transactions.
//
// Props:
//   open       (bool)              — show/hide the modal
//   onClose    (function)          — close without saving
//   onSave     (function(items))   — called with the array of cart items
//   existingItems (array)          — already-added items, to seed the modal
//                                    so the user can edit qty / remove
//
// Cart item shape (returned to onSave):
//   {
//     product_id:  uuid,           // null for custom items
//     custom_name: string|null,    // null for product items
//     name:        string,         // for display only
//     qty:         int,
//     unit_price:  number,
//     line_total:  number,
//     // Internal — for inventory decrement later
//     product:     {id, name, qty_on_hand, ...}|null,
//   }
//
// Why a shared modal: same flow needs to fire from grooming payment popup,
// boarding pickup popup, and eventually from a "Quick add to active bill"
// button. One component, reused.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORY_EMOJI = {
  shampoo: '🧴', conditioner: '💆', treats: '🦴', food: '🥣',
  supplements: '💊', brushes: '🪮', toys: '🧸', apparel: '👕',
  accessories: '🎀', other: '📦',
}

function money(n) {
  var v = parseFloat(n) || 0
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function AddRetailModal({ open, onClose, onSave, existingItems }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [error, setError] = useState('')

  // ─── Load products + seed cart from existingItems on open ──────────
  useEffect(function () {
    if (!open) return
    var run = async function () {
      setLoading(true)
      setError('')
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error: e1 } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (e1) throw e1
        setProducts(data || [])
        // Seed cart from existing items if provided
        if (existingItems && existingItems.length > 0) {
          setCart(existingItems.slice())
        } else {
          setCart([])
        }
      } catch (err) {
        setError(err.message || 'Could not load products.')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [open, existingItems])

  // ─── Filtered products by search ───────────────────────────────────
  const filteredProducts = useMemo(function () {
    var term = (search || '').trim().toLowerCase()
    if (!term) return products
    return products.filter(function (p) {
      if (p.name && p.name.toLowerCase().indexOf(term) !== -1) return true
      if (p.barcode && p.barcode.toLowerCase().indexOf(term) !== -1) return true
      return false
    })
  }, [products, search])

  // Cart qty by product id (for highlight)
  const cartQtyByProductId = useMemo(function () {
    var map = {}
    cart.forEach(function (l) { if (l.product_id) map[l.product_id] = l.qty })
    return map
  }, [cart])

  // ─── Cart helpers ──────────────────────────────────────────────────
  function addProduct(product) {
    setCart(function (prev) {
      var existing = prev.find(function (l) { return l.product_id === product.id })
      if (existing) {
        return prev.map(function (l) {
          if (l.product_id !== product.id) return l
          var newQty = l.qty + 1
          return Object.assign({}, l, { qty: newQty, line_total: l.unit_price * newQty })
        })
      }
      var unitPrice = parseFloat(product.price) || 0
      return prev.concat([{
        product_id:  product.id,
        custom_name: null,
        name:        product.name,
        qty:         1,
        unit_price:  unitPrice,
        line_total:  unitPrice,
        product:     product,
      }])
    })
  }

  function addCustom(name, price) {
    var p = parseFloat(price)
    if (!name || !name.trim() || isNaN(p) || p < 0) return
    setCart(function (prev) { return prev.concat([{
      product_id:  null,
      custom_name: name.trim(),
      name:        name.trim(),
      qty:         1,
      unit_price:  p,
      line_total:  p,
      product:     null,
    }]) })
    setCustomName('')
    setCustomPrice('')
    setShowCustomForm(false)
  }

  function updateQty(idx, qty) {
    setCart(function (prev) {
      return prev.map(function (l, i) {
        if (i !== idx) return l
        var n = parseInt(qty, 10)
        if (isNaN(n) || n < 0) n = 0
        return Object.assign({}, l, { qty: n, line_total: l.unit_price * n })
      }).filter(function (l) { return l.qty > 0 })
    })
  }

  function removeLine(idx) {
    setCart(function (prev) { return prev.filter(function (_, i) { return i !== idx }) })
  }

  const cartTotal = useMemo(function () {
    return cart.reduce(function (s, l) { return s + (l.line_total || 0) }, 0)
  }, [cart])

  if (!open) return null

  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '780px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h2 style={{ margin: '0 0 2px', fontSize: '18px', color: '#111827' }}>🛒 Add Retail to Bill</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
              Add products to this customer's bill — paid as one total with the appointment.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '10px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 300px)', gap: '12px', minHeight: 0, flex: 1 }}>
          {/* LEFT — product picker */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <input
              type="text"
              placeholder="🔍 Search or scan barcode…"
              value={search}
              onChange={function (e) { setSearch(e.target.value) }}
              style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', marginBottom: '8px' }}
              autoFocus
            />
            <div style={{ overflowY: 'auto', flex: 1, minHeight: '300px' }}>
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  {products.length === 0 ? 'No products in your catalog yet.' : 'No products match.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                  {filteredProducts.map(function (p) {
                    var emoji = CATEGORY_EMOJI[p.category] || '📦'
                    var inCart = cartQtyByProductId[p.id] || 0
                    return (
                      <button
                        key={p.id}
                        onClick={function () { addProduct(p) }}
                        style={{
                          position: 'relative',
                          padding: '8px',
                          background: inCart > 0 ? '#f0fdf4' : '#fff',
                          border: '2px solid ' + (inCart > 0 ? '#16a34a' : '#e5e7eb'),
                          borderRadius: '10px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        {inCart > 0 && (
                          <div style={{
                            position: 'absolute',
                            top: '-6px', right: '-6px',
                            background: '#16a34a', color: '#fff',
                            borderRadius: '999px', minWidth: '20px', height: '20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: 800, padding: '0 5px',
                            border: '2px solid #fff',
                          }}>×{inCart}</div>
                        )}
                        <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '24px', opacity: 0.6 }}>{emoji}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{money(p.price)}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Custom item */}
            {!showCustomForm ? (
              <button
                onClick={function () { setShowCustomForm(true) }}
                style={{ marginTop: '8px', padding: '8px', background: '#fff', color: '#7c3aed', border: '1px dashed #c4b5fd', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
              >
                + Custom Item (one-off charge)
              </button>
            ) : (
              <div style={{ marginTop: '8px', padding: '10px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #c4b5fd' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Item name (e.g. De-shed)"
                    value={customName}
                    onChange={function (e) { setCustomName(e.target.value) }}
                    style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="$"
                    value={customPrice}
                    onChange={function (e) { setCustomPrice(e.target.value) }}
                    style={{ width: '80px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button onClick={function () { setShowCustomForm(false); setCustomName(''); setCustomPrice('') }} style={{ padding: '4px 10px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={function () { addCustom(customName, customPrice) }} style={{ padding: '4px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — cart */}
          <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px', textTransform: 'uppercase' }}>
              Cart {cart.length > 0 ? '(' + cart.length + ')' : ''}
            </div>
            {cart.length === 0 ? (
              <div style={{ padding: '20px 8px', textAlign: 'center', color: '#9ca3af', fontSize: '12px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Click a product to add.
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {cart.map(function (l, idx) {
                  return (
                    <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.custom_name ? <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', marginRight: '4px' }}>CUSTOM</span> : null}
                          {l.name}
                        </div>
                        <button onClick={function () { removeLine(idx) }} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '13px', padding: '0 2px' }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <button onClick={function () { updateQty(idx, l.qty - 1) }} style={qtyBtnStyle}>−</button>
                        <input
                          type="number"
                          min="0"
                          value={l.qty}
                          onChange={function (e) { updateQty(idx, e.target.value) }}
                          onFocus={function (e) { e.target.select() }}
                          style={{ width: '44px', padding: '4px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'center', fontSize: '13px', fontWeight: 700 }}
                        />
                        <button onClick={function () { updateQty(idx, l.qty + 1) }} style={qtyBtnStyle}>+</button>
                        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#111827' }}>{money(l.line_total)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ borderTop: '2px solid #111827', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>Retail Total</span>
              <span style={{ fontSize: '16px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(cartTotal)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={function () { onSave(cart) }}
            style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            {cart.length === 0 ? 'Done' : 'Add ' + money(cartTotal) + ' to Bill'}
          </button>
        </div>
      </div>
    </div>
  )
}

const qtyBtnStyle = {
  width: '28px', height: '28px', padding: 0,
  background: '#fff', color: '#111827',
  border: '1px solid #d1d5db', borderRadius: '4px',
  fontWeight: 800, fontSize: '14px', cursor: 'pointer', lineHeight: 1,
}
