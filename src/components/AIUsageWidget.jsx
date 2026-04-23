// =======================================================
// PetPro — AI Usage Widget
// Shows the groomer how close they are to their monthly AI cap.
// Lives on ShopSettings.jsx (below the AI Features toggles).
//
// Data source: checkAICap() from lib/aiUsage.js (reads RPC
// get_ai_usage_status on Supabase).
//
// Behavior:
//   - Green bar under 70% used
//   - Yellow bar 70–89% used
//   - Red bar 90%+ used (or over cap)
//   - "Upgrade plan" button shows at 80%+ usage
//   - Reset date = first day of next month
//   - Silent on errors (just shows dashes so settings page
//     never breaks because of a usage fetch hiccup)
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkAICap } from '../lib/aiUsage'

export default function AIUsageWidget() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [status, setStatus] = useState(null)

  useEffect(function () {
    loadStatus()
  }, [])

  async function loadStatus() {
    setLoading(true)
    var result = await checkAICap()
    setStatus(result)
    setLoading(false)
  }

  // First day of next month, formatted as "May 1"
  function resetLabel() {
    var now = new Date()
    var next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months[next.getMonth()] + ' ' + next.getDate()
  }

  // Pretty tier name
  function tierLabel(tier) {
    if (!tier) return '—'
    if (tier === 'basic') return 'Basic'
    if (tier === 'pro') return 'Pro'
    if (tier === 'pro_plus') return 'Pro+'
    if (tier === 'growing') return 'Growing'
    if (tier === 'unknown') return '—'
    // Fallback: capitalize first letter
    return tier.charAt(0).toUpperCase() + tier.slice(1)
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
          📊 AI Usage This Month
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      </div>
    )
  }

  // Safe defaults if status is null
  var tier = status ? status.tier : null
  var used = status ? status.used : 0
  var cap = status ? status.cap : 0
  var pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  // Color scale
  var barColor = '#10b981'      // green (default)
  var textColor = '#047857'
  if (pct >= 90) { barColor = '#ef4444'; textColor = '#b91c1c' }       // red
  else if (pct >= 70) { barColor = '#f59e0b'; textColor = '#b45309' }  // yellow

  var showUpgrade = pct >= 80
  var overCap = !!(status && status.allowed === false)

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
      <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
        📊 AI Usage This Month
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>
        Your plan: <strong style={{ color: '#111827' }}>{tierLabel(tier)}</strong> — resets {resetLabel()}.
      </p>

      {/* Count line */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>
          {used.toLocaleString()} <span style={{ color: '#9ca3af', fontSize: '15px', fontWeight: '600' }}>/ {cap.toLocaleString()}</span>
        </div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: textColor }}>
          {pct}%
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', height: '10px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{
          width: pct + '%',
          height: '100%',
          background: barColor,
          transition: 'width 0.3s, background 0.3s'
        }} />
      </div>

      <p style={{ margin: '0', fontSize: '12px', color: '#6b7280' }}>
        AI actions include chat, voice bookings, and AI safety checks.
      </p>

      {/* Over-cap banner */}
      {overCap && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#b91c1c', fontWeight: '600' }}>
          Monthly AI limit reached. Upgrade to keep using AI features this month.
        </div>
      )}

      {/* Upgrade CTA at 80%+ */}
      {showUpgrade && (
        <button
          type="button"
          onClick={function () { navigate('/plans') }}
          style={{
            marginTop: '14px',
            padding: '10px 18px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          Upgrade plan →
        </button>
      )}
    </div>
  )
}
