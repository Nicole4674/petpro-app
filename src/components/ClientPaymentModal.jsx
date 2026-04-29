// =============================================================================
// ClientPaymentModal.jsx — pay an appointment from the client portal
// =============================================================================
// Renders a modal that lets a logged-in client pay for one of their
// appointments with a saved card. Flow:
//
//   1. Modal opens with appointment + balance info passed in via props
//   2. We call stripe-list-cards to load the client's saved cards
//   3. Client picks tip % (10/15/25/Custom) and a saved card
//   4. Click "Pay" → calls stripe-charge-card edge function
//   5. On success → onSuccess() callback closes the modal and refreshes
//
// If the client has no saved cards, we show a "Add a card first" message
// pointing them to /portal/cards. (Phase 3 v2 will let them pay with a
// brand-new card without saving — for now, save first, pay second.)
// =============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Accepts either an `appointment` or a `boardingReservation`. Internally it
// figures out which kind of charge it is and calls the matching edge function.
// This way the same modal/UI works for both grooming + boarding payments.
export default function ClientPaymentModal({ appointment, boardingReservation, balance, onClose, onSuccess }) {
  // Pick whichever item was passed in. UI strings adapt to "Appointment" vs "Boarding Stay".
  const isBoarding = !!boardingReservation
  const item = appointment || boardingReservation
  const headerLabel = isBoarding ? 'Pay for Boarding Stay' : 'Pay for Appointment'
  const [cards, setCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [tipPercent, setTipPercent] = useState(0)        // 0 / 10 / 15 / 25 / 'custom'
  const [customTip, setCustomTip] = useState('')         // dollar amount
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCards()
  }, [])

  async function loadCards() {
    setLoadingCards(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-list-cards', {})
      if (invokeError) throw invokeError
      const list = (data && data.cards) || []
      setCards(list)
      // Auto-select the default card, or the first card if none default
      const def = list.find(c => c.is_default) || list[0]
      if (def) setSelectedCardId(def.id)
    } catch (err) {
      setError('Could not load your saved cards: ' + (err.message || err))
    } finally {
      setLoadingCards(false)
    }
  }

  // Compute the actual tip dollar amount based on the selector
  function computeTipDollars() {
    if (tipPercent === 'custom') {
      return parseFloat(customTip) || 0
    }
    if (tipPercent > 0) {
      return Math.round(balance * (tipPercent / 100) * 100) / 100
    }
    return 0
  }

  const tipDollars = computeTipDollars()
  const grandTotal = balance + tipDollars

  async function handlePay() {
    setError('')
    if (!selectedCardId) {
      setError('Please select a card to pay with.')
      return
    }
    setPaying(true)
    try {
      // Branch: boarding goes to stripe-charge-boarding with boarding_reservation_id;
      // grooming goes to stripe-charge-card with appointment_id.
      const fnName = isBoarding ? 'stripe-charge-boarding' : 'stripe-charge-card'
      const payload = isBoarding
        ? {
            boarding_reservation_id: item.id,
            payment_method_id: selectedCardId,
            tip_amount: tipDollars,
          }
        : {
            appointment_id: item.id,
            payment_method_id: selectedCardId,
            tip_amount: tipDollars,
          }
      const { data, error: invokeError } = await supabase.functions.invoke(fnName, {
        body: payload
      })
      // Extract the real error message from non-2xx responses. Supabase-js
      // wraps the actual function error inside invokeError.context, which is
      // a Response object we can read.
      if (invokeError) {
        let realMsg = invokeError.message || 'Could not process payment'
        try {
          if (invokeError.context && typeof invokeError.context.json === 'function') {
            const body = await invokeError.context.json()
            if (body && body.error) realMsg = body.error
          }
        } catch { /* ignore parse errors, fall back to wrapper message */ }
        throw new Error(realMsg)
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.success) throw new Error('Payment did not succeed — please try a different card')
      onSuccess(data)
    } catch (err) {
      console.error('Payment error:', err)
      setError(err.message || 'Could not process payment')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={() => !paying && onClose()}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>💳 {headerLabel}</h2>
          <button onClick={onClose} disabled={paying} style={styles.closeBtn}>✕</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Summary — show service total only when explicitly set on the
              appointment (newer multi-pet bookings); for legacy single-service
              appointments we just show the balance. */}
          <div style={styles.summary}>
            {parseFloat(item.total_price) > 0 && (
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>{isBoarding ? 'Stay Total' : 'Service Total'}</span>
                <span style={styles.summaryValue}>${parseFloat(item.total_price).toFixed(2)}</span>
              </div>
            )}
            <div style={styles.summaryRow}>
              <span style={styles.summaryLabel}>Balance Due</span>
              <span style={{ ...styles.summaryValue, color: '#dc2626', fontWeight: 700 }}>${balance.toFixed(2)}</span>
            </div>
          </div>

          {/* Tip selector */}
          <div style={{ marginBottom: '20px' }}>
            <label style={styles.sectionLabel}>Add a Tip (optional)</label>
            <div style={styles.tipBtns}>
              {[0, 10, 15, 25].map(pct => (
                <button
                  key={pct}
                  onClick={() => { setTipPercent(pct); setCustomTip('') }}
                  style={{
                    ...styles.tipBtn,
                    background: tipPercent === pct ? '#7c3aed' : '#fff',
                    color: tipPercent === pct ? '#fff' : '#374151',
                    borderColor: tipPercent === pct ? '#7c3aed' : '#d1d5db',
                  }}
                >
                  {pct === 0 ? 'No Tip' : `${pct}%`}
                </button>
              ))}
              <button
                onClick={() => setTipPercent('custom')}
                style={{
                  ...styles.tipBtn,
                  background: tipPercent === 'custom' ? '#7c3aed' : '#fff',
                  color: tipPercent === 'custom' ? '#fff' : '#374151',
                  borderColor: tipPercent === 'custom' ? '#7c3aed' : '#d1d5db',
                }}
              >
                Custom
              </button>
            </div>
            {tipPercent === 'custom' && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={customTip}
                onChange={e => setCustomTip(e.target.value)}
                placeholder="Tip amount in $"
                style={styles.customTipInput}
              />
            )}
            {tipDollars > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                Tip: ${tipDollars.toFixed(2)}
              </div>
            )}
          </div>

          {/* Card selector */}
          <div style={{ marginBottom: '20px' }}>
            <label style={styles.sectionLabel}>Pay With</label>
            {loadingCards ? (
              <div style={{ padding: '14px', color: '#6b7280', fontSize: '14px' }}>Loading your saved cards...</div>
            ) : cards.length === 0 ? (
              <div style={styles.noCardsBox}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>💳 No saved cards yet</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>
                  Add a card first so you can pay with one click.
                </div>
                <a href="/portal/cards" style={styles.addCardLink}>+ Add a Card</a>
              </div>
            ) : (
              <div style={styles.cardList}>
                {cards.map(card => (
                  <label key={card.id} style={{
                    ...styles.cardOption,
                    borderColor: selectedCardId === card.id ? '#7c3aed' : '#e5e7eb',
                    background: selectedCardId === card.id ? '#f5f3ff' : '#fff',
                  }}>
                    <input
                      type="radio"
                      name="card"
                      checked={selectedCardId === card.id}
                      onChange={() => setSelectedCardId(card.id)}
                      style={{ marginRight: '10px' }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>
                        {(card.brand || 'Card').charAt(0).toUpperCase() + (card.brand || '').slice(1)} •••• {card.last4}
                      </span>
                      {card.is_default && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '10px' }}>
                          Default
                        </span>
                      )}
                    </span>
                    {card.exp_month && card.exp_year && (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}

          {/* Total + Pay */}
          <div style={styles.totalBox}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>Total Charge</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937' }}>${grandTotal.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} disabled={paying} style={styles.cancelBtn}>
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={paying || !selectedCardId || cards.length === 0}
              style={{
                ...styles.payBtn,
                background: (paying || !selectedCardId || cards.length === 0) ? '#9ca3af' : '#10b981',
                cursor: (paying || !selectedCardId || cards.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {paying ? 'Processing...' : `Pay $${grandTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modal: { background: '#fff', borderRadius: '14px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' },
  title: { margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937' },
  closeBtn: { background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', width: '32px', height: '32px', fontSize: '16px', color: '#6b7280', cursor: 'pointer' },
  body: { padding: '20px' },
  summary: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '20px' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' },
  summaryLabel: { fontSize: '14px', color: '#6b7280' },
  summaryValue: { fontSize: '14px', color: '#1f2937', fontWeight: 600 },
  sectionLabel: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tipBtns: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  tipBtn: { flex: 1, minWidth: '60px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  customTipInput: { width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', marginTop: '10px' },
  noCardsBox: { padding: '16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', textAlign: 'center' },
  addCardLink: { display: 'inline-block', padding: '8px 16px', background: '#7c3aed', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 700, textDecoration: 'none' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  cardOption: { display: 'flex', alignItems: 'center', padding: '12px 14px', border: '2px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' },
  errorBox: { padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b', marginBottom: '14px' },
  totalBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', marginBottom: '14px' },
  cancelBtn: { flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' },
  payBtn: { flex: 2, padding: '12px', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px' },
}
