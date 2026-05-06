// =======================================================
// PetPro — SMS Balance Widget
// =======================================================
// Lives next to AIUsageWidget on ShopSettings.jsx + Account.jsx.
//
// Shows the groomer their monthly SMS allocation:
//   • Unlimited (founder) → green badge, no count
//   • Has quota (Pro+ tiers) → bar + "X / Y left this month" + reset date
//   • Zero quota (Basic tier) → upgrade prompt
//
// Data source: groomer_sms_balance table (created by SMS Quota System Schema v1.sql,
// allocated by the Stripe webhook on subscription sync).
// =======================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SMSBalanceWidget() {
  var [loading, setLoading] = useState(true)
  var [balance, setBalance] = useState(null)

  useEffect(function () {
    loadBalance()
  }, [])

  async function loadBalance() {
    setLoading(true)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      var { data } = await supabase
        .from('groomer_sms_balance')
        .select('monthly_sms_remaining, monthly_sms_total, monthly_period_start, founder_unlimited_sms')
        .eq('groomer_id', user.id)
        .maybeSingle()

      setBalance(data || null)
    } catch (e) { /* non-critical */ }
    setLoading(false)
  }

  // ─── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <span style={{ fontSize: '20px' }}>📱</span>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>SMS Balance</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#9ca3af' }}>Loading…</p>
      </div>
    )
  }

  // ─── Founder unlimited ─────────────────────────────────────────────
  if (balance && balance.founder_unlimited_sms === true) {
    return (
      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <span style={{ fontSize: '20px' }}>📱</span>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>SMS Balance</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '10px', fontWeight: 700, color: '#7c3aed',
            background: '#faf5ff', border: '1px solid #e9d5ff',
            padding: '3px 8px', borderRadius: '999px',
          }}>
            ⭐ FOUNDER
          </span>
        </div>
        <div style={{
          marginTop: '12px',
          padding: '14px 16px',
          background: 'linear-gradient(135deg, #faf5ff, #ecfdf5)',
          border: '1px solid #d8b4fe',
          borderRadius: '10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#5b21b6', marginBottom: '4px' }}>
            ∞ Unlimited
          </div>
          <div style={{ fontSize: '12px', color: '#5b21b6' }}>
            Founders perk — send all the SMS you need
          </div>
        </div>
      </div>
    )
  }

  // ─── Compute display values for everyone else ──────────────────────
  var total = balance ? balance.monthly_sms_total : 0
  var remaining = balance ? balance.monthly_sms_remaining : 0
  var used = Math.max(0, total - remaining)

  // Reset date — first day of next month
  var resetLabel = '—'
  if (balance && balance.monthly_period_start) {
    var ps = new Date(balance.monthly_period_start)
    var nextMonth = new Date(ps.getFullYear(), ps.getMonth() + 1, 1)
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    resetLabel = months[nextMonth.getMonth()] + ' ' + nextMonth.getDate()
  }

  // ─── Zero quota (Basic tier or unsubscribed) — show upgrade prompt ─
  if (total === 0) {
    return (
      <div style={cardStyle}>
        <div style={headerRowStyle}>
          <span style={{ fontSize: '20px' }}>📱</span>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>SMS Balance</span>
        </div>
        <div style={{
          marginTop: '12px',
          padding: '14px 16px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
            SMS not included on this plan
          </div>
          <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.5 }}>
            Upgrade to <strong>Pro ($129)</strong> for 1,000 SMS/mo · <strong>Pro+ ($199)</strong> for 1,500 · <strong>Growing ($399)</strong> for 3,000.
          </div>
        </div>
      </div>
    )
  }

  // ─── Has a quota — show bar + remaining ────────────────────────────
  var pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  var barColor = '#10b981'      // green
  if (pct >= 80) barColor = '#f59e0b'   // amber
  if (pct >= 95) barColor = '#dc2626'   // red

  return (
    <div style={cardStyle}>
      <div style={headerRowStyle}>
        <span style={{ fontSize: '20px' }}>📱</span>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>SMS Balance</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#6b7280' }}>
          Resets {resetLabel}
        </span>
      </div>

      {/* Big number */}
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '26px', fontWeight: 800, color: '#1f2937' }}>
          {remaining.toLocaleString()}
        </span>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          / {total.toLocaleString()} left this month
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: '8px',
        height: '8px',
        background: '#f3f4f6',
        borderRadius: '999px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: pct + '%',
          height: '100%',
          background: barColor,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Used count */}
      <div style={{ marginTop: '6px', fontSize: '12px', color: '#9ca3af' }}>
        {used.toLocaleString()} sent this month ({pct}%)
      </div>

      {/* Low-balance nudge — show when 80%+ used */}
      {pct >= 80 && pct < 100 && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#92400e',
        }}>
          ⚠️ Running low — consider upgrading your plan to avoid running out before {resetLabel}.
        </div>
      )}

      {/* Out of quota — block warning */}
      {pct >= 100 && (
        <div style={{
          marginTop: '10px',
          padding: '10px 12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#991b1b',
          fontWeight: 600,
        }}>
          🚫 Out of SMS for this month. Upgrade your plan or wait until {resetLabel}.
        </div>
      )}
    </div>
  )
}

// ═══ Shared styles ═══
const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px',
}

const headerRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}
