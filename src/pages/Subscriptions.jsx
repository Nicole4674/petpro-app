// =============================================================================
// Subscriptions.jsx — Groomer-side: create + manage subscription plans
// =============================================================================
// Phase 1 of the subscription feature. Groomers create custom subscription
// products (e.g. "$30/mo unlimited nail trims") that clients will eventually
// be able to subscribe to via the client portal (Phase 2).
//
// This page:
//   • Lists existing plans (active + inactive)
//   • "+ Create new plan" form with all 4 plan types supported
//   • Edit / activate / deactivate existing plans
//   • Talks to the create-subscription-plan edge function which creates
//     a Stripe Product + Price on the groomer's Connect account.
//
// Hidden behind FEATURE_FLAGS.SUBSCRIPTIONS until the whole feature is ready.
// =============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FEATURE_FLAGS } from '../lib/featureFlags'

export default function Subscriptions() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [plans, setPlans] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)  // plan obj if editing

  // ─── Phase 4: Subscribers tab ──────────────────────────────────────────
  // 'plans' (groomer creates/edits plans) or 'subscribers' (who's actually
  // subscribed + MRR + cancel buttons)
  const [activeTab, setActiveTab] = useState('plans')
  const [subscribers, setSubscribers] = useState([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [detailSub, setDetailSub] = useState(null)         // subscription obj when modal open
  const [detailUsage, setDetailUsage] = useState([])       // usage rows for that sub
  const [cancelingSubId, setCancelingSubId] = useState(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('🐾')
  const [priceDollars, setPriceDollars] = useState('30')
  const [billingInterval, setBillingInterval] = useState('month')
  const [planType, setPlanType] = useState('service')  // 'service' | 'discount' | 'bundle' | 'frequency'
  const [coveredServiceIds, setCoveredServiceIds] = useState([])
  const [usageCaps, setUsageCaps] = useState({})  // { service_id: cap_count }
  const [discountPct, setDiscountPct] = useState('20')
  const [autoBookWeeks, setAutoBookWeeks] = useState('6')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // ─── Feature flag gate ─────────────────────────────────────────────────
  // Show a "coming soon" page if the feature isn't enabled yet, so direct
  // URL hits don't expose unfinished UI.
  if (!FEATURE_FLAGS.SUBSCRIPTIONS) {
    return (
      <div style={{ padding: '60px 24px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🚧</div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>
          Subscriptions — Coming Soon
        </h1>
        <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
          Custom client subscription plans are in development. You'll be able to create plans like
          "$30/mo unlimited nail trims" or "$80/mo full groom + 2 baths" — and clients can subscribe
          + auto-pay through Stripe.
        </p>
        <button
          onClick={() => navigate('/')}
          style={{ marginTop: '20px', padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
        >
          ← Back to dashboard
        </button>
      </div>
    )
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        if (cancelled) return
        setUserId(user.id)

        // Pull plans + services in parallel
        const [{ data: planRows }, { data: svcRows }] = await Promise.all([
          supabase
            .from('subscription_plans')
            .select('*')
            .eq('groomer_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('services')
            .select('id, service_name, price, time_block_minutes, is_active')
            .eq('groomer_id', user.id)
            .eq('is_active', true)
            .order('service_name'),
        ])
        if (!cancelled) {
          setPlans(planRows || [])
          setServices(svcRows || [])
        }
      } catch (e) {
        console.error('[Subscriptions] load error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [navigate])

  function resetForm() {
    setName('')
    setDescription('')
    setEmoji('🐾')
    setPriceDollars('30')
    setBillingInterval('month')
    setPlanType('service')
    setCoveredServiceIds([])
    setUsageCaps({})
    setDiscountPct('20')
    setAutoBookWeeks('6')
    setError(null)
    setSuccessMsg(null)
    setEditingPlan(null)
  }

  function openEdit(plan) {
    setEditingPlan(plan)
    setName(plan.name || '')
    setDescription(plan.description || '')
    setEmoji(plan.emoji || '🐾')
    setPriceDollars(String((plan.price_cents || 0) / 100))
    setBillingInterval(plan.billing_interval || 'month')
    // Detect plan type from data
    if (plan.discount_pct) {
      setPlanType('discount')
      setDiscountPct(String(plan.discount_pct))
    } else if (plan.auto_book_interval_weeks) {
      setPlanType('frequency')
      setAutoBookWeeks(String(plan.auto_book_interval_weeks))
    } else if (plan.usage_caps && Object.keys(plan.usage_caps).length > 0) {
      setPlanType('bundle')
      setUsageCaps(plan.usage_caps)
      setCoveredServiceIds(plan.covered_service_ids || [])
    } else {
      setPlanType('service')
      setCoveredServiceIds(plan.covered_service_ids || [])
    }
    setShowCreateForm(true)
  }

  async function handleSave() {
    setError(null)
    setSuccessMsg(null)
    if (!name.trim()) {
      setError('Plan name is required.')
      return
    }
    const priceCents = Math.round(parseFloat(priceDollars) * 100)
    if (isNaN(priceCents) || priceCents <= 0) {
      setError('Price must be greater than 0.')
      return
    }

    setSaving(true)
    try {
      // Build the row based on selected plan type
      const row = {
        groomer_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        emoji: emoji.trim() || '🐾',
        price_cents: priceCents,
        billing_interval: billingInterval,
        // Default — clear all type-specific fields, then set the right one
        covered_service_ids: [],
        usage_caps: {},
        discount_pct: null,
        auto_book_interval_weeks: null,
      }

      if (planType === 'service') {
        row.covered_service_ids = coveredServiceIds
      } else if (planType === 'bundle') {
        row.covered_service_ids = Object.keys(usageCaps)
        row.usage_caps = usageCaps
      } else if (planType === 'discount') {
        row.discount_pct = parseInt(discountPct, 10)
      } else if (planType === 'frequency') {
        row.auto_book_interval_weeks = parseInt(autoBookWeeks, 10)
        row.covered_service_ids = coveredServiceIds
      }

      let savedPlanId
      if (editingPlan) {
        const { data, error: upErr } = await supabase
          .from('subscription_plans')
          .update(row)
          .eq('id', editingPlan.id)
          .select('id')
          .single()
        if (upErr) throw upErr
        savedPlanId = data.id
      } else {
        const { data, error: insErr } = await supabase
          .from('subscription_plans')
          .insert(row)
          .select('id')
          .single()
        if (insErr) throw insErr
        savedPlanId = data.id
      }

      // Create/update Stripe Product + Price on the groomer's Connect account
      // (Edge function handles all the Stripe API calls)
      try {
        const { data: stripeRes, error: stripeErr } = await supabase.functions.invoke(
          'create-subscription-plan',
          {
            body: {
              plan_id: savedPlanId,
            },
          }
        )
        if (stripeErr) {
          console.warn('[Subscriptions] Stripe sync warning:', stripeErr)
          // Soft-fail — plan is in DB, just not in Stripe yet. Groomer can retry.
          setSuccessMsg('Plan saved! ⚠️ Stripe sync had an issue — try again or check Stripe Connect.')
        } else if (stripeRes && stripeRes.error) {
          setSuccessMsg('Plan saved! ⚠️ ' + stripeRes.error)
        } else {
          setSuccessMsg(editingPlan ? 'Plan updated and synced with Stripe ✅' : 'Plan created and synced with Stripe ✅')
        }
      } catch (stripeCallErr) {
        console.warn('[Subscriptions] Stripe call failed (non-fatal):', stripeCallErr)
        setSuccessMsg('Plan saved! ⚠️ Stripe sync skipped — try again later.')
      }

      // Reload list
      const { data: planRows } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('groomer_id', userId)
        .order('created_at', { ascending: false })
      setPlans(planRows || [])
      resetForm()
      setShowCreateForm(false)
    } catch (e) {
      console.error('[Subscriptions] save error:', e)
      setError(e.message || 'Could not save plan')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(plan) {
    const { error: upErr } = await supabase
      .from('subscription_plans')
      .update({ active: !plan.active })
      .eq('id', plan.id)
    if (upErr) {
      alert('Could not update: ' + upErr.message)
      return
    }
    setPlans(plans.map(p => p.id === plan.id ? { ...p, active: !p.active } : p))
  }

  function toggleCoveredService(svcId) {
    setCoveredServiceIds(prev =>
      prev.includes(svcId) ? prev.filter(id => id !== svcId) : [...prev, svcId]
    )
  }

  function setBundleCap(svcId, count) {
    const n = parseInt(count, 10)
    setUsageCaps(prev => {
      const next = { ...prev }
      if (isNaN(n) || n <= 0) {
        delete next[svcId]
      } else {
        next[svcId] = n
      }
      return next
    })
  }

  // ─── Phase 4: Subscribers tab logic ────────────────────────────────────
  // Load when tab switches to subscribers (and once at mount if already on it).
  // Pulls every subscription for this groomer + joins client + plan info.
  async function loadSubscribers() {
    if (!userId) return
    setLoadingSubs(true)
    try {
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select(`
          *,
          clients ( id, first_name, last_name, email, phone ),
          subscription_plans ( id, name, emoji, price_cents, billing_interval, discount_pct, usage_caps, covered_service_ids )
        `)
        .eq('groomer_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setSubscribers(data || [])
    } catch (e) {
      console.error('[Subscriptions] loadSubscribers:', e)
      setSubscribers([])
    } finally {
      setLoadingSubs(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'subscribers' && userId) {
      loadSubscribers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId])

  // Open the detail modal for a subscriber — pull their usage history too
  async function openSubDetail(sub) {
    setDetailSub(sub)
    setDetailUsage([])
    try {
      const { data } = await supabase
        .from('subscription_usage')
        .select('*, appointments(appointment_date, services(service_name))')
        .eq('subscription_id', sub.id)
        .order('used_at', { ascending: false })
        .limit(50)
      setDetailUsage(data || [])
    } catch (e) {
      console.error('[Subscriptions] openSubDetail usage err:', e)
    }
  }

  // Cancel a subscription. atPeriodEnd=true means "let them keep using it
  // until the current billing cycle ends, then stop". false = stop now.
  async function handleCancelSub(sub, atPeriodEnd) {
    const verb = atPeriodEnd ? 'cancel at end of period' : 'cancel immediately'
    const who = sub.clients ? `${sub.clients.first_name} ${sub.clients.last_name}` : 'this client'
    if (!confirm(`Sure you want to ${verb} ${who}'s subscription to "${sub.subscription_plans?.name || 'this plan'}"?`)) return
    setCancelingSubId(sub.id)
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: { subscription_id: sub.id, at_period_end: atPeriodEnd },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      // Refresh list + close modal
      await loadSubscribers()
      if (detailSub && detailSub.id === sub.id) setDetailSub(null)
    } catch (e) {
      alert('Could not cancel: ' + (e.message || e))
    } finally {
      setCancelingSubId(null)
    }
  }

  // Calculate MRR (monthly recurring revenue) by normalizing every active
  // sub's price to a monthly equivalent: weekly *4.33, monthly *1, yearly /12.
  function calcMRR() {
    let mrrCents = 0
    for (const s of subscribers) {
      if (s.status !== 'active' || s.cancel_at_period_end) continue  // exclude paused/canceling
      const plan = s.subscription_plans
      if (!plan) continue
      const cents = plan.price_cents || 0
      if (plan.billing_interval === 'week') mrrCents += cents * 4.33
      else if (plan.billing_interval === 'year') mrrCents += cents / 12
      else mrrCents += cents  // assume monthly
    }
    return mrrCents / 100
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading subscriptions…</div>
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>
            🔁 Subscriptions
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>
            Create plans + see who's subscribed. Auto-billed via Stripe.
          </p>
        </div>
        {activeTab === 'plans' && !showCreateForm && (
          <button
            onClick={() => { resetForm(); setShowCreateForm(true) }}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
          >
            + Create new plan
          </button>
        )}
      </div>

      {/* ─── Tab nav ─── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        {[
          { id: 'plans', label: '📋 Plans', count: plans.length },
          { id: 'subscribers', label: '👥 Subscribers', count: subscribers.length || null },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === t.id ? '3px solid #7c3aed' : '3px solid transparent',
              marginBottom: '-2px',
              color: activeTab === t.id ? '#7c3aed' : '#6b7280',
              fontWeight: activeTab === t.id ? 800 : 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {t.label} {t.count !== null && t.count !== undefined && (
              <span style={{ marginLeft: '6px', padding: '1px 7px', background: activeTab === t.id ? '#7c3aed' : '#e5e7eb', color: activeTab === t.id ? '#fff' : '#6b7280', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PLANS TAB — existing plan creator/editor + plan list
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'plans' && (<>

      {/* Create / Edit form */}
      {showCreateForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1f2937', margin: '0 0 16px' }}>
            {editingPlan ? '✏️ Edit Plan' : '➕ New Plan'}
          </h2>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '14px' }}>
              ⚠️ {error}
            </div>
          )}
          {successMsg && (
            <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '13px', marginBottom: '14px' }}>
              {successMsg}
            </div>
          )}

          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Emoji</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} style={{ ...inputStyle, textAlign: 'center', fontSize: '18px' }} />
            </div>
            <div>
              <label style={labelStyle}>Plan Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nail Trim Club" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Description (shown to clients)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Unlimited nail trims for one low monthly fee. Walk-in friendly!"
              rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Price (USD)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontWeight: 700 }}>$</span>
                <input type="number" min="0" step="1" value={priceDollars} onChange={e => setPriceDollars(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: '24px' }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Billing Period</label>
              <select value={billingInterval} onChange={e => setBillingInterval(e.target.value)} style={inputStyle}>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
          </div>

          {/* Plan type picker */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Plan Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
              {[
                { id: 'service',   emoji: '✂️', label: 'Service-based',  desc: 'Unlimited specific service(s)' },
                { id: 'bundle',    emoji: '📦', label: 'Bundle',          desc: 'N of A + M of B per period' },
                { id: 'discount',  emoji: '💰', label: 'Discount',        desc: '% off everything' },
                { id: 'frequency', emoji: '📅', label: 'Auto-book',       desc: 'Auto-books every X weeks' },
              ].map(t => (
                <button key={t.id} type="button" onClick={() => setPlanType(t.id)}
                  style={{
                    padding: '12px',
                    border: planType === t.id ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
                    borderRadius: '10px',
                    background: planType === t.id ? '#faf5ff' : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: '20px' }}>{t.emoji}</div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#1f2937', marginTop: '4px' }}>{t.label}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Type-specific fields */}
          {planType === 'service' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Covered Services (unlimited within billing period)</label>
              {services.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>No active services — add some in Pricing first.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px', maxHeight: '240px', overflowY: 'auto', padding: '6px', background: '#f9fafb', borderRadius: '8px' }}>
                  {services.map(svc => (
                    <label key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                      <input type="checkbox" checked={coveredServiceIds.includes(svc.id)} onChange={() => toggleCoveredService(svc.id)} />
                      <span>{svc.service_name} <span style={{ color: '#9ca3af', fontSize: '11px' }}>(${parseFloat(svc.price).toFixed(0)})</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {planType === 'bundle' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Bundle — How many of each service per billing period</label>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>Set 0 to skip a service.</div>
              {services.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>No active services.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                  {services.map(svc => (
                    <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                      <span style={{ flex: 1, fontSize: '13px' }}>{svc.service_name} <span style={{ color: '#9ca3af', fontSize: '11px' }}>(${parseFloat(svc.price).toFixed(0)})</span></span>
                      <input type="number" min="0" value={usageCaps[svc.id] || 0} onChange={e => setBundleCap(svc.id, e.target.value)} style={{ width: '70px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                      <span style={{ fontSize: '11px', color: '#6b7280', minWidth: '60px' }}>/ {billingInterval}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {planType === 'discount' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Discount % (off all services)</label>
              <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)} style={inputStyle} />
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                Subscribers get this percentage off every appointment automatically.
              </div>
            </div>
          )}

          {planType === 'frequency' && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Auto-book every X weeks</label>
                <input type="number" min="1" max="52" value={autoBookWeeks} onChange={e => setAutoBookWeeks(e.target.value)} style={inputStyle} />
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                  PetPro will auto-create the next recurring appointment each cycle. Common: 4 (monthly), 6 (most groomings), 8 (medium).
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Service to auto-book</label>
                {services.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>No active services.</div>
                ) : (
                  <select value={coveredServiceIds[0] || ''} onChange={e => setCoveredServiceIds(e.target.value ? [e.target.value] : [])} style={inputStyle}>
                    <option value="">— pick one —</option>
                    {services.map(svc => (
                      <option key={svc.id} value={svc.id}>{svc.service_name} (${parseFloat(svc.price).toFixed(0)})</option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={() => { resetForm(); setShowCreateForm(false) }}
              style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : (editingPlan ? '✓ Update Plan' : '✓ Create Plan')}
            </button>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '12px', color: '#6b7280' }}>
          No plans yet. Click <strong>+ Create new plan</strong> to start.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {plans.map(plan => (
            <div key={plan.id} style={{
              background: plan.active ? '#fff' : '#f9fafb',
              border: '1.5px solid ' + (plan.active ? '#e5e7eb' : '#d1d5db'),
              borderRadius: '14px',
              padding: '16px 18px',
              opacity: plan.active ? 1 : 0.7,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937' }}>
                    {plan.emoji || '🐾'} {plan.name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#7c3aed', fontWeight: 700, marginTop: '2px' }}>
                    ${(plan.price_cents / 100).toFixed(2)} / {plan.billing_interval}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px',
                  background: plan.active ? '#dcfce7' : '#f3f4f6',
                  color: plan.active ? '#166534' : '#6b7280',
                }}>
                  {plan.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              {plan.description && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px', lineHeight: 1.4 }}>
                  {plan.description}
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
                {plan.discount_pct ? `${plan.discount_pct}% off everything` :
                 plan.auto_book_interval_weeks ? `Auto-books every ${plan.auto_book_interval_weeks} weeks` :
                 plan.usage_caps && Object.keys(plan.usage_caps).length > 0 ? `Bundle: ${Object.values(plan.usage_caps).join(' + ')} services / period` :
                 plan.covered_service_ids && plan.covered_service_ids.length > 0 ? `Unlimited ${plan.covered_service_ids.length} service(s)` :
                 'No coverage configured'}
              </div>
              {plan.stripe_product_id ? (
                <div style={{ fontSize: '10px', color: '#10b981' }}>✓ Synced with Stripe</div>
              ) : (
                <div style={{ fontSize: '10px', color: '#f59e0b' }}>⚠️ Not synced with Stripe</div>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                <button onClick={() => openEdit(plan)}
                  style={{ flex: 1, padding: '6px 10px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  ✏️ Edit
                </button>
                <button onClick={() => toggleActive(plan)}
                  style={{ flex: 1, padding: '6px 10px', background: plan.active ? '#fff' : '#7c3aed', color: plan.active ? '#6b7280' : '#fff', border: '1px solid ' + (plan.active ? '#d1d5db' : '#7c3aed'), borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {plan.active ? '⏸ Pause' : '▶ Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      </>)}

      {/* ═══════════════════════════════════════════════════════════════
          SUBSCRIBERS TAB — KPIs + table of who's subscribed
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'subscribers' && (<>

      {/* KPI cards */}
      {(() => {
        const activeCount = subscribers.filter(s => s.status === 'active').length
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
        const cancelsThisMonth = subscribers.filter(s =>
          s.canceled_at && new Date(s.canceled_at) >= startOfMonth
        ).length
        const mrr = calcMRR()
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff', padding: '18px 20px', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.5px', opacity: 0.85, fontWeight: 700 }}>MONTHLY RECURRING REVENUE</div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>${mrr.toFixed(2)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>From {activeCount} active sub{activeCount === 1 ? '' : 's'}</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', padding: '18px 20px', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 700 }}>ACTIVE SUBSCRIBERS</div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>{activeCount}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Currently billed</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', padding: '18px 20px', borderRadius: '14px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 700 }}>CANCELED THIS MONTH</div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: cancelsThisMonth > 0 ? '#dc2626' : '#1f2937' }}>{cancelsThisMonth}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Churn this month</div>
            </div>
          </div>
        )
      })()}

      {/* Subscribers table */}
      {loadingSubs ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading subscribers…</div>
      ) : subscribers.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '12px', color: '#6b7280' }}>
          No subscribers yet. Once a client subscribes from their portal, they'll show up here.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Next renewal</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map(sub => {
                  const c = sub.clients
                  const p = sub.subscription_plans
                  const statusColor = sub.status === 'active' ? '#10b981' :
                                      sub.status === 'past_due' ? '#f59e0b' :
                                      sub.status === 'canceled' ? '#9ca3af' :
                                      '#6b7280'
                  const statusBg = sub.status === 'active' ? '#dcfce7' :
                                   sub.status === 'past_due' ? '#fef3c7' :
                                   sub.status === 'canceled' ? '#f3f4f6' :
                                   '#f3f4f6'
                  return (
                    <tr key={sub.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: '#1f2937' }}>
                          {c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{c?.email || c?.phone || ''}</div>
                      </td>
                      <td style={tdStyle}>
                        <div>{p?.emoji || '🐾'} {p?.name || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700 }}>
                          {p ? `$${(p.price_cents / 100).toFixed(2)}/${p.billing_interval}` : ''}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', background: statusBg, color: statusColor, borderRadius: '12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {sub.status || '—'}
                        </span>
                        {sub.cancel_at_period_end && (
                          <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px', fontWeight: 700 }}>
                            ⏳ ENDS {fmtDate(sub.current_period_end)}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>{fmtDate(sub.created_at)}</td>
                      <td style={tdStyle}>
                        {sub.status === 'canceled' ? (
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}>Canceled {fmtDate(sub.canceled_at)}</span>
                        ) : (
                          fmtDate(sub.current_period_end)
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openSubDetail(sub)}
                          style={{ padding: '5px 10px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}

      {/* ═══════════════════════════════════════════════════════════════
          SUBSCRIBER DETAIL MODAL — usage history + cancel buttons
          ═══════════════════════════════════════════════════════════════ */}
      {detailSub && (
        <div onClick={() => setDetailSub(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '16px', maxWidth: '600px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1f2937' }}>
                  {detailSub.subscription_plans?.emoji || '🐾'} {detailSub.subscription_plans?.name || 'Subscription'}
                </h2>
                <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>
                  {detailSub.clients ? `${detailSub.clients.first_name} ${detailSub.clients.last_name}` : '—'}
                </div>
              </div>
              <button onClick={() => setDetailSub(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            {/* Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px', fontSize: '12px' }}>
              <div><strong>Status:</strong> {detailSub.status || '—'}</div>
              <div><strong>Price:</strong> ${detailSub.subscription_plans ? (detailSub.subscription_plans.price_cents / 100).toFixed(2) : '0.00'}/{detailSub.subscription_plans?.billing_interval || 'mo'}</div>
              <div><strong>Started:</strong> {fmtDate(detailSub.created_at)}</div>
              <div><strong>Renews:</strong> {detailSub.cancel_at_period_end ? `Ends ${fmtDate(detailSub.current_period_end)}` : fmtDate(detailSub.current_period_end)}</div>
              {detailSub.canceled_at && (
                <div style={{ gridColumn: 'span 2', color: '#9ca3af' }}><strong>Canceled:</strong> {fmtDate(detailSub.canceled_at)}</div>
              )}
            </div>

            {/* Usage history */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1f2937', marginBottom: '8px' }}>
                📈 Usage History ({detailUsage.length})
              </div>
              {detailUsage.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#9ca3af', padding: '12px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                  No usage yet — this client hasn't booked an appointment that tapped this subscription.
                </div>
              ) : (
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '8px' }}>
                  {detailUsage.map(u => (
                    <div key={u.id} style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#1f2937', fontWeight: 600 }}>{u.appointments?.services?.service_name || 'Appointment'}</span>
                        <span style={{ color: '#9ca3af' }}>{fmtDate(u.used_at)}</span>
                      </div>
                      {u.notes && <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>{u.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cancel buttons — only show if not already canceled */}
            {detailSub.status !== 'canceled' && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>Danger zone</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!detailSub.cancel_at_period_end && (
                    <button onClick={() => handleCancelSub(detailSub, true)} disabled={cancelingSubId === detailSub.id}
                      style={{ flex: 1, minWidth: '180px', padding: '10px 14px', background: '#fff', color: '#f59e0b', border: '1.5px solid #f59e0b', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                      ⏳ Cancel at end of period
                    </button>
                  )}
                  <button onClick={() => handleCancelSub(detailSub, false)} disabled={cancelingSubId === detailSub.id}
                    style={{ flex: 1, minWidth: '180px', padding: '10px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                    🛑 Cancel immediately
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px' }}>
                  "End of period" = client keeps using until {fmtDate(detailSub.current_period_end)}, no more charges. "Immediately" = stops right now.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared styles
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', boxSizing: 'border-box' }
// Subscribers table cells (Phase 4)
const thStyle = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const tdStyle = { padding: '12px 14px', verticalAlign: 'top' }
