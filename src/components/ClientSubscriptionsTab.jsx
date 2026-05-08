// =============================================================================
// ClientSubscriptionsTab.jsx — Client portal "🔁 Subscriptions" tab
// =============================================================================
// Mounted from ClientPortalDashboard when activeTab === 'subscriptions'.
// Shows:
//   1. Client's CURRENT subscriptions (with cancel button)
//   2. AVAILABLE plans from their groomer (with subscribe button)
//
// Subscribe flow:
//   1. Client clicks "Subscribe to {plan name}"
//   2. We call create-subscription-checkout edge function → returns Stripe Checkout URL
//   3. Redirect to Stripe Checkout (hosted by Stripe, on the groomer's Connect account)
//   4. Client enters card → Stripe creates the Subscription
//   5. On success, Stripe redirects back to /portal?subscribed=1&session_id=cs_...
//   6. Portal sees ?subscribed=1, calls confirm-subscription edge function to save the row
//
// Cancel flow:
//   • Mark cancel_at_period_end=true (Stripe handles the actual cancellation at end of period)
//   • Or immediate cancel — user choice
// =============================================================================

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ClientSubscriptionsTab({ clientId, groomerId }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(null)  // plan_id being subscribed to
  const [confirmingSession, setConfirmingSession] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Map service_id → service_name for plan descriptions
  const serviceMap = {}
  ;(services || []).forEach(function (s) { serviceMap[s.id] = s.service_name })

  // ─── Load plans + current subscriptions ───
  async function loadAll() {
    if (!clientId || !groomerId) return
    setLoading(true)
    try {
      const [{ data: planRows }, { data: subRows }, { data: svcRows }] = await Promise.all([
        supabase
          .from('subscription_plans')
          .select('*')
          .eq('groomer_id', groomerId)
          .eq('active', true)
          .order('price_cents', { ascending: true }),
        supabase
          .from('client_subscriptions')
          .select('*, subscription_plans(name, emoji, price_cents, billing_interval, description, covered_service_ids, usage_caps, discount_pct, auto_book_interval_weeks)')
          .eq('client_id', clientId)
          .in('status', ['active', 'past_due', 'pending', 'paused', 'incomplete'])
          .order('created_at', { ascending: false }),
        supabase
          .from('services')
          .select('id, service_name')
          .eq('groomer_id', groomerId),
      ])
      setPlans(planRows || [])
      setSubscriptions(subRows || [])
      setServices(svcRows || [])
    } catch (e) {
      console.error('[client-subs] load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(function () { loadAll() }, [clientId, groomerId])

  // ─── On return from Stripe Checkout, finalize the subscription row ───
  useEffect(function () {
    var subscribed = searchParams.get('subscribed')
    var sessionId = searchParams.get('session_id')
    if (subscribed === '1' && sessionId) {
      ;(async function () {
        setConfirmingSession(true)
        try {
          var { data, error } = await supabase.functions.invoke('confirm-subscription', {
            body: { session_id: sessionId },
          })
          if (error) throw error
          if (data && data.error) throw new Error(data.error)
          setSuccessMsg('🎉 Subscription confirmed! Welcome aboard.')
          // Clear the URL params so refresh doesn't re-confirm
          var newParams = new URLSearchParams(searchParams)
          newParams.delete('subscribed')
          newParams.delete('session_id')
          setSearchParams(newParams, { replace: true })
          await loadAll()
        } catch (e) {
          console.error('[client-subs] confirm error:', e)
          setError(e.message || 'Could not confirm subscription. If you were charged, contact your groomer.')
        } finally {
          setConfirmingSession(false)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubscribe(plan) {
    if (!plan.stripe_price_id) {
      setError('This plan isn\'t fully set up yet — please contact your groomer.')
      return
    }
    setSubscribing(plan.id)
    setError(null)
    try {
      var { data, error } = await supabase.functions.invoke('create-subscription-checkout', {
        body: {
          plan_id: plan.id,
          return_url: window.location.origin + '/portal?activeTab=subscriptions',
        },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      if (data && data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (e) {
      console.error('[client-subs] subscribe error:', e)
      setError(e.message || 'Could not start subscription')
      setSubscribing(null)
    }
  }

  async function handleCancel(sub, atPeriodEnd) {
    var confirmMsg = atPeriodEnd
      ? 'Cancel at end of current billing period? You\'ll keep the benefits until ' + (sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'period end') + '.'
      : 'Cancel immediately? You\'ll lose all subscription benefits right now and won\'t be billed again.'
    if (!window.confirm(confirmMsg)) return
    try {
      var { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          subscription_id: sub.id,
          at_period_end: atPeriodEnd,
        },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      setSuccessMsg(atPeriodEnd ? 'Subscription will end at the period end.' : 'Subscription cancelled immediately.')
      await loadAll()
    } catch (e) {
      console.error('[client-subs] cancel error:', e)
      setError(e.message || 'Could not cancel — please contact your groomer.')
    }
  }

  function describePlan(plan) {
    if (plan.discount_pct) return plan.discount_pct + '% off every visit'
    if (plan.auto_book_interval_weeks) {
      var svcName = (plan.covered_service_ids && plan.covered_service_ids[0]) ? (serviceMap[plan.covered_service_ids[0]] || 'service') : 'service'
      return 'Auto-books ' + svcName + ' every ' + plan.auto_book_interval_weeks + ' weeks'
    }
    if (plan.usage_caps && Object.keys(plan.usage_caps).length > 0) {
      var parts = []
      for (var sid in plan.usage_caps) {
        parts.push(plan.usage_caps[sid] + '× ' + (serviceMap[sid] || 'service'))
      }
      return 'Bundle: ' + parts.join(' + ') + ' / ' + plan.billing_interval
    }
    if (plan.covered_service_ids && plan.covered_service_ids.length > 0) {
      var names = plan.covered_service_ids.map(function (id) { return serviceMap[id] || 'service' })
      return 'Unlimited ' + names.join(', ')
    }
    return ''
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading subscription plans…</div>
  }

  return (
    <div className="cp-subscriptions" style={{ padding: '8px 0' }}>
      {confirmingSession && (
        <div style={{ padding: '14px 16px', background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: '10px', color: '#5b21b6', fontSize: '14px', marginBottom: '16px' }}>
          ⏳ Finalizing your subscription… please wait a moment.
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', color: '#065f46', fontSize: '14px', marginBottom: '16px' }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '14px', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* CURRENT subscriptions */}
      {subscriptions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1f2937', margin: '0 0 12px' }}>
            ✅ Your Active Subscriptions
          </h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {subscriptions.map(function (sub) {
              var plan = sub.subscription_plans
              if (!plan) return null
              var endDate = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'
              return (
                <div key={sub.id} style={{
                  background: '#fff',
                  border: '1.5px solid #c4b5fd',
                  borderRadius: '14px',
                  padding: '16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: '#1f2937' }}>
                        {plan.emoji || '🐾'} {plan.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#7c3aed', fontWeight: 700, marginTop: '2px' }}>
                        ${(plan.price_cents / 100).toFixed(2)} / {plan.billing_interval}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px',
                      background: sub.status === 'active' ? '#dcfce7' : '#fef3c7',
                      color: sub.status === 'active' ? '#166534' : '#92400e',
                    }}>
                      {sub.status.toUpperCase()}
                    </span>
                  </div>
                  {plan.description && <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{plan.description}</div>}
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
                    Next billing: <strong>{endDate}</strong>
                    {sub.cancel_at_period_end && <span style={{ color: '#dc2626', marginLeft: '8px' }}>· Will end on this date</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {!sub.cancel_at_period_end && (
                      <button
                        onClick={function () { handleCancel(sub, true) }}
                        style={{ padding: '6px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel at period end
                      </button>
                    )}
                    {sub.cancel_at_period_end && (
                      <span style={{ padding: '6px 12px', fontSize: '12px', color: '#9ca3af' }}>Already scheduled to cancel</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AVAILABLE plans */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1f2937', margin: '0 0 12px' }}>
          {subscriptions.length > 0 ? '➕ Other plans you can add' : '🎁 Available Subscription Plans'}
        </h3>
        {plans.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: '12px', color: '#6b7280', fontSize: '13px' }}>
            Your groomer hasn't set up any subscription plans yet. Check back later!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {plans.filter(function (p) {
              // Hide plans the client is already subscribed to (active/pending)
              return !subscriptions.some(function (s) { return s.plan_id === p.id })
            }).map(function (plan) {
              return (
                <div key={plan.id} style={{
                  background: '#fff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937' }}>
                    {plan.emoji || '🐾'} {plan.name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#7c3aed', fontWeight: 700, marginTop: '2px' }}>
                    ${(plan.price_cents / 100).toFixed(2)} / {plan.billing_interval}
                  </div>
                  {plan.description && (
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px', lineHeight: 1.4, flex: 1 }}>
                      {plan.description}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#374151', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 10px', marginTop: '10px' }}>
                    {describePlan(plan) || 'Subscription plan'}
                  </div>
                  <button
                    onClick={function () { handleSubscribe(plan) }}
                    disabled={subscribing === plan.id || !plan.stripe_price_id}
                    style={{
                      marginTop: '12px',
                      padding: '10px 16px',
                      background: plan.stripe_price_id ? '#7c3aed' : '#9ca3af',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: subscribing === plan.id ? 'wait' : (plan.stripe_price_id ? 'pointer' : 'not-allowed'),
                    }}
                  >
                    {subscribing === plan.id ? 'Loading…' : (plan.stripe_price_id ? '✨ Subscribe' : 'Not available yet')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: '14px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
          🔒 Payments are processed securely via Stripe. Your card details never touch PetPro or your groomer's system.
        </div>
      </div>
    </div>
  )
}
