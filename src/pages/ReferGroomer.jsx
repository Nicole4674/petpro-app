// =======================================================
// ReferGroomer — "Refer a Groomer, you both save 30%"
// URL: /refer
// Shows the groomer their PetPro referral code + share link, their 1/1
// monthly referral credit, and who they've referred so far.
// Data comes from the get-referral-code edge function.
//
// NOTE: this is the FRONT of the feature. The 30%-off reward is applied
// later by the Stripe billing step (separate build).
// =======================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ReferGroomer() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null) // { code, credit_available, used_this_month, referrals }
  const [copied, setCopied] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke('get-referral-code', {})
      if (invokeErr) throw invokeErr
      if (res?.error) throw new Error(res.error)
      setData(res)
    } catch (err) {
      setError(err.message || 'Could not load your referral code.')
    } finally {
      setLoading(false)
    }
  }

  const link = data ? `${window.location.origin}/signup?ref=${data.code}` : ''

  function copy(text, which) {
    try {
      navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 2000)
    } catch (e) { /* ignore */ }
  }

  function fmtDate(s) {
    if (!s) return ''
    try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch (e) { return '' }
  }

  const STATUS_LABEL = {
    pending_signup: { text: 'Invited', color: '#92400e', bg: '#fffbeb' },
    signed_up: { text: 'Signed up', color: '#1e40af', bg: '#eff6ff' },
    rewarded: { text: 'Rewarded — 30% applied', color: '#065f46', bg: '#ecfdf5' },
    expired: { text: 'Expired', color: '#6b7280', bg: '#f3f4f6' },
    void: { text: 'Void', color: '#6b7280', bg: '#f3f4f6' },
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '720px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', color: '#fff', padding: '28px', borderRadius: '16px', marginBottom: '24px' }}>
        <div style={{ fontSize: '32px', marginBottom: '6px' }}>🎁</div>
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 800 }}>Refer a groomer — you both save 30%</h1>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.92, lineHeight: 1.5 }}>
          Know another groomer who'd love PetPro? Share your link. When they sign up and pay their
          first bill, you <strong>both get 30% off</strong> that month. You get <strong>1 referral a month</strong> —
          it refills automatically, so you can save again next month.
        </p>
      </div>

      {loading && <div style={{ padding: '20px', color: '#6b7280' }}>Loading your referral code…</div>}

      {error && !loading && (
        <div style={{ padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Monthly credit meter */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 18px', marginBottom: '20px', borderRadius: '12px',
            background: data.credit_available ? '#ecfdf5' : '#f3f4f6',
            border: '1px solid ' + (data.credit_available ? '#86efac' : '#e5e7eb'),
          }}>
            <span style={{ fontSize: '22px' }}>{data.credit_available ? '🎟️' : '⏳'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: data.credit_available ? '#065f46' : '#374151' }}>
                This month: {data.credit_available ? '1 / 1' : '0 / 1'} referral credit
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {data.credit_available
                  ? 'Ready to use — refer a groomer and you both save 30%.'
                  : 'Used this month. Your credit refills at the start of next month.'}
              </div>
            </div>
          </div>

          {/* Code + link */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', marginBottom: '20px', background: '#fff' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Your referral code
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <code style={{ fontSize: '22px', fontWeight: 800, color: '#5b21b6', letterSpacing: '1px' }}>{data.code}</code>
              <button onClick={() => copy(data.code, 'code')} style={btnSecondary}>
                {copied === 'code' ? '✓ Copied' : 'Copy code'}
              </button>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Your share link
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input readOnly value={link} onFocus={(e) => e.target.select()}
                style={{ flex: 1, minWidth: '220px', padding: '10px 12px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '8px', color: '#374151', background: '#f9fafb' }} />
              <button onClick={() => copy(link, 'link')} style={btnPrimary}>
                {copied === 'link' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px', lineHeight: 1.5 }}>
              Text or email this link to another groomer. When they sign up through it and pay their first
              PetPro bill, the 30% discount applies to both of you automatically.
            </div>
          </div>

          {/* Referral history */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', background: '#fff' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1f2937', marginBottom: '12px' }}>
              Your referrals
            </div>
            {(!data.referrals || data.referrals.length === 0) ? (
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                No referrals yet. Share your link above to get started! 🦦
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.referrals.map((r) => {
                  const s = STATUS_LABEL[r.status] || STATUS_LABEL.pending_signup
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', border: '1px solid #f3f4f6', borderRadius: '8px' }}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>{fmtDate(r.created_at)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: s.color, background: s.bg, padding: '3px 10px', borderRadius: '10px' }}>
                        {s.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const btnPrimary = {
  padding: '10px 16px', background: '#7c3aed', color: '#fff', border: 'none',
  borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnSecondary = {
  padding: '10px 16px', background: '#fff', color: '#5b21b6', border: '1px solid #c4b5fd',
  borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
