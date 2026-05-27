// =============================================================================
// POS.jsx — Retail POS Phase 3: Standalone Sell Page
// =============================================================================
// This is the cash register. Groomer searches a product (or scans a barcode),
// builds a cart, optionally attaches it to a client, picks a payment method,
// hits Charge → sale is logged, inventory is decremented, audit-trail rows
// are written, and a receipt screen shows up.
//
// LAYOUT
//   • Left: Product search + grid (most-recent or "all active" — click adds 1)
//   • Right: Cart with line items, qty +/-, discount, tax, total, payment
//
// SALE FLOW (one transaction worth of writes)
//   1. INSERT into sales (header) → get sale.id
//   2. INSERT into sale_items (one row per line)
//   3. For each line: UPDATE products SET qty_on_hand = qty_on_hand - qty
//   4. For each line: INSERT into inventory_movements
//                     (qty_change negative, reason='sale', reference_id=sale.id)
//
// We do these as sequential awaits (no DB transaction since Supabase JS
// doesn't ship one). If a mid-flight error happens the user sees it; in
// practice the writes are all-or-nothing in <500ms.
//
// PAYMENT METHODS in this phase: cash, card (external), zelle, venmo, check,
// other. Stripe Terminal lands in Phase 5. Cash gives a quick "change owed"
// calculator.
//
// Available on ALL plans. No tier gate.
// =============================================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Category emoji map + ordered list (mirrors Products.jsx) ─────────────
const CATEGORY_EMOJI = {
  shampoo: '🧴', conditioner: '💆', treats: '🦴', food: '🥣',
  supplements: '💊', brushes: '🪮', toys: '🧸', apparel: '👕',
  accessories: '🎀', other: '📦',
}

const CATEGORY_CHIPS = [
  { id: 'shampoo',     label: 'Shampoo' },
  { id: 'conditioner', label: 'Conditioner' },
  { id: 'treats',      label: 'Treats' },
  { id: 'food',        label: 'Food' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'brushes',     label: 'Brushes' },
  { id: 'toys',        label: 'Toys' },
  { id: 'apparel',     label: 'Apparel' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'other',       label: 'Other' },
]

const SORT_OPTIONS = [
  { id: 'alphabetical', label: 'A → Z' },
  { id: 'best_sellers', label: '🔥 Best Sellers' },
  { id: 'low_stock',    label: '📉 Low Stock First' },
  { id: 'recent',       label: '🆕 Recently Added' },
]

const PAYMENT_METHODS = [
  { id: 'cash',   label: 'Cash',   emoji: '💵' },
  { id: 'card',   label: 'Card',   emoji: '💳' },
  { id: 'zelle',  label: 'Zelle',  emoji: '⚡' },
  { id: 'venmo',  label: 'Venmo',  emoji: '💜' },
  { id: 'check',  label: 'Check',  emoji: '🧾' },
  { id: 'other',  label: 'Other',  emoji: '📝' },
]

