// =======================================================
// PetPro — AI Usage Widget (v2 with Top-Up Buying)
// =======================================================
// Lives on ShopSettings.jsx in the AI Features section.
//
// Three things in one card:
//   1. Monthly tokens — used / cap, progress bar, reset date
//   2. Extra tokens   — rolling top-up balance (never expires)
//   3. Buy more       — dropdown to grab a top-up pack
//
// Data source: reads directly from groomer_token_balance table
// (the new token system, not the old logAIUsage RPC).
//
// Buy flow: clicking Buy opens the matching Stripe Payment Link
// in a new tab. Webhook adds tokens after Stripe confirms payment.
// (Placeholder URLs until Nicole sets up Stripe Payment Links —
// see the TOPUP_PACKS array below.)
// =======================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── Top-Up Packs ─────────────────────────────────────────────────────────
// REPLACE the empty paymentLink strings with real Stripe Payment Link URLs
// once they're set up in Stripe Dashboard. Each link should have:
//   • client_reference_id passed = the groomer's user ID (for the webhook)
//   • metadata.pack_size matching the tokens count below
// =====================================================================
const TOPUP_PACKS = [
  { tokens: 250,  priceLabel: '$24.99', label: '250 tokens · $24.99',  paymentLink: 'https://buy.stripe.com/dRm14p5N32CKboj6hB7ok05' },
  { tokens: 500,  priceLabel: '$44.99', label: '500 tokens · $44.99 ⭐ best value', paymentLink: 'https://buy.stripe.com/6oUdRb5N3b9g4ZVbBV7ok06' },
  { tokens: 1000, priceLabel: '$84.99', label: '1,000 tokens · $84.99', paymentLink: 'https://buy.stripe.com/00w8wR3EVa5c1NJfSb7ok07' },
]

export default function AIUsageWidget() {
  var [loading, setLoading] = useState(true)
  var [balance, setBalance] = useState(null)
  var [selectedPackIdx, setSelectedPackIdx] = useState(1) // default to "500 best value"
  var [userId, setUserId] = useState(null)

  useEffect(function () {
    loadBalance()
  }, [])

  async function loadBalance() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    var { data } = await supabase
      .from('groomer_token_balance')
      .select('monthly_tokens_remaining, monthly_tokens_total, monthly_period_start, topup_tokens_remaining')
      .eq('groomer_id', user.id)
      .maybeSingle()

    setBalance(data || null)
    setLoading(false)
  }

  function handleBuy() {
    var pack = TOPUP_PACKS[selectedPackIdx]
    if (!pack.paymentLink) {
      alert('Stripe checkout for this pack isn\'t set up yet. Coming very soon!')
      return
    }
    // Append client_reference_id so the webhook knows which groomer to credit
    var url = pack.paymentLink + (pack.paymentLink.includes('?') ? '&' : '?') +
      'client_reference_id=' + encodeURIComponent(userId)
    window.open(url, '_blank')
  }

  // ─── Loading state ─────────────────────────────────────────────────
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

  // ─── Compute display values ────────────────────────────────────────
  var monthlyTotal = balance ? balance.monthly_tokens_total : 500
  var monthlyRemaining = balance ? balance.monthly_tokens_remaining : 500
  var monthlyUsed = Math.max(0, monthlyTotal - monthlyRemaining)
  var topupRemaining = balance ? balance.topup_tokens_remaining : 0

  // Reset date = period_start + 30 days
  var resetLabel = '—'
  if (balance && balance.monthly_period_start) {
    var resetDate = new Date(new Date(balance.monthly_period_start).getTime() + 30 * 24 * 60 * 60 * 1000)
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    resetLabel = months[resetDate.getMonth()] + ' ' + resetDate.getDate()
  }

  // Color scale for the bar based on % used
  var pct = monthlyTotal > 0 ? Math.min(100, Math.round((monthlyUsed / monthlyTotal) * 100)) : 0
  var barColor = '#10b981'
  var textColor = '#047857'
  if (pct >= 90) { barColor = '#ef4444'; textColor = '#b91c1c' }
  else if (pct >= 70) { barColor = '#f59e0b'; textColor = '#b45309' }

  // True out-of-tokens state = monthly empty AND topup empty
  var outOfBoth = monthlyRemaining <= 0 && topupRemaining <= 0

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
        📊 AI Usage This Month
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>
        Resets on <strong style={{ color: '#111827' }}>{resetLabel}</strong>.
      </p>

      {/* ─── Monthly count + progress bar ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827' }}>
          {monthlyUsed.toLocaleString()}
          <span style={{ color: '#9ca3af', fontSize: '15px', fontWeight: '600' }}> / {monthlyTotal.toLocaleString()}</span>
        </div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: textColor }}>
          {pct}%
        </div>
      </div>

      <div style={{ width: '100%', height: '10px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden', marginBottom: '6px' }}>
        <div style={{
          width: pct + '%',
          height: '100%',
          background: barColor,
          transition: 'width 0.3s, background 0.3s'
        }} />
      </div>

      <p style={{ margin: '0 0 16px', fontSize: '11px', color: '#9ca3af' }}>
        AI actions include chat, voice bookings, and AI safety checks.
      </p>

      {/* ─── Extra Tokens (rolling, never expire) ──────────────── */}
      <div style={{
        background: topupRemaining > 0 ? '#f0fdf4' : '#f9fafb',
        border: '1px solid ' + (topupRemaining > 0 ? '#86efac' : '#e5e7eb'),
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            🎁 Extra Tokens (never expire)
          </div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: topupRemaining > 0 ? '#166534' : '#9ca3af' }}>
            {topupRemaining.toLocaleString()}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280', maxWidth: '220px', lineHeight: 1.4, textAlign: 'right' }}>
          Used automatically after your monthly tokens run out. Top-ups roll over forever.
        </div>
      </div>

      {/* ─── Out of both — friendly heads up ────────────────────── */}
      {outOfBoth && (
        <div style={{
          padding: '10px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#b91c1c',
          fontWeight: '600',
          marginBottom: '16px',
          lineHeight: 1.5,
        }}>
          🐶 Oh no, we were on a roll! You're out of tokens. Grab a top-up pack below to keep PetPro AI working.
        </div>
      )}

      {/* ─── Buy More Tokens ────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
          ➕ Add More Tokens
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={selectedPackIdx}
            onChange={(e) => setSelectedPackIdx(parseInt(e.target.value))}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {TOPUP_PACKS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBuy}
            style={{
              padding: '10px 24px',
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(124,58,237,0.25)',
            }}
          >
            Buy
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
          One-time charge. Tokens added instantly to your Extra balance. Never expire.
        </p>
      </div>
    </div>
  )
}
