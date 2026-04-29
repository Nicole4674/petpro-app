// =============================================================================
// ClientPortalCards.jsx — "My Cards" page in the client portal
// =============================================================================
// Lets a logged-in client view, add, and remove saved cards. Cards are saved
// on the groomer's Stripe Connect account using a SetupIntent flow:
//
//   1. Page loads → calls stripe-list-cards → shows existing saved cards
//   2. Click "Add Card" → calls stripe-setup-intent → gets a client_secret
//      and the groomer's Stripe account ID
//   3. We initialize Stripe.js with the connected account context
//   4. <Elements> wraps a <PaymentElement> for secure card entry
//   5. On submit, stripe.confirmSetup() saves the card → list refreshes
//   6. Click "Remove" on a card → calls stripe-delete-card → list refreshes
//
// All card data lives on Stripe — never in our DB. We only store the
// stripe_customer_id on the clients row.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

export default function ClientPortalCards() {
  const navigate = useNavigate()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Setup intent state — populated when user clicks "Add Card"
  const [setupData, setSetupData] = useState(null) // { client_secret, customer_id, stripe_account_id }
  const [creatingIntent, setCreatingIntent] = useState(false)

  // Memoize the Stripe instance so it doesn't reload on every render. It
  // depends on the connected account ID, which we don't know until the
  // SetupIntent comes back.
  const stripePromise = useMemo(() => {
    if (!setupData?.stripe_account_id) return null
    return loadStripe(PUBLISHABLE_KEY, {
      stripeAccount: setupData.stripe_account_id
    })
  }, [setupData?.stripe_account_id])

  useEffect(() => {
    loadCards()
  }, [])

  async function loadCards() {
    setLoading(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-list-cards', {})
      if (invokeError) throw invokeError
      setCards((data && data.cards) || [])
    } catch (err) {
      console.error('Could not load cards:', err)
      setError('Could not load your saved cards: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function handleStartAddCard() {
    setCreatingIntent(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-setup-intent', {})
      if (invokeError) throw invokeError
      if (!data || !data.client_secret) {
        throw new Error(data?.error || 'No client secret returned')
      }
      setSetupData(data)
    } catch (err) {
      console.error('Could not start add card:', err)
      setError('Could not start the Add Card flow: ' + (err.message || err))
    } finally {
      setCreatingIntent(false)
    }
  }

  async function handleRemoveCard(paymentMethodId) {
    if (!confirm('Remove this card from your saved payment methods?')) return
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-delete-card', {
        body: { payment_method_id: paymentMethodId }
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      // Refresh the list to reflect the removal
      await loadCards()
    } catch (err) {
      alert('Could not remove card: ' + (err.message || err))
    }
  }

  function handleAddCardSuccess() {
    setSetupData(null)
    loadCards()
  }

  function handleAddCardCancel() {
    setSetupData(null)
  }

  return (
    <div style={pageStyles.container}>
      {/* Header */}
      <div style={pageStyles.header}>
        <button onClick={() => navigate('/portal')} style={pageStyles.backBtn}>
          ← Back
        </button>
        <h1 style={pageStyles.title}>💳 My Cards</h1>
      </div>

      <div style={pageStyles.body}>
        <p style={pageStyles.intro}>
          Save a card to make paying for appointments faster. Your card is stored securely with Stripe — we never see or store your card number.
        </p>

        {error && (
          <div style={pageStyles.errorBox}>{error}</div>
        )}

        {/* Add Card form (Stripe Elements) — shows when setupData exists */}
        {setupData && stripePromise && (
          <div style={pageStyles.addCardCard}>
            <h2 style={pageStyles.sectionTitle}>Add a New Card</h2>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: setupData.client_secret,
                appearance: { theme: 'stripe' }
              }}
            >
              <AddCardForm onSuccess={handleAddCardSuccess} onCancel={handleAddCardCancel} />
            </Elements>
          </div>
        )}

        {/* Card list */}
        {loading ? (
          <div style={pageStyles.loading}>Loading your cards...</div>
        ) : (
          <>
            {cards.length === 0 && !setupData && (
              <div style={pageStyles.emptyState}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>💳</div>
                <div style={pageStyles.emptyText}>No cards saved yet.</div>
              </div>
            )}

            {cards.length > 0 && (
              <div style={pageStyles.cardList}>
                {cards.map(card => (
                  <CardRow key={card.id} card={card} onRemove={handleRemoveCard} />
                ))}
              </div>
            )}

            {/* Add Card button — only show when not currently adding */}
            {!setupData && (
              <button
                onClick={handleStartAddCard}
                disabled={creatingIntent}
                style={{
                  ...pageStyles.addBtn,
                  background: creatingIntent ? '#a78bfa' : '#7c3aed',
                  cursor: creatingIntent ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingIntent ? 'Loading...' : '+ Add a New Card'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Inner form that uses Stripe hooks ──────────────────────────────────
// Must be rendered inside <Elements> so the hooks work.
function AddCardForm({ onSuccess, onCancel }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setErrMsg('')
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          // No redirect URL because we want it to stay on this page.
          // 'if_required' lets Stripe redirect ONLY if 3DS or similar is needed.
          return_url: window.location.origin + '/portal/cards',
        },
        redirect: 'if_required',
      })
      if (error) {
        setErrMsg(error.message || 'Could not save card')
      } else {
        onSuccess()
      }
    } catch (err) {
      setErrMsg(err.message || 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errMsg && (
        <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
          {errMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button type="button" onClick={onCancel} disabled={submitting}
          style={{ flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={!stripe || submitting}
          style={{ flex: 2, padding: '12px', background: submitting ? '#9ca3af' : '#10b981', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Saving card...' : '💾 Save Card'}
        </button>
      </div>
    </form>
  )
}

// ─── Single card row in the list ────────────────────────────────────────
function CardRow({ card, onRemove }) {
  const brand = (card.brand || 'card').toLowerCase()
  const brandIcon = brand === 'visa' ? '💳' : brand === 'mastercard' ? '💳' : brand === 'amex' ? '💳' : '💳'
  const brandLabel = brand.charAt(0).toUpperCase() + brand.slice(1)
  const expStr = card.exp_month && card.exp_year
    ? String(card.exp_month).padStart(2, '0') + '/' + String(card.exp_year).slice(-2)
    : ''

  return (
    <div style={pageStyles.cardRow}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '20px' }}>{brandIcon}</span>
          <span style={{ fontWeight: 700, fontSize: '15px' }}>{brandLabel} •••• {card.last4}</span>
          {card.is_default && (
            <span style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
              Default
            </span>
          )}
        </div>
        {expStr && (
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Expires {expStr}</div>
        )}
      </div>
      <button onClick={() => onRemove(card.id)} style={pageStyles.removeBtn}>
        Remove
      </button>
    </div>
  )
}

// ─── Styles (inline so this file is self-contained) ─────────────────────
const pageStyles = {
  container: { maxWidth: '720px', margin: '0 auto', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' },
  backBtn: { padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#374151', cursor: 'pointer' },
  title: { margin: 0, fontSize: '24px', fontWeight: 800, color: '#1f2937' },
  body: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px' },
  intro: { fontSize: '14px', color: '#6b7280', lineHeight: 1.6, marginTop: 0, marginBottom: '20px' },
  errorBox: { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b', marginBottom: '16px' },
  loading: { textAlign: 'center', padding: '30px', color: '#6b7280' },
  emptyState: { textAlign: 'center', padding: '30px', color: '#6b7280' },
  emptyText: { fontSize: '14px' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' },
  cardRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px' },
  removeBtn: { padding: '8px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  addBtn: { width: '100%', padding: '14px', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, marginTop: '8px' },
  addCardCard: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  sectionTitle: { margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#1f2937' },
}