function money(n) {
  var v = parseFloat(n)
  if (isNaN(v)) v = 0
  return '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Read the saved tax rate from localStorage (persists per device).
// We'll later promote this to shop_settings in a polish pass.
function readSavedTaxRate() {
  try {
    var raw = window.localStorage.getItem('petpro.pos.tax_rate_pct')
    if (raw == null) return 0
    var n = parseFloat(raw)
    return isNaN(n) ? 0 : n
  } catch (_) { return 0 }
}

// =============================================================================
// Main page
// =============================================================================
export default function POS() {
  const navigate = useNavigate()
  const searchRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [staff, setStaff] = useState([])                   // for tip attribution
  const [shopSettings, setShopSettings] = useState(null)   // logo + receipt footer + tax rate
  const [parkedSales, setParkedSales] = useState([])       // open carts saved for later
  const [showParkPrompt, setShowParkPrompt] = useState(false)
  // Cash drawer — currently-open session (null when no drawer is open)
  const [drawerSession, setDrawerSession] = useState(null)
  const [showOpenDrawer, setShowOpenDrawer] = useState(false)
  const [showCloseDrawer, setShowCloseDrawer] = useState(false)
  const [bestSellerIds, setBestSellerIds] = useState([])   // top 6 product IDs (last 30 days)
  const [bestSellerCounts, setBestSellerCounts] = useState({})  // { productId: qtySold }
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState(function () {
    try { return window.localStorage.getItem('petpro.pos.sort_by') || 'alphabetical' } catch (_) { return 'alphabetical' }
  })
  // Cart line shape:
  //   product items:  { product, qty, unit_price }
  //   custom items:   { custom: true, custom_name, qty, unit_price, key }
  const [cart, setCart] = useState([])
  const [clientId, setClientId] = useState(null)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [discountAmount, setDiscountAmount] = useState('')  // dollars
  const [discountReason, setDiscountReason] = useState('') // 'vip' / 'comp' / 'damaged' / 'employee' / 'returning_customer' / 'other'
  const [taxRatePct, setTaxRatePct] = useState(readSavedTaxRate())
  // ─── Tips ──
  const [tipAmount, setTipAmount] = useState(0)            // dollars
  const [tipPreset, setTipPreset] = useState(null)         // 15 | 18 | 20 | 25 | null (= custom or none)
  const [tipStaffId, setTipStaffId] = useState(null)       // who gets the tip
  // ─── Split payment ──
  // payments: [{ id, method, amount, cash_tendered }]
  const [payments, setPayments] = useState([{ id: 1, method: 'cash', amount: '', cash_tendered: '' }])
  const [splitMode, setSplitMode] = useState(false)        // false = single payment, true = multi
  // ─── Custom item ──
  const [showCustomItem, setShowCustomItem] = useState(false)
  const [note, setNote] = useState('')
  const [charging, setCharging] = useState(false)
  const [error, setError] = useState('')
  const [completedSale, setCompletedSale] = useState(null)  // sale object for receipt screen

  // ─── Initial load: pull active products + clients in parallel ──────────
  useEffect(function () {
    loadAll()
    // Save tax rate any time it changes
  }, [])

  useEffect(function () {
    try { window.localStorage.setItem('petpro.pos.tax_rate_pct', String(taxRatePct)) } catch (_) {}
  }, [taxRatePct])

  // Persist sort preference per device
  useEffect(function () {
    try { window.localStorage.setItem('petpro.pos.sort_by', sortBy) } catch (_) {}
  }, [sortBy])

  // Auto-focus the search box on page load + any time the cart clears
  useEffect(function () {
    if (searchRef.current && !completedSale) searchRef.current.focus()
  }, [completedSale])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }
      setUserId(user.id)

      // 30-day cutoff for "best sellers" (and "recently added")
      var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const [prodRes, clientRes, bestRes, staffRes, settingsRes, parkedRes, drawerRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('clients').select('id, first_name, last_name, phone').order('last_name', { ascending: true }),
        // Best sellers: join sale_items → sales (last 30 days, paid only)
        supabase
          .from('sale_items')
          .select('product_id, qty, sales!inner(created_at, payment_status, groomer_id)')
          .gte('sales.created_at', thirtyDaysAgo)
          .eq('sales.groomer_id', user.id),
        // Staff list for tip attribution dropdown
        supabase.from('staff_members').select('id, first_name, last_name, role').eq('groomer_id', user.id).order('first_name', { ascending: true }),
        // Shop settings — for receipt branding + saved tax rate
        supabase.from('shop_settings').select('shop_name, address, phone, email, logo_url, receipt_footer_text, sales_tax_rate').eq('groomer_id', user.id).maybeSingle(),
        // Parked carts — sales with status='parked'
        supabase.from('sales').select('id, parked_label, total, created_at, clients(first_name, last_name)').eq('groomer_id', user.id).eq('status', 'parked').order('created_at', { ascending: false }),
        // Currently-open cash drawer (closed_at is null)
        supabase.from('cash_drawer_sessions').select('*').eq('groomer_id', user.id).is('closed_at', null).order('opened_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (prodRes.error) throw prodRes.error
      if (clientRes.error) throw clientRes.error
      // bestRes might error on first install if RLS is restrictive — fail soft
      var counts = {}
      if (bestRes && bestRes.data) {
        bestRes.data.forEach(function (row) {
          counts[row.product_id] = (counts[row.product_id] || 0) + (row.qty || 0)
        })
      }
      // Top 6 product IDs by qty sold (descending)
      var topIds = Object.keys(counts)
        .sort(function (a, b) { return counts[b] - counts[a] })
        .slice(0, 6)

      setProducts(prodRes.data || [])
      setClients(clientRes.data || [])
      setBestSellerCounts(counts)
      setBestSellerIds(topIds)
      setStaff((staffRes && staffRes.data) || [])
      // Shop settings — also use sales_tax_rate to override localStorage if set
      var settings = (settingsRes && settingsRes.data) || null
      setShopSettings(settings)
      if (settings && settings.sales_tax_rate != null) {
        setTaxRatePct(parseFloat(settings.sales_tax_rate))
      }
      setParkedSales((parkedRes && parkedRes.data) || [])
      setDrawerSession((drawerRes && drawerRes.data) || null)
    } catch (err) {
      setError(err.message || 'Could not load POS.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Filter products by search + category, then sort ──────────────────
  const filteredProducts = useMemo(function () {
    var term = (search || '').trim().toLowerCase()
    var list = products.filter(function (p) {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
      if (!term) return true
      if (p.name && p.name.toLowerCase().indexOf(term) !== -1) return true
      if (p.barcode && p.barcode.toLowerCase() === term) return true
      if (p.barcode && p.barcode.toLowerCase().indexOf(term) !== -1) return true
      if (p.description && p.description.toLowerCase().indexOf(term) !== -1) return true
      return false
    })

    if (sortBy === 'best_sellers') {
      list = list.slice().sort(function (a, b) {
        var ca = bestSellerCounts[a.id] || 0
        var cb = bestSellerCounts[b.id] || 0
        if (cb !== ca) return cb - ca           // most sold first
        return (a.name || '').localeCompare(b.name || '')
      })
    } else if (sortBy === 'low_stock') {
      list = list.slice().sort(function (a, b) {
        var qa = parseInt(a.qty_on_hand, 10) || 0
        var qb = parseInt(b.qty_on_hand, 10) || 0
        if (qa !== qb) return qa - qb           // lowest first
        return (a.name || '').localeCompare(b.name || '')
      })
    } else if (sortBy === 'recent') {
      list = list.slice().sort(function (a, b) {
        // created_at is an ISO string — direct string comparison works
        return (b.created_at || '').localeCompare(a.created_at || '')
      })
    }
    // 'alphabetical' is the default order from the query, no need to re-sort
    return list
  }, [products, search, categoryFilter, sortBy, bestSellerCounts])

  // Lookup map: { productId: qty in cart } — used for the highlight badge
  const cartQtyByProductId = useMemo(function () {
    var map = {}
    cart.forEach(function (l) { map[l.product.id] = l.qty })
    return map
  }, [cart])

  // The 6 best-seller products (in order) for the quick-tap row
  const bestSellers = useMemo(function () {
    if (bestSellerIds.length === 0) return []
    return bestSellerIds
      .map(function (id) { return products.find(function (p) { return p.id === id }) })
      .filter(function (p) { return p && p.is_active })
  }, [bestSellerIds, products])

  const filteredClients = useMemo(function () {
    var term = (clientSearch || '').trim().toLowerCase()
    if (!term) return clients.slice(0, 20)
    return clients.filter(function (c) {
      var name = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase()
      var phone = (c.phone || '').toLowerCase()
      return name.indexOf(term) !== -1 || phone.indexOf(term) !== -1
    }).slice(0, 20)
  }, [clients, clientSearch])

  const selectedClient = useMemo(function () {
    if (!clientId) return null
    return clients.find(function (c) { return c.id === clientId }) || null
  }, [clientId, clients])

  // ─── Auto-add on exact barcode match (scanner pretends to be a keyboard) ─
  // If user types something that exactly matches a barcode, add it + clear.
  function handleSearchKeyDown(e) {
    if (e.key !== 'Enter') return
    var term = (search || '').trim().toLowerCase()
    if (!term) return
    var match = products.find(function (p) { return p.barcode && p.barcode.toLowerCase() === term })
    if (match) {
      addToCart(match)
      setSearch('')
    } else if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0])
      setSearch('')
    }
  }

  // ─── Cart management ───────────────────────────────────────────────────
  // Helper: get a stable key for any line (product.id OR line.key for custom)
  function lineKey(l) { return l.custom ? l.key : l.product.id }

  function addToCart(product) {
    setCart(function (prev) {
      var existing = prev.find(function (l) { return !l.custom && l.product.id === product.id })
      if (existing) {
        return prev.map(function (l) {
          return (!l.custom && l.product.id === product.id) ? Object.assign({}, l, { qty: l.qty + 1 }) : l
        })
      }
      return prev.concat([{ product: product, qty: 1, unit_price: parseFloat(product.price) || 0 }])
    })
  }

  function addCustomItem(name, price) {
    var p = parseFloat(price)
    if (!name || !name.trim() || isNaN(p) || p < 0) return
    setCart(function (prev) {
      return prev.concat([{
        custom: true,
        key: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        custom_name: name.trim(),
        qty: 1,
        unit_price: p,
      }])
    })
  }

  function updateLineQty(key, qty) {
    setCart(function (prev) {
      return prev.map(function (l) {
        if (lineKey(l) !== key) return l
        var n = parseInt(qty, 10)
        if (isNaN(n) || n < 0) n = 0
        return Object.assign({}, l, { qty: n })
      }).filter(function (l) { return l.qty > 0 })
    })
  }

  function updateLinePrice(key, price) {
    setCart(function (prev) {
      return prev.map(function (l) {
        if (lineKey(l) !== key) return l
        var n = parseFloat(price)
        if (isNaN(n) || n < 0) n = 0
        return Object.assign({}, l, { unit_price: n })
      })
    })
  }

  function removeLine(key) {
    setCart(function (prev) { return prev.filter(function (l) { return lineKey(l) !== key }) })
  }

  function clearCart() {
    setCart([])
    setDiscountAmount('')
    setDiscountReason('')
    setNote('')
    setClientId(null)
    setTipAmount(0)
    setTipPreset(null)
    setTipStaffId(null)
    setPayments([{ id: 1, method: 'cash', amount: '', cash_tendered: '' }])
    setSplitMode(false)
  }

  // ─── Parked sales: save / resume / delete ────────────────────────────
  async function parkCart(label) {
    if (cart.length === 0) return
    setCharging(true)
    setError('')
    try {
      // Write a sales row with status='parked'. We DO NOT decrement inventory
      // or write payments — that happens when it's resumed and charged.
      const { data: saleRow, error: e1 } = await supabase.from('sales').insert({
        groomer_id:      userId,
        client_id:       clientId,
        appointment_id:  null,
        subtotal:        subtotal,
        discount_amount: discountNum,
        discount_reason: discountNum > 0 ? (discountReason || null) : null,
        tax_amount:      taxAmount,
        tip_amount:      tipNum,
        total:           total,
        payment_method:  null,
        payment_status:  'unpaid',
        status:          'parked',
        parked_label:    (label || '').trim() || null,
        note:            note.trim() || null,
      }).select().single()
      if (e1) throw e1
      // Save items (no inventory hit yet — happens on resume + charge)
      var itemPayloads = cart.map(function (l) {
        return {
          sale_id:     saleRow.id,
          product_id:  l.custom ? null : l.product.id,
          custom_name: l.custom ? l.custom_name : null,
          qty:         l.qty,
          unit_price:  l.unit_price,
          line_total:  l.unit_price * l.qty,
        }
      })
      const { error: e2 } = await supabase.from('sale_items').insert(itemPayloads)
      if (e2) throw e2
      clearCart()
      setShowParkPrompt(false)
      loadAll()
    } catch (err) {
      setError(err.message || 'Could not park sale.')
    } finally {
      setCharging(false)
    }
  }

  async function resumeParked(parkedSaleId) {
    if (cart.length > 0) {
      if (!window.confirm('Resuming a parked cart will replace your current cart. Continue?')) return
    }
    setCharging(true)
    setError('')
    try {
      // Pull the full parked sale + items
      const { data: parked, error: e1 } = await supabase
        .from('sales')
        .select('*, sale_items(*, products(*))')
        .eq('id', parkedSaleId)
        .single()
      if (e1) throw e1
      // Rebuild cart
      var newCart = (parked.sale_items || []).map(function (li) {
        if (li.custom_name && !li.product_id) {
          return {
            custom: true,
            key: 'custom-' + li.id,
            custom_name: li.custom_name,
            qty: li.qty,
            unit_price: parseFloat(li.unit_price) || 0,
          }
        }
        return {
          product: li.products || { id: li.product_id, name: '(product gone)', qty_on_hand: 0, price: li.unit_price, category: 'other' },
          qty: li.qty,
          unit_price: parseFloat(li.unit_price) || 0,
        }
      })
      setCart(newCart)
      setClientId(parked.client_id || null)
      setDiscountAmount(parseFloat(parked.discount_amount) > 0 ? String(parked.discount_amount) : '')
      setDiscountReason(parked.discount_reason || '')
      setTipAmount(parseFloat(parked.tip_amount) || 0)
      setNote(parked.note || '')
      // Delete the parked placeholder row so we don't have a ghost
      await supabase.from('sale_items').delete().eq('sale_id', parkedSaleId)
      await supabase.from('sales').delete().eq('id', parkedSaleId)
      loadAll()
    } catch (err) {
      setError(err.message || 'Could not resume parked sale.')
    } finally {
      setCharging(false)
    }
  }

  async function deleteParked(parkedSaleId) {
    if (!window.confirm('Delete this parked sale? It cannot be undone.')) return
    try {
      await supabase.from('sale_items').delete().eq('sale_id', parkedSaleId)
      await supabase.from('sales').delete().eq('id', parkedSaleId)
      loadAll()
    } catch (err) {
      setError(err.message || 'Could not delete parked sale.')
    }
  }

  // ─── Cash drawer: open / close ───────────────────────────────────────
  async function openDrawer(startingCash) {
    var sc = parseFloat(startingCash) || 0
    setError('')
    try {
      const { data, error: e1 } = await supabase.from('cash_drawer_sessions').insert({
        groomer_id:    userId,
        starting_cash: sc,
      }).select().single()
      if (e1) throw e1
      setDrawerSession(data)
      setShowOpenDrawer(false)
    } catch (err) {
      setError(err.message || 'Could not open drawer.')
    }
  }

  async function closeDrawer(endingCash, noteText) {
    if (!drawerSession) return
    setError('')
    try {
      // Compute expected: starting + cash sale_payments since opened
      // Sum cash from sale_payments linked to sales in this drawer session
      var sinceIso = drawerSession.opened_at
      const { data: cashRows, error: eFetch } = await supabase
        .from('sale_payments')
        .select('amount, sales!inner(cash_drawer_session_id, groomer_id)')
        .eq('method', 'cash')
        .eq('sales.cash_drawer_session_id', drawerSession.id)
      if (eFetch) throw eFetch
      var cashIn = (cashRows || []).reduce(function (s, r) { return s + (parseFloat(r.amount) || 0) }, 0)
      var expected = (parseFloat(drawerSession.starting_cash) || 0) + cashIn
      var ec = parseFloat(endingCash) || 0
      var variance = ec - expected
      const { error: eClose } = await supabase
        .from('cash_drawer_sessions')
        .update({
          closed_at:     new Date().toISOString(),
          ending_cash:   ec,
          expected_cash: expected,
          variance:      variance,
          note:          (noteText || '').trim() || null,
        })
        .eq('id', drawerSession.id)
      if (eClose) throw eClose
      setDrawerSession(null)
      setShowCloseDrawer(false)
      // Friendly summary
      var msg = variance === 0
        ? '✓ Drawer closed — exact match!'
        : (variance > 0 ? 'Drawer closed — over by ' + money(variance) : 'Drawer closed — short by ' + money(Math.abs(variance)))
      alert(msg + '\nExpected: ' + money(expected) + '\nCounted: ' + money(ec))
    } catch (err) {
      setError(err.message || 'Could not close drawer.')
    }
  }

  // ─── Totals ────────────────────────────────────────────────────────────
  const subtotal = useMemo(function () {
    return cart.reduce(function (sum, l) { return sum + (l.unit_price * l.qty) }, 0)
  }, [cart])

  const discountNum = useMemo(function () {
    var n = parseFloat(discountAmount)
    return isNaN(n) || n < 0 ? 0 : Math.min(n, subtotal)
  }, [discountAmount, subtotal])

  const taxBase = Math.max(0, subtotal - discountNum)
  const taxAmount = taxBase * ((parseFloat(taxRatePct) || 0) / 100)
  const tipNum = parseFloat(tipAmount) || 0
  const total = taxBase + taxAmount + tipNum

  // When tipPreset changes, recompute the tip dollar amount from the new percentage
  useEffect(function () {
    if (tipPreset == null) return
    var newTip = (taxBase * (tipPreset / 100))
    setTipAmount(Math.round(newTip * 100) / 100)
  }, [tipPreset, taxBase])

  // ─── Split-payment math ────────────────────────────────────────────────
  // Sum of all payment amounts (string-safe)
  const paymentsTotal = useMemo(function () {
    return payments.reduce(function (sum, p) {
      var n = parseFloat(p.amount)
      return sum + (isNaN(n) ? 0 : n)
    }, 0)
  }, [payments])

  const paymentsRemaining = total - paymentsTotal      // negative = overpaid
  const paymentsBalanced = Math.abs(paymentsRemaining) < 0.01

  // Auto-fill the single-payment amount when total changes (so user doesn't
  // have to type the full amount in the common "1 payment for full total" case)
  useEffect(function () {
    if (splitMode) return  // user's editing manually
    if (payments.length !== 1) return
    setPayments([Object.assign({}, payments[0], { amount: total > 0 ? total.toFixed(2) : '' })])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, splitMode])

  // For cash payments, compute change owed (sum of cash_tendered across cash rows)
  const cashTotalTendered = useMemo(function () {
    return payments.reduce(function (sum, p) {
      if (p.method !== 'cash') return sum
      var n = parseFloat(p.cash_tendered)
      return sum + (isNaN(n) ? 0 : n)
    }, 0)
  }, [payments])
  const cashTotalDue = useMemo(function () {
    return payments.reduce(function (sum, p) {
      if (p.method !== 'cash') return sum
      var n = parseFloat(p.amount)
      return sum + (isNaN(n) ? 0 : n)
    }, 0)
  }, [payments])
  const changeOwed = cashTotalTendered > 0 ? (cashTotalTendered - cashTotalDue) : null

  // ─── CHARGE: write sale + items + payments + inventory ───────────────
  async function handleCharge() {
    if (cart.length === 0) {
      setError('Cart is empty.')
      return
    }
    if (discountNum > 0 && !discountReason) {
      setError('Please pick a reason for the discount.')
      return
    }
    if (!paymentsBalanced) {
      var diff = paymentsRemaining
      if (diff > 0) setError('Payments are $' + diff.toFixed(2) + ' short of the total.')
      else setError('Payments are $' + Math.abs(diff).toFixed(2) + ' over the total.')
      return
    }
    // Validate cash tenders ≥ their cash amount
    for (var pi = 0; pi < payments.length; pi++) {
      var pp = payments[pi]
      if (pp.method === 'cash' && pp.cash_tendered !== '') {
        var t = parseFloat(pp.cash_tendered)
        var a = parseFloat(pp.amount) || 0
        if (!isNaN(t) && t < a) {
          setError('Cash tendered (' + money(t) + ') is less than the cash amount (' + money(a) + ').')
          return
        }
      }
    }
    setCharging(true)
    setError('')
    try {
      // Primary payment method for the sales.payment_method column (back-compat)
      // — first payment row's method, or 'split' if there are multiple
      var primaryMethod = payments.length === 1 ? payments[0].method : 'split'

      // 1) Insert sale header (linked to current drawer session if open)
      const { data: saleRow, error: e1 } = await supabase.from('sales').insert({
        groomer_id:               userId,
        client_id:                clientId,
        appointment_id:           null,
        subtotal:                 subtotal,
        discount_amount:          discountNum,
        discount_reason:          discountNum > 0 ? (discountReason || null) : null,
        tax_amount:               taxAmount,
        tip_amount:               tipNum,
        tip_recipient_staff_id:   tipNum > 0 ? (tipStaffId || null) : null,
        total:                    total,
        payment_method:           primaryMethod,
        payment_status:           'paid',
        status:                   'completed',
        cash_drawer_session_id:   drawerSession ? drawerSession.id : null,
        note:                     note.trim() || null,
      }).select().single()
      if (e1) throw e1

      // 2) Insert sale_items (products + custom lines)
      var itemPayloads = cart.map(function (l) {
        return {
          sale_id:     saleRow.id,
          product_id:  l.custom ? null : l.product.id,
          custom_name: l.custom ? l.custom_name : null,
          qty:         l.qty,
          unit_price:  l.unit_price,
          line_total:  l.unit_price * l.qty,
        }
      })
      const { error: e2 } = await supabase.from('sale_items').insert(itemPayloads)
      if (e2) throw e2

      // 3) Insert sale_payments rows (one per tender for split, one for single)
      var paymentPayloads = payments.map(function (p) {
        var amt = parseFloat(p.amount) || 0
        var tend = parseFloat(p.cash_tendered)
        var row = {
          sale_id:    saleRow.id,
          groomer_id: userId,
          method:     p.method,
          amount:     amt,
        }
        if (p.method === 'cash' && !isNaN(tend)) {
          row.cash_tendered = tend
          row.cash_change   = Math.max(0, tend - amt)
        }
        return row
      })
      const { error: ePay } = await supabase.from('sale_payments').insert(paymentPayloads)
      if (ePay) throw ePay

      // 4) Decrement qty_on_hand + log inventory_movements for product lines only
      for (var i = 0; i < cart.length; i++) {
        var line = cart[i]
        if (line.custom) continue   // custom items don't touch inventory
        var newQty = (parseInt(line.product.qty_on_hand, 10) || 0) - line.qty
        const { error: e3 } = await supabase
          .from('products')
          .update({ qty_on_hand: newQty })
          .eq('id', line.product.id)
        if (e3) throw e3
        const { error: e4 } = await supabase.from('inventory_movements').insert({
          groomer_id:   userId,
          product_id:   line.product.id,
          qty_change:   -line.qty,
          reason:       'sale',
          reference_id: saleRow.id,
          note:         null,
        })
        if (e4) throw e4
      }

      // 5) Show receipt screen
      setCompletedSale({
        sale:      saleRow,
        items:     cart.slice(),
        client:    selectedClient,
        payments:  payments.slice(),
        change:    changeOwed,
        tipStaff:  tipStaffId ? staff.find(function (s) { return s.id === tipStaffId }) : null,
      })
      clearCart()
      loadAll()
    } catch (err) {
      setError(err.message || 'Could not complete sale.')
    } finally {
      setCharging(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#111827' }}>💵 Sell</h1>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      </div>
    )
  }

  // Receipt screen takes over the whole page after a sale completes
  if (completedSale) {
    return <ReceiptScreen completed={completedSale} shopSettings={shopSettings} onDone={function () { setCompletedSale(null) }} />
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>💵 Sell</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Scan a barcode or click a product to add it. Then take payment.
          </p>
        </div>
        <button
          onClick={function () { navigate('/products') }}
          style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
        >
          Manage Products →
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* 💵 Cash drawer strip */}
      <div style={{
        marginBottom: '12px',
        padding: '10px 14px',
        background: drawerSession ? '#ecfdf5' : '#fef9c3',
        border: '1px solid ' + (drawerSession ? '#bbf7d0' : '#fde047'),
        borderRadius: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ fontSize: '12px', color: drawerSession ? '#065f46' : '#854d0e', fontWeight: 600 }}>
          {drawerSession ? (
            <>
              💵 Drawer OPEN — started {money(drawerSession.starting_cash)} at {new Date(drawerSession.opened_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </>
          ) : (
            <>💵 No drawer open — cash sales still work, but reconciliation won't track them</>
          )}
        </div>
        {drawerSession ? (
          <button
            onClick={function () { setShowCloseDrawer(true) }}
            style={{ padding: '6px 12px', background: '#fff', color: '#065f46', border: '1px solid #16a34a', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
          >
            Close Drawer
          </button>
        ) : (
          <button
            onClick={function () { setShowOpenDrawer(true) }}
            style={{ padding: '6px 12px', background: '#fff', color: '#854d0e', border: '1px solid #facc15', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
          >
            Open Drawer
          </button>
        )}
      </div>

      {/* 📌 Parked sales strip — shows above grid if any carts are saved */}
      {parkedSales.length > 0 && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', marginBottom: '6px' }}>
            📌 Parked carts ({parkedSales.length}) — tap to resume
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {parkedSales.map(function (ps) {
              var who = ps.parked_label || (ps.clients ? (ps.clients.first_name + ' ' + (ps.clients.last_name || '')).trim() : 'Walk-in')
              var when = new Date(ps.created_at)
              var timeStr = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              return (
                <div key={ps.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #c4b5fd', borderRadius: '999px', paddingLeft: '12px' }}>
                  <button
                    onClick={function () { resumeParked(ps.id) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 4px', fontSize: '12px', color: '#374151', fontWeight: 600 }}
                  >
                    {who} • {money(ps.total)} • <span style={{ color: '#9ca3af' }}>{timeStr}</span>
                  </button>
                  <button
                    onClick={function () { deleteParked(ps.id) }}
                    style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '6px 10px 6px 4px', fontSize: '13px' }}
                    title="Delete this parked sale"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two-column layout — stacks on small screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 420px)', gap: '16px', alignItems: 'start' }}>
        {/* ─── LEFT: Product search + grid ───────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="🔍 Search by name or scan barcode (press Enter to add)…"
            value={search}
            onChange={function (e) { setSearch(e.target.value) }}
            onKeyDown={handleSearchKeyDown}
            style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '10px' }}
          />

          {/* Category chips — one-click filter. Scrolls horizontally on mobile. */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '10px' }}>
            <CategoryChip
              active={categoryFilter === 'all'}
              onClick={function () { setCategoryFilter('all') }}
              label="All"
            />
            {CATEGORY_CHIPS.map(function (c) {
              // Only show chip if at least 1 product uses it (keeps the row clean)
              var hasAny = products.some(function (p) { return p.category === c.id })
              if (!hasAny) return null
              return (
                <CategoryChip
                  key={c.id}
                  active={categoryFilter === c.id}
                  onClick={function () { setCategoryFilter(c.id) }}
                  label={(CATEGORY_EMOJI[c.id] || '') + ' ' + c.label}
                />
              )
            })}
          </div>

          {/* Sort dropdown — small, top-right of the grid area */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}
              {categoryFilter !== 'all' ? ' in ' + (CATEGORY_CHIPS.find(function (c) { return c.id === categoryFilter }) || {}).label : ''}
            </div>
            <select
              value={sortBy}
              onChange={function (e) { setSortBy(e.target.value) }}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', background: '#fff', cursor: 'pointer' }}
            >
              {SORT_OPTIONS.map(function (o) {
                return <option key={o.id} value={o.id}>{o.label}</option>
              })}
            </select>
          </div>

          {/* 🔥 Best Sellers row — only when there's actual sales data + not searching */}
          {bestSellers.length > 0 && !search.trim() && categoryFilter === 'all' && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🔥 Best Sellers <span style={{ fontWeight: 400, color: '#9ca3af' }}>(last 30 days)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {bestSellers.map(function (p) {
                  var emoji = CATEGORY_EMOJI[p.category] || '📦'
                  var sold = bestSellerCounts[p.id] || 0
                  var inCartQty = cartQtyByProductId[p.id] || 0
                  var inCart = inCartQty > 0
                  return (
                    <button
                      key={p.id}
                      onClick={function () { addToCart(p) }}
                      style={{
                        flexShrink: 0,
                        width: '110px',
                        padding: '8px',
                        background: inCart ? '#f0fdf4' : 'linear-gradient(135deg, #fef3c7 0%, #fff 100%)',
                        border: '2px solid ' + (inCart ? '#16a34a' : '#fde68a'),
                        borderRadius: '10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        position: 'relative',
                      }}
                      title={inCart ? inCartQty + ' in cart — click to add another' : ('Sold ' + sold + ' in last 30 days')}
                    >
                      {inCart && (
                        <div style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-8px',
                          background: '#16a34a',
                          color: '#fff',
                          borderRadius: '999px',
                          minWidth: '22px',
                          height: '22px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '0 5px',
                          boxShadow: '0 2px 6px rgba(22, 163, 74, 0.4)',
                          border: '2px solid #fff',
                        }}>
                          ×{inCartQty}
                        </div>
                      )}
                      <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#fff', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '24px', opacity: 0.7 }}>{emoji}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>{sold}× sold • {money(p.price)}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              {products.length === 0 ? (
                <>No products yet. <a href="/products" style={{ color: '#7c3aed' }}>Add some →</a></>
              ) : (
                <>No products match that search.</>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
              {filteredProducts.map(function (p) {
                var emoji = CATEGORY_EMOJI[p.category] || '📦'
                var outOfStock = p.qty_on_hand <= 0
                var inCartQty = cartQtyByProductId[p.id] || 0
                var inCart = inCartQty > 0
                // Border priority: in-cart (green) > out-of-stock (red) > default
                var borderColor = inCart ? '#16a34a' : (outOfStock ? '#fecaca' : '#e5e7eb')
                var bgColor = inCart ? '#f0fdf4' : '#fff'
                return (
                  <button
                    key={p.id}
                    onClick={function () { addToCart(p) }}
                    style={{
                      padding: '10px',
                      background: bgColor,
                      border: '2px solid ' + borderColor,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minHeight: '120px',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                    }}
                    title={inCart ? inCartQty + ' in cart — click to add another' : (outOfStock ? 'Out of stock (will go negative if sold)' : 'Click to add')}
                  >
                    {/* In-cart badge — top-right corner */}
                    {inCart && (
                      <div style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        background: '#16a34a',
                        color: '#fff',
                        borderRadius: '999px',
                        minWidth: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '0 6px',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.4)',
                        border: '2px solid #fff',
                      }}>
                        ×{inCartQty}
                      </div>
                    )}
                    <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '28px', opacity: 0.6 }}>{emoji}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{p.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{money(p.price)}</span>
                      <span style={{ fontSize: '11px', color: outOfStock ? '#dc2626' : '#6b7280' }}>{p.qty_on_hand} left</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── RIGHT: Cart + payment ─────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', position: 'sticky', top: '16px' }}>
          {/* Client picker */}
          <div style={{ marginBottom: '12px' }}>
            <Label>Customer</Label>
            {selectedClient ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '14px', color: '#111827' }}>
                <span><strong>{selectedClient.first_name} {selectedClient.last_name}</strong>{selectedClient.phone ? ' • ' + selectedClient.phone : ''}</span>
                <button
                  onClick={function () { setClientId(null) }}
                  style={{ background: 'transparent', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={function () { setShowClientPicker(true) }}
                style={{ width: '100%', padding: '10px', background: '#fff', color: '#374151', border: '1px dashed #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                + Attach to client (or leave as walk-in)
              </button>
            )}
          </div>

          {/* Cart line items */}
          <Label>Cart {cart.length > 0 ? <span style={{ color: '#9ca3af', fontWeight: 400 }}>({cart.length} item{cart.length === 1 ? '' : 's'})</span> : ''}</Label>
          {cart.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', background: '#f9fafb', borderRadius: '8px' }}>
              Cart is empty. Click or scan products to add.
            </div>
          ) : (
            <div style={{ borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', maxHeight: '320px', overflowY: 'auto' }}>
              {cart.map(function (l) {
                var key = lineKey(l)
                var displayName = l.custom ? l.custom_name : l.product.name
                return (
                  <div key={key} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.custom && <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>CUSTOM</span>}
                          {displayName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                          {money(l.unit_price)} each
                        </div>
                      </div>
                      <button
                        onClick={function () { removeLine(key) }}
                        style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                    {/* Big, obvious qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Qty</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f9fafb', borderRadius: '8px', padding: '2px', border: '1px solid #e5e7eb' }}>
                        <button
                          onClick={function () { updateLineQty(key, l.qty - 1) }}
                          style={qtyBtnStyle}
                          aria-label="Decrease quantity"
                        >−</button>
                        <input
                          type="number"
                          min="0"
                          value={l.qty}
                          onChange={function (e) { updateLineQty(key, e.target.value) }}
                          onFocus={function (e) { e.target.select() }}
                          style={{ width: '54px', padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'center', fontSize: '15px', fontWeight: 700, background: '#fff' }}
                          title="Type the quantity or use +/−"
                        />
                        <button
                          onClick={function () { updateLineQty(key, l.qty + 1) }}
                          style={qtyBtnStyle}
                          aria-label="Increase quantity"
                        >+</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Price</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.unit_price}
                          onChange={function (e) { updateLinePrice(key, e.target.value) }}
                          onFocus={function (e) { e.target.select() }}
                          style={{ width: '64px', padding: '6px 6px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'right', fontSize: '13px' }}
                          title="Override unit price for this line"
                        />
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '15px', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                        {money(l.unit_price * l.qty)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {/* + Custom Item button + qty hint */}
              <div style={{ padding: '10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={function () { setShowCustomItem(true) }}
                  style={{ padding: '6px 12px', background: '#fff', color: '#7c3aed', border: '1px dashed #c4b5fd', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                  title="Add a one-off charge with no inventory (e.g. de-shed surcharge)"
                >
                  + Custom Item
                </button>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                  💡 Tap product or type qty
                </span>
              </div>
            </div>
          )}

          {/* Totals */}
          {cart.length > 0 && (
            <>
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <TotalRow label="Subtotal" value={money(subtotal)} />
                {/* Discount row with inline reason */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>Discount</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountAmount}
                      onChange={function (e) { setDiscountAmount(e.target.value) }}
                      placeholder="0.00"
                      style={{ width: '80px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'right', fontSize: '13px' }}
                    />
                  </div>
                </div>
                {/* Show discount reason picker only when discount > 0 */}
                {discountNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <select
                      value={discountReason}
                      onChange={function (e) { setDiscountReason(e.target.value) }}
                      style={{ padding: '4px 8px', border: '1px solid ' + (discountReason ? '#d1d5db' : '#fca5a5'), borderRadius: '6px', fontSize: '12px', background: discountReason ? '#fff' : '#fef2f2' }}
                    >
                      <option value="">Pick reason…</option>
                      <option value="vip">⭐ VIP customer</option>
                      <option value="comp">🎁 Comped (free)</option>
                      <option value="damaged">📦 Damaged item</option>
                      <option value="employee">👤 Employee discount</option>
                      <option value="returning_customer">🔁 Returning customer</option>
                      <option value="other">📝 Other</option>
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>Tax</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="20"
                      value={taxRatePct}
                      onChange={function (e) { setTaxRatePct(e.target.value) }}
                      style={{ width: '60px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'right', fontSize: '13px' }}
                      title="Sales tax %. Saved on this device."
                    />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                    <span style={{ fontSize: '13px', color: '#111827', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                      {money(taxAmount)}
                    </span>
                  </div>
                </div>
                {/* TIP row — only shows the line if tip > 0 */}
                {tipNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#16a34a', fontWeight: 700 }}>
                    <span>💰 Tip{tipStaffId && staff.length ? ' (for ' + (staff.find(function (s) { return s.id === tipStaffId }) || {}).first_name + ')' : ''}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(tipNum)}</span>
                  </div>
                )}
                <div style={{ borderTop: '2px solid #111827', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>Total</span>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</span>
                </div>
              </div>

              {/* ─── TIP SECTION ─────────────────────────────────────── */}
              <div style={{ marginTop: '14px', padding: '12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                <Label>💰 Add Tip</Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {[0, 15, 18, 20, 25].map(function (pct) {
                    var isActive = tipPreset === pct || (pct === 0 && tipNum === 0)
                    return (
                      <button
                        key={pct}
                        onClick={function () {
                          if (pct === 0) { setTipPreset(null); setTipAmount(0) }
                          else { setTipPreset(pct) }
                        }}
                        style={{
                          padding: '8px 4px',
                          background: isActive ? '#16a34a' : '#fff',
                          color: isActive ? '#fff' : '#374151',
                          border: '1px solid ' + (isActive ? '#16a34a' : '#d1d5db'),
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {pct === 0 ? 'No tip' : pct + '%'}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>Custom $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tipAmount || ''}
                    onChange={function (e) {
                      setTipPreset(null)
                      var n = parseFloat(e.target.value)
                      setTipAmount(isNaN(n) ? 0 : n)
                    }}
                    onFocus={function (e) { e.target.select() }}
                    placeholder="0.00"
                    style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', textAlign: 'right', fontSize: '13px', background: '#fff' }}
                  />
                </div>
                {/* Who gets the tip — only show if there's > 1 staff (or you have staff) */}
                {staff.length > 0 && tipNum > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>Tip goes to:</div>
                    <select
                      value={tipStaffId || ''}
                      onChange={function (e) { setTipStaffId(e.target.value || null) }}
                      style={Object.assign({}, fieldStyle, { padding: '6px 10px', fontSize: '13px' })}
                    >
                      <option value="">— Choose staff (optional) —</option>
                      {staff.map(function (s) {
                        return <option key={s.id} value={s.id}>{s.first_name} {s.last_name} {s.role && '(' + s.role + ')'}</option>
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* ─── PAYMENT SECTION ─────────────────────────────────── */}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <Label>Payment</Label>
                  <button
                    onClick={function () {
                      if (splitMode) {
                        // Collapse back to one payment
                        setPayments([{ id: 1, method: 'cash', amount: total.toFixed(2), cash_tendered: '' }])
                        setSplitMode(false)
                      } else {
                        // Enter split mode: keep first, add a 2nd row
                        var nextId = Math.max.apply(null, payments.map(function (p) { return p.id })) + 1
                        setPayments(payments.concat([{ id: nextId, method: 'cash', amount: '', cash_tendered: '' }]))
                        setSplitMode(true)
                      }
                    }}
                    style={{ padding: '4px 10px', background: 'transparent', color: '#7c3aed', border: '1px dashed #c4b5fd', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {splitMode ? '✕ Collapse to 1' : '+ Split payment'}
                  </button>
                </div>

                {/* One row per payment tender */}
                {payments.map(function (p, idx) {
                  return (
                    <div key={p.id} style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px', marginBottom: '6px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select
                          value={p.method}
                          onChange={function (e) {
                            var v = e.target.value
                            setPayments(payments.map(function (x) { return x.id === p.id ? Object.assign({}, x, { method: v }) : x }))
                          }}
                          style={{ flex: '0 0 auto', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                        >
                          {PAYMENT_METHODS.map(function (m) {
                            return <option key={m.id} value={m.id}>{m.emoji} {m.label}</option>
                          })}
                        </select>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={p.amount}
                          onChange={function (e) {
                            var v = e.target.value
                            setPayments(payments.map(function (x) { return x.id === p.id ? Object.assign({}, x, { amount: v }) : x }))
                            if (!splitMode) setSplitMode(true)  // typing in single mode = user took control
                          }}
                          onFocus={function (e) { e.target.select() }}
                          placeholder="0.00"
                          style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right', background: '#fff' }}
                        />
                        {payments.length > 1 && (
                          <button
                            onClick={function () {
                              setPayments(payments.filter(function (x) { return x.id !== p.id }))
                              if (payments.length <= 2) setSplitMode(false)
                            }}
                            style={{ background: 'transparent', color: '#9ca3af', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                            title="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {/* Cash-tendered field appears under cash rows */}
                      {p.method === 'cash' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Tendered $</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={p.cash_tendered}
                            onChange={function (e) {
                              var v = e.target.value
                              setPayments(payments.map(function (x) { return x.id === p.id ? Object.assign({}, x, { cash_tendered: v }) : x }))
                            }}
                            onFocus={function (e) { e.target.select() }}
                            placeholder={p.amount}
                            style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right', background: '#fff' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Payments status row */}
                {splitMode && (
                  <div style={{
                    padding: '8px 10px',
                    background: paymentsBalanced ? '#ecfdf5' : '#fef2f2',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: paymentsBalanced ? '#065f46' : '#991b1b',
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>Tenders: {money(paymentsTotal)}</span>
                    <span>
                      {paymentsBalanced
                        ? '✓ Matches total'
                        : paymentsRemaining > 0
                          ? 'Need ' + money(paymentsRemaining) + ' more'
                          : money(Math.abs(paymentsRemaining)) + ' over'}
                    </span>
                  </div>
                )}

                {/* Change owed (from any cash tenders) */}
                {changeOwed != null && changeOwed > 0 && (
                  <div style={{ marginTop: '6px', padding: '8px 12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '13px', color: '#065f46', fontWeight: 700 }}>
                    💵 Change owed: {money(changeOwed)}
                  </div>
                )}
              </div>

              {/* Note */}
              <div style={{ marginTop: '10px' }}>
                <Label>Note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></Label>
                <input
                  type="text"
                  value={note}
                  onChange={function (e) { setNote(e.target.value) }}
                  placeholder="e.g. 'Free sample included'"
                  style={fieldStyle}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button
                  onClick={clearCart}
                  disabled={charging}
                  style={{ padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', flex: '0 0 auto' }}
                >
                  Clear
                </button>
                <button
                  onClick={function () { setShowParkPrompt(true) }}
                  disabled={charging || cart.length === 0}
                  style={{ padding: '12px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', flex: '0 0 auto', opacity: cart.length === 0 ? 0.5 : 1 }}
                  title="Save this cart for later (lets you ring up a quick walk-in first)"
                >
                  📌 Park
                </button>
                <button
                  onClick={handleCharge}
                  disabled={charging || cart.length === 0}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '16px',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: charging || cart.length === 0 ? 0.6 : 1,
                  }}
                >
                  {charging ? 'Charging…' : 'Charge ' + money(total)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Client picker modal */}
      {showClientPicker && (
        <ClientPickerModal
          clients={filteredClients}
          search={clientSearch}
          onSearchChange={setClientSearch}
          onSelect={function (c) { setClientId(c.id); setShowClientPicker(false); setClientSearch('') }}
          onClose={function () { setShowClientPicker(false); setClientSearch('') }}
        />
      )}

      {/* Custom item modal */}
      {showCustomItem && (
        <CustomItemModal
          onAdd={function (name, price) { addCustomItem(name, price); setShowCustomItem(false) }}
          onClose={function () { setShowCustomItem(false) }}
        />
      )}

      {/* Park-this-cart prompt */}
      {showParkPrompt && (
        <ParkPromptModal
          defaultLabel={selectedClient ? (selectedClient.first_name + ' ' + (selectedClient.last_name || '')).trim() : ''}
          onPark={parkCart}
          onClose={function () { setShowParkPrompt(false) }}
        />
      )}

      {/* Open drawer modal */}
      {showOpenDrawer && (
        <OpenDrawerModal
          onOpen={openDrawer}
          onClose={function () { setShowOpenDrawer(false) }}
        />
      )}

      {/* Close drawer modal */}
      {showCloseDrawer && drawerSession && (
        <CloseDrawerModal
          session={drawerSession}
          userId={userId}
          onClose={function () { setShowCloseDrawer(false) }}
          onCloseDrawer={closeDrawer}
        />
      )}
    </div>
  )
}

// =============================================================================
// Open Drawer Modal
// =============================================================================
function OpenDrawerModal({ onOpen, onClose }) {
  const [startingCash, setStartingCash] = useState('100')
  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', color: '#111827' }}>💵 Open Cash Drawer</h2>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#6b7280' }}>
          How much cash are you starting with? This is your "till float" — typically $50–$200 in small bills to make change.
        </p>
        <Label>Starting Cash</Label>
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          value={startingCash}
          onChange={function (e) { setStartingCash(e.target.value) }}
          onFocus={function (e) { e.target.select() }}
          style={fieldStyle}
          onKeyDown={function (e) { if (e.key === 'Enter') onOpen(startingCash) }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={function () { onOpen(startingCash) }} style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Open Drawer</button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Close Drawer Modal — shows expected vs counted with live variance
// =============================================================================
function CloseDrawerModal({ session, userId, onClose, onCloseDrawer }) {
  const [endingCash, setEndingCash] = useState('')
  const [noteText, setNoteText] = useState('')
  const [expected, setExpected] = useState(null)
  const [cashIn, setCashIn] = useState(0)

  // Pre-compute expected on open
  useEffect(function () {
    var run = async function () {
      const { data } = await supabase
        .from('sale_payments')
        .select('amount, sales!inner(cash_drawer_session_id)')
        .eq('method', 'cash')
        .eq('sales.cash_drawer_session_id', session.id)
      var sum = (data || []).reduce(function (s, r) { return s + (parseFloat(r.amount) || 0) }, 0)
      setCashIn(sum)
      setExpected((parseFloat(session.starting_cash) || 0) + sum)
    }
    run()
  }, [session.id])

  var ec = parseFloat(endingCash)
  var variance = !isNaN(ec) && expected != null ? ec - expected : null

  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '460px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', color: '#111827' }}>💵 Close Cash Drawer</h2>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#6b7280' }}>
          Count every bill and coin in the drawer, then enter the total below.
        </p>

        {/* Expected breakdown */}
        <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '10px', marginBottom: '14px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
            <span>Starting cash</span>
            <span style={{ fontWeight: 700 }}>{money(session.starting_cash)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151', marginTop: '4px' }}>
            <span>Cash sales since open</span>
            <span style={{ fontWeight: 700 }}>+{money(cashIn)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '6px', color: '#111827', fontWeight: 800 }}>
            <span>Expected in drawer</span>
            <span>{expected != null ? money(expected) : '…'}</span>
          </div>
        </div>

        <Label>Counted Cash</Label>
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          value={endingCash}
          onChange={function (e) { setEndingCash(e.target.value) }}
          onFocus={function (e) { e.target.select() }}
          placeholder={expected != null ? expected.toFixed(2) : '0.00'}
          style={fieldStyle}
        />

        {/* Live variance */}
        {variance != null && (
          <div style={{
            marginTop: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: variance === 0 ? '#ecfdf5' : (variance < 0 ? '#fef2f2' : '#fef3c7'),
            color: variance === 0 ? '#065f46' : (variance < 0 ? '#991b1b' : '#854d0e'),
            fontWeight: 700, fontSize: '14px',
            textAlign: 'center',
          }}>
            {variance === 0 ? '✓ Exact match!' : (variance < 0 ? 'Short ' + money(Math.abs(variance)) : 'Over ' + money(variance))}
          </div>
        )}

        <Label>Note (optional)</Label>
        <input
          type="text"
          value={noteText}
          onChange={function (e) { setNoteText(e.target.value) }}
          placeholder="e.g. 'gave too much change to last customer'"
          style={fieldStyle}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={function () { onCloseDrawer(endingCash, noteText) }}
            disabled={endingCash === ''}
            style={{ padding: '10px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: endingCash === '' ? 'not-allowed' : 'pointer', opacity: endingCash === '' ? 0.5 : 1 }}
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Park Prompt Modal
// =============================================================================
function ParkPromptModal({ defaultLabel, onPark, onClose }) {
  const [label, setLabel] = useState(defaultLabel || '')
  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', color: '#111827' }}>📌 Park This Cart</h2>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#6b7280' }}>
          Save it for later. Label helps you find it (e.g. "Mrs. Smith pickup"). Inventory stays untouched until you resume + charge.
        </p>
        <Label>Label (optional)</Label>
        <input
          type="text"
          autoFocus
          value={label}
          onChange={function (e) { setLabel(e.target.value) }}
          placeholder="e.g. Mrs. Smith pickup"
          style={fieldStyle}
          onKeyDown={function (e) { if (e.key === 'Enter') onPark(label) }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={function () { onPark(label) }} style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>Park Cart</button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Custom Item Modal
// =============================================================================
function CustomItemModal({ onAdd, onClose }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    if (!name.trim()) { setError('Name is required.'); return }
    var p = parseFloat(price)
    if (isNaN(p) || p < 0) { setError('Enter a valid price.'); return }
    onAdd(name, p)
  }

  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', color: '#111827' }}>+ Custom Item</h2>
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#6b7280' }}>
          Add a one-off charge (no inventory). Great for de-shed surcharges, matted fees, or specials.
        </p>
        {error && (
          <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '12px', marginBottom: '10px' }}>
            {error}
          </div>
        )}
        <Label>Item Name *</Label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={function (e) { setName(e.target.value) }}
          placeholder="e.g. De-shed surcharge"
          style={fieldStyle}
          onKeyDown={function (e) { if (e.key === 'Enter') handleAdd() }}
        />
        <Label>Price *</Label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={function (e) { setPrice(e.target.value) }}
          placeholder="0.00"
          style={fieldStyle}
          onKeyDown={function (e) { if (e.key === 'Enter') handleAdd() }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Receipt Screen
// =============================================================================
function ReceiptScreen({ completed, shopSettings, onDone }) {
  const { sale, items, client, change, payments, tipStaff } = completed
  const dateStr = new Date(sale.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const [delivering, setDelivering] = useState(false)
  const [deliverResult, setDeliverResult] = useState(null)   // {ok, kind, text}
  const [emailOverride, setEmailOverride] = useState((client && client.email) || '')
  const [phoneOverride, setPhoneOverride] = useState((client && client.phone) || '')
  const [showEmailField, setShowEmailField] = useState(false)
  const [showSmsField, setShowSmsField] = useState(false)

  const shopName = (shopSettings && shopSettings.shop_name) || 'Your Shop'
  const shopAddress = (shopSettings && shopSettings.address) || ''
  const shopPhone = (shopSettings && shopSettings.phone) || ''
  const shopLogo = (shopSettings && shopSettings.logo_url) || ''
  const footerText = (shopSettings && shopSettings.receipt_footer_text) || ''

  function printReceipt() {
    window.print()
  }

  async function sendEmail() {
    if (!emailOverride || !emailOverride.trim()) { setShowEmailField(true); return }
    setDelivering(true); setDeliverResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('email-sale-receipt', {
        body: { sale_id: sale.id, to_email: emailOverride.trim() },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      setDeliverResult({ ok: true, kind: 'email', text: 'Sent to ' + (data.sent_to || emailOverride) })
    } catch (err) {
      setDeliverResult({ ok: false, kind: 'email', text: err.message || 'Failed to send' })
    } finally { setDelivering(false) }
  }

  async function sendSms() {
    if (!phoneOverride || !phoneOverride.trim()) { setShowSmsField(true); return }
    setDelivering(true); setDeliverResult(null)
    try {
      var body = 'Receipt from ' + shopName + ': $' + (parseFloat(sale.total) || 0).toFixed(2) + ' on ' + new Date(sale.created_at).toLocaleDateString() + '. Thanks!'
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: phoneOverride.trim(), body: body, kind: 'receipt' },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      setDeliverResult({ ok: true, kind: 'sms', text: 'Texted to ' + phoneOverride })
    } catch (err) {
      setDeliverResult({ ok: false, kind: 'sms', text: err.message || 'Failed to send' })
    } finally { setDelivering(false) }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: #fff !important; }
        }
      `}</style>

      {/* Success header */}
      <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: '14px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>✅</div>
        <h1 style={{ margin: '0 0 4px', fontSize: '24px', color: '#16a34a', fontWeight: 800 }}>Sale Complete</h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
          {money(sale.total)} {sale.payment_method ? '• ' + (sale.payment_method === 'split' ? 'split payment' : 'paid by ' + sale.payment_method) : ''}
        </p>
        {parseFloat(sale.tip_amount) > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#16a34a', fontWeight: 700 }}>
            💰 Includes {money(sale.tip_amount)} tip{tipStaff ? ' for ' + tipStaff.first_name : ''}
          </p>
        )}
        {change != null && change > 0 && (
          <p style={{ margin: '4px 0 0', fontSize: '16px', color: '#111827', fontWeight: 700 }}>
            Change owed: {money(change)}
          </p>
        )}
      </div>

      {/* Receipt body */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', fontFamily: 'monospace', fontSize: '13px', color: '#111827' }}>
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          {shopLogo && (
            <img src={shopLogo} alt="" style={{ maxHeight: '60px', maxWidth: '180px', marginBottom: '8px', objectFit: 'contain' }} />
          )}
          <div style={{ fontWeight: 800, fontSize: '16px' }}>{shopName}</div>
          {shopAddress && <div style={{ color: '#6b7280', fontSize: '11px' }}>{shopAddress}</div>}
          {shopPhone && <div style={{ color: '#6b7280', fontSize: '11px' }}>{shopPhone}</div>}
          <div style={{ borderTop: '1px dashed #d1d5db', margin: '10px 0' }} />
          <div style={{ color: '#6b7280', fontSize: '11px' }}>{dateStr}</div>
          <div style={{ color: '#6b7280', fontSize: '11px' }}>Sale #{sale.id.slice(0, 8).toUpperCase()}</div>
          {client && (
            <div style={{ color: '#374151', fontSize: '12px', marginTop: '4px' }}>
              Customer: {client.first_name} {client.last_name}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed #d1d5db', borderBottom: '1px dashed #d1d5db', padding: '10px 0' }}>
          {items.map(function (l, idx) {
            var dispName = l.custom ? l.custom_name : l.product.name
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>{l.qty} × {dispName}</span>
                <span>{money(l.unit_price * l.qty)}</span>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span><span>{money(sale.subtotal)}</span>
          </div>
          {parseFloat(sale.discount_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount{sale.discount_reason ? ' (' + sale.discount_reason + ')' : ''}</span><span>−{money(sale.discount_amount)}</span>
            </div>
          )}
          {parseFloat(sale.tax_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax</span><span>{money(sale.tax_amount)}</span>
            </div>
          )}
          {parseFloat(sale.tip_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tip{tipStaff ? ' (' + tipStaff.first_name + ')' : ''}</span><span>{money(sale.tip_amount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #111827', paddingTop: '6px', marginTop: '4px', fontWeight: 800, fontSize: '14px' }}>
            <span>TOTAL</span><span>{money(sale.total)}</span>
          </div>
          {payments && payments.length > 0 ? (
            payments.map(function (p, idx) {
              var amt = parseFloat(p.amount) || 0
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                  <span>Paid via {p.method}</span>
                  <span>{money(amt)}</span>
                </div>
              )
            })
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
              <span>Paid via {sale.payment_method}</span><span></span>
            </div>
          )}
        </div>

        {footerText ? (
          <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', color: '#6b7280', whiteSpace: 'pre-wrap' }}>
            {footerText}
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '11px', color: '#6b7280' }}>
            Thank you! 🐾
          </div>
        )}
      </div>

      {/* Delivery result banner */}
      {deliverResult && (
        <div className="no-print" style={{
          marginTop: '12px', padding: '10px 12px',
          background: deliverResult.ok ? '#ecfdf5' : '#fef2f2',
          border: '1px solid ' + (deliverResult.ok ? '#bbf7d0' : '#fecaca'),
          borderRadius: '8px', fontSize: '13px',
          color: deliverResult.ok ? '#065f46' : '#991b1b', fontWeight: 600,
        }}>
          {deliverResult.ok ? '✓ ' : '⚠️ '}{deliverResult.text}
        </div>
      )}

      {/* Inline email field if needed */}
      {showEmailField && !deliverResult && (
        <div className="no-print" style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
          <input
            type="email"
            autoFocus
            value={emailOverride}
            onChange={function (e) { setEmailOverride(e.target.value) }}
            placeholder="customer@example.com"
            style={Object.assign({}, fieldStyle, { flex: 1 })}
          />
          <button
            onClick={sendEmail}
            disabled={delivering}
            style={{ padding: '10px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            {delivering ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
      {showSmsField && !deliverResult && (
        <div className="no-print" style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
          <input
            type="tel"
            autoFocus
            value={phoneOverride}
            onChange={function (e) { setPhoneOverride(e.target.value) }}
            placeholder="+1 555-555-5555"
            style={Object.assign({}, fieldStyle, { flex: 1 })}
          />
          <button
            onClick={sendSms}
            disabled={delivering}
            style={{ padding: '10px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            {delivering ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '16px' }}>
        <button
          onClick={printReceipt}
          style={{ padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          🖨️ Print
        </button>
        <button
          onClick={sendEmail}
          disabled={delivering}
          style={{ padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          📧 Email
        </button>
        <button
          onClick={sendSms}
          disabled={delivering}
          style={{ padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          📱 Text
        </button>
        <button
          onClick={onDone}
          style={{ padding: '12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}
        >
          New Sale →
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Client Picker Modal
// =============================================================================
function ClientPickerModal({ clients, search, onSearchChange, onSelect, onClose }) {
  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px',
      }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '17px', color: '#111827' }}>Attach to Client</h2>
        <input
          type="text"
          autoFocus
          placeholder="Search name or phone…"
          value={search}
          onChange={function (e) { onSearchChange(e.target.value) }}
          style={Object.assign({}, fieldStyle, { marginBottom: '10px' })}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {clients.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
              No clients match.
            </div>
          ) : (
            clients.map(function (c) {
              return (
                <button
                  key={c.id}
                  onClick={function () { onSelect(c) }}
                  style={{ width: '100%', padding: '10px 12px', background: '#fff', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'left', fontSize: '14px', color: '#111827' }}
                >
                  <strong>{c.first_name} {c.last_name}</strong>
                  {c.phone && <span style={{ color: '#6b7280', marginLeft: '8px', fontSize: '12px' }}>{c.phone}</span>}
                </button>
              )
            })
          )}
        </div>
        <button
          onClick={onClose}
          style={{ marginTop: '12px', padding: '10px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
        >
          Cancel (keep walk-in)
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================
function TotalRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151' }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
      {children}
    </div>
  )
}

function CategoryChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        background: active ? '#7c3aed' : '#fff',
        color: active ? '#fff' : '#374151',
        border: '1px solid ' + (active ? '#7c3aed' : '#d1d5db'),
        borderRadius: '999px',
        fontWeight: 600,
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
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

const qtyBtnStyle = {
  width: '36px',
  height: '36px',
  padding: 0,
  background: '#fff',
  color: '#111827',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontWeight: 800,
  fontSize: '18px',
  cursor: 'pointer',
  lineHeight: 1,
}
