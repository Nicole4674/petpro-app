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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading subscriptions…</div>
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>
            🔁 Subscription Plans
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>
            Create monthly/yearly plans clients can subscribe to. Auto-billed via Stripe.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => { resetForm(); setShowCreateForm(true) }}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
          >
            + Create new plan
          </button>
        )}
      </div>

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
    </div>
  )
}

// Shared styles
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', boxSizing: 'border-box' }
