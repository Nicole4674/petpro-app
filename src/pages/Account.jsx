// ====================================================================
// PetPro — Account & Billing Page
// ====================================================================
// Shows the logged-in groomer their current subscription plan, billing
// period / trial end, and gives them buttons to:
//   • Manage Subscription (opens Stripe Customer Portal in a new tab)
//   • Change Plan         (routes to /plans)
//   • Contact Support     (mailto nicole@trypetpro.com)
//
// Data source: `groomers` table (subscription_tier, subscription_status,
// current_period_end, trial_ends_at, stripe_customer_id).
//
// Stripe Portal: we use Stripe's no-code "Login link" which authenticates
// the customer by email (magic link). No edge function needed.
//
// NOTE: The STRIPE_PORTAL_URL below is the LIVE-mode login link, set up
//       ahead of launch so it doesn't need to change on go-live day.
//       Customers in Test mode will see a "no subscriptions found" message
//       when they try to log in — that's expected during testing.
// ====================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import AIUsageWidget from '../components/AIUsageWidget'
import SMSBalanceWidget from '../components/SMSBalanceWidget'

// ── Stripe Customer Portal login link (LIVE mode) ──────────────────
// Already configured for production — no change needed on launch day.
var STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/9B614pdfv1yGcsn6hB7ok00'

// ── Tier display data ──────────────────────────────────────────────
var TIER_INFO = {
  basic:    { name: 'Basic',    price: 70,  emoji: '🐾' },
  pro:      { name: 'Pro',      price: 129, emoji: '🐾' },
  pro_plus: { name: 'Pro+',     price: 199, emoji: '🤖' },
  growing:  { name: 'Growing',  price: 399, emoji: '🔥' },
  enterprise: { name: 'Enterprise', price: null, emoji: '🏢' },
}

// ── Status badge styling ───────────────────────────────────────────
var STATUS_STYLE = {
  trialing:           { bg: '#dbeafe', color: '#1e40af', label: 'Free Trial' },
  active:             { bg: '#dcfce7', color: '#166534', label: 'Active' },
  past_due:           { bg: '#fee2e2', color: '#991b1b', label: 'Past Due' },
  canceled:           { bg: '#f3f4f6', color: '#4b5563', label: 'Canceled' },
  unpaid:             { bg: '#fee2e2', color: '#991b1b', label: 'Unpaid' },
  incomplete:         { bg: '#fef3c7', color: '#92400e', label: 'Incomplete' },
  incomplete_expired: { bg: '#f3f4f6', color: '#4b5563', label: 'Expired' },
}

export default function Account() {
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [groomer, setGroomer] = useState(null)

  // ── Danger Zone state ──
  // Two-step delete: open the confirm panel, then type DELETE exactly.
  var [deleteOpen, setDeleteOpen] = useState(false)
  var [deleteText, setDeleteText] = useState('')
  var [deleteBusy, setDeleteBusy] = useState(false)
  var [deleteError, setDeleteError] = useState('')

  useEffect(function () {
    loadAccount()
  }, [])

  async function loadAccount() {
    setLoading(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }

      var { data, error: gErr } = await supabase
        .from('groomers')
        .select('id, email, full_name, subscription_tier, subscription_status, stripe_customer_id, trial_ends_at, current_period_end')
        .eq('id', user.id)
        .single()

      if (gErr) throw gErr
      setGroomer(data)
    } catch (e) {
      console.error('[Account] load error:', e)
      setError(e.message || 'Could not load your account details.')
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function daysUntil(iso) {
    if (!iso) return null
    var ms = new Date(iso).getTime() - Date.now()
    var days = Math.ceil(ms / 86400000)
    return days
  }

  function handleManage() {
    window.open(STRIPE_PORTAL_URL, '_blank', 'noopener,noreferrer')
  }

  // ── Permanently delete the account ──
  // Calls the delete-account edge function: cancels the Stripe subscription,
  // wipes all shop data (clients, pets, appointments, everything), removes
  // client/staff logins, then deletes this login. There is no undo.
  async function handleDeleteAccount() {
    if (deleteText !== 'DELETE') {
      setDeleteError('Type DELETE (all caps) to confirm.')
      return
    }
    setDeleteBusy(true)
    setDeleteError('')
    try {
      var { data, error: fnErr } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
      })
      if (fnErr) throw new Error(fnErr.message || 'Delete failed')
      if (data && data.error) throw new Error(data.error)
      // Account is gone — sign out locally and leave
      await supabase.auth.signOut()
      alert('Your account and all data have been deleted. We\'re sorry to see you go. 🐾')
      window.location.href = '/login'
    } catch (e) {
      console.error('[Account] delete error:', e)
      setDeleteError(e.message || 'Something went wrong — your account was NOT deleted. Email nicole@trypetpro.com for help.')
      setDeleteBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  var hasSubscription = groomer && groomer.subscription_tier && groomer.subscription_status !== 'canceled'
  var tierInfo = groomer && groomer.subscription_tier ? TIER_INFO[groomer.subscription_tier] : null
  var statusStyle = groomer && groomer.subscription_status ? STATUS_STYLE[groomer.subscription_status] : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '32px 24px', maxWidth: '820px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#111827' }}>
            Account &amp; Billing
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Manage your subscription, payment method, and plan.
          </p>
        </div>

        {loading && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '32px', textAlign: 'center', color: '#6b7280' }}>
            Loading your account…
          </div>
        )}

        {!loading && error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {!loading && groomer && (
          <>
            {/* ═══════════ CURRENT PLAN CARD ═══════════ */}
            <div style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{
                textTransform: 'uppercase',
                fontSize: '11px',
                fontWeight: 700,
                color: '#9ca3af',
                letterSpacing: '0.5px',
                marginBottom: '12px'
              }}>
                Current Plan
              </div>

              {hasSubscription && tierInfo ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <span style={{ fontSize: '28px' }}>{tierInfo.emoji}</span>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>
                      {tierInfo.name}
                    </span>
                    {tierInfo.price !== null && (
                      <span style={{ fontSize: '16px', color: '#6b7280', fontWeight: 600 }}>
                        ${tierInfo.price}/month
                      </span>
                    )}
                    {statusStyle && (
                      <span style={{
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px'
                      }}>
                        {statusStyle.label}
                      </span>
                    )}
                  </div>

                  {/* Trial or billing period line */}
                  {groomer.subscription_status === 'trialing' && groomer.trial_ends_at && (() => {
                    var d = daysUntil(groomer.trial_ends_at)
                    return (
                      <div style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#1e40af',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        marginBottom: '16px'
                      }}>
                        🎁 <strong>{d > 0 ? d + ' days left' : 'Trial ending today'}</strong> in your free trial. First charge on <strong>{formatDate(groomer.trial_ends_at)}</strong>.
                      </div>
                    )
                  })()}

                  {groomer.subscription_status === 'active' && groomer.current_period_end && (
                    <div style={{ color: '#4b5563', fontSize: '14px', marginBottom: '16px' }}>
                      Next billing date: <strong>{formatDate(groomer.current_period_end)}</strong>
                    </div>
                  )}

                  {groomer.subscription_status === 'past_due' && (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      marginBottom: '16px'
                    }}>
                      ⚠️ Your last payment failed. Click <strong>Manage Subscription</strong> below to update your card so you don't lose access.
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={handleManage}
                      style={{
                        padding: '11px 20px',
                        background: '#7c3aed',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(124,58,237,0.25)'
                      }}
                    >
                      💳 Manage Subscription
                    </button>
                    <button
                      type="button"
                      onClick={function () { navigate('/plans') }}
                      style={{
                        padding: '11px 20px',
                        background: '#fff',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      Change Plan
                    </button>
                  </div>

                  <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '14px', marginBottom: 0, lineHeight: '1.5' }}>
                    Clicking <strong>Manage Subscription</strong> opens Stripe's secure portal where you can update your card, download invoices, or cancel anytime. You'll enter your email and Stripe will send you a one-time login link.
                  </p>
                </>
              ) : (
                /* ═══════════ NO SUBSCRIPTION — CTA ═══════════ */
                <>
                  <div style={{ fontSize: '16px', color: '#4b5563', marginBottom: '16px', lineHeight: '1.6' }}>
                    You don't have an active subscription yet. Start your free trial to unlock all PetPro features.
                  </div>
                  <button
                    type="button"
                    onClick={function () { navigate('/plans') }}
                    style={{
                      padding: '12px 24px',
                      background: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.25)'
                    }}
                  >
                    Choose a Plan →
                  </button>
                </>
              )}
            </div>

            {/* ═══════════ AI USAGE ═══════════ */}
            {hasSubscription && (
              <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  textTransform: 'uppercase',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#9ca3af',
                  letterSpacing: '0.5px',
                  marginBottom: '12px'
                }}>
                  Usage This Month
                </div>
                <AIUsageWidget />
                <SMSBalanceWidget />
              </div>
            )}

            {/* ═══════════ HELP / SUPPORT ═══════════ */}
            <div style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{
                textTransform: 'uppercase',
                fontSize: '11px',
                fontWeight: 700,
                color: '#9ca3af',
                letterSpacing: '0.5px',
                marginBottom: '12px'
              }}>
                Need Help?
              </div>
              <div style={{ color: '#4b5563', fontSize: '14px', lineHeight: '1.6', marginBottom: '12px' }}>
                Billing question or having trouble with your subscription? Email us and we'll respond within 24 hours.
              </div>
              <a
                href="mailto:nicole@trypetpro.com?subject=PetPro%20Billing%20Question"
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '14px',
                  textDecoration: 'none'
                }}
              >
                ✉️ nicole@trypetpro.com
              </a>
            </div>

            {/* ═══════════ DANGER ZONE — delete account ═══════════ */}
            {/* Also satisfies Google Play's account-deletion requirement — */}
            {/* the Play Data Safety form links to this page. */}
            <div style={{
              background: '#fff',
              border: '1px solid #fecaca',
              borderRadius: '16px',
              padding: '24px',
              marginTop: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{
                textTransform: 'uppercase',
                fontSize: '11px',
                fontWeight: 700,
                color: '#dc2626',
                letterSpacing: '0.5px',
                marginBottom: '12px'
              }}>
                ⚠️ Danger Zone
              </div>

              {!deleteOpen ? (
                <>
                  <div style={{ color: '#4b5563', fontSize: '14px', lineHeight: '1.6', marginBottom: '12px' }}>
                    Permanently delete your PetPro account. This cancels your subscription and erases your entire shop — clients, pets, appointments, messages, everything. <strong>This cannot be undone.</strong>
                  </div>
                  <button
                    type="button"
                    onClick={function () { setDeleteOpen(true); setDeleteText(''); setDeleteError('') }}
                    style={{
                      padding: '10px 18px',
                      background: '#fff',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      borderRadius: '10px',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete my account…
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    marginBottom: '14px'
                  }}>
                    <strong>Last warning.</strong> Deleting your account will immediately:
                    cancel your subscription (no further charges), erase all clients, pets,
                    appointments, boarding records, messages, punch cards, and staff accounts,
                    and remove your clients' portal logins. <strong>Nothing can be recovered afterward.</strong>
                    <br /><br />
                    If you're just unhappy with something, email nicole@trypetpro.com first — we read everything.
                  </div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                    Type <span style={{ fontFamily: 'monospace', color: '#dc2626' }}>DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteText}
                    onChange={function (e) { setDeleteText(e.target.value) }}
                    placeholder="DELETE"
                    autoComplete="off"
                    style={{
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      width: '200px',
                      marginBottom: '12px',
                      display: 'block'
                    }}
                  />
                  {deleteError && (
                    <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '10px' }}>{deleteError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={deleteBusy || deleteText !== 'DELETE'}
                      onClick={handleDeleteAccount}
                      style={{
                        padding: '10px 18px',
                        background: deleteText === 'DELETE' && !deleteBusy ? '#dc2626' : '#fca5a5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: deleteText === 'DELETE' && !deleteBusy ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {deleteBusy ? 'Deleting everything…' : 'Permanently delete my account'}
                    </button>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={function () { setDeleteOpen(false); setDeleteText(''); setDeleteError('') }}
                      style={{
                        padding: '10px 18px',
                        background: '#fff',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      Never mind — keep my account
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
