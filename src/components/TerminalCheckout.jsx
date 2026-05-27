// =============================================================================
// TerminalCheckout.jsx — Stripe Terminal tap-to-pay flow (Phase 5)
// =============================================================================
// Drop-in modal that runs the full Stripe Terminal lifecycle:
//   1. Initialize Terminal SDK with a connection token (from our edge function)
//   2. Discover available readers (real + simulator)
//   3. Let user pick + connect to a reader
//   4. Create a PaymentIntent for the sale (via edge function)
//   5. Collect payment (customer taps/inserts/swipes card on reader)
//   6. Process the payment (capture)
//   7. Bubble success up to the parent with the PaymentIntent ID
//
// Usage:
//   <TerminalCheckout
//     open={showTerminal}
//     amountCents={totalInCents}
//     description="Mrs. Smith — pickup retail + groom"
//     metadata={{ sale_id: x, appointment_id: y }}
//     onSuccess={(paymentIntentId) => { … mark sale paid …; close }}
//     onCancel={() => { close }}
//   />
//
// Required env:
//   - npm install @stripe/terminal-js   (added to package.json)
//   - VITE_USE_TERMINAL_SIMULATOR=true to discover Stripe's free simulator
//     (set in dev, NOT in prod — though enabling in prod is harmless, the
//     simulator never sees real cards)
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Lazy load the Terminal SDK so the rest of the app doesn't ship it
let terminalSdkPromise = null
function loadTerminalSdk() {
  if (!terminalSdkPromise) {
    terminalSdkPromise = import('@stripe/terminal-js').then(function (m) { return m.loadStripeTerminal() })
  }
  return terminalSdkPromise
}

const STAGES = {
  INIT:     'init',         // Loading SDK, fetching connection token
  DISCOVER: 'discover',     // Discovering / picking reader
  CONNECT:  'connect',      // Connecting to reader
  READY:    'ready',        // Reader connected, ready to charge
  COLLECT:  'collect',      // Waiting for customer to tap/insert
  PROCESS:  'process',      // Confirming the payment
  SUCCESS:  'success',
  ERROR:    'error',
}

export default function TerminalCheckout({ open, amountCents, description, metadata, onSuccess, onCancel }) {
  const [stage, setStage] = useState(STAGES.INIT)
  const [error, setError] = useState('')
  const [readers, setReaders] = useState([])
  const [selectedReaderId, setSelectedReaderId] = useState(null)
  const [connectedReader, setConnectedReader] = useState(null)
  const terminalRef = useRef(null)   // The initialized Terminal instance

  // ─── Initialize on open ──────────────────────────────────────────────
  useEffect(function () {
    if (!open) return
    setStage(STAGES.INIT)
    setError('')
    var cancelled = false

    var init = async function () {
      try {
        const StripeTerminal = await loadTerminalSdk()
        if (cancelled) return

        // Create the Terminal instance with a fetchConnectionToken callback
        var term = StripeTerminal.create({
          onFetchConnectionToken: async function () {
            const { data, error: e } = await supabase.functions.invoke('stripe-terminal-token', { body: {} })
            if (e) throw e
            if (data && data.error) throw new Error(data.error)
            return data.secret
          },
          onUnexpectedReaderDisconnect: function () {
            setError('Reader disconnected. Try reconnecting.')
            setConnectedReader(null)
            setStage(STAGES.DISCOVER)
          },
        })
        terminalRef.current = term

        // Move to discover stage
        setStage(STAGES.DISCOVER)
        await discoverReaders(term)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err))
          setStage(STAGES.ERROR)
        }
      }
    }

    init()

    return function () {
      cancelled = true
      // Disconnect on close so we don't hold a reader
      if (terminalRef.current && terminalRef.current.getConnectionStatus && terminalRef.current.getConnectionStatus() === 'connected') {
        try { terminalRef.current.disconnectReader() } catch (_) {}
      }
    }
  }, [open])

  // ─── Discover readers (real internet readers + simulator if enabled) ──
  async function discoverReaders(term) {
    var useSimulator = true   // Always enable simulator for testing.
                              // Real readers still show up alongside.
    var config = { simulated: useSimulator }
    var result = await term.discoverReaders(config)
    if (result.error) {
      throw new Error(result.error.message || 'Failed to discover readers')
    }
    var found = result.discoveredReaders || []
    setReaders(found)
    // Auto-select first reader if there's only one
    if (found.length === 1) setSelectedReaderId(found[0].id)
  }

  // ─── Connect to selected reader ──────────────────────────────────────
  async function connectToReader() {
    setError('')
    setStage(STAGES.CONNECT)
    try {
      var term = terminalRef.current
      var reader = readers.find(function (r) { return r.id === selectedReaderId })
      if (!reader) throw new Error('No reader selected')
      var result = await term.connectReader(reader)
      if (result.error) throw new Error(result.error.message || 'Failed to connect')
      setConnectedReader(result.reader)
      setStage(STAGES.READY)
    } catch (err) {
      setError(err.message || String(err))
      setStage(STAGES.ERROR)
    }
  }

  // ─── The actual charge flow ──────────────────────────────────────────
  async function startCharge() {
    setError('')
    setStage(STAGES.COLLECT)
    try {
      var term = terminalRef.current

      // 1) Create PaymentIntent via edge function
      const { data: piData, error: piErr } = await supabase.functions.invoke('stripe-terminal-create-pi', {
        body: { amount_cents: amountCents, description: description || '', metadata: metadata || {} },
      })
      if (piErr) throw piErr
      if (piData && piData.error) throw new Error(piData.error)
      if (!piData.client_secret) throw new Error('Did not get client_secret')

      // 2) Collect payment method on the reader (customer taps card)
      var collectResult = await term.collectPaymentMethod(piData.client_secret)
      if (collectResult.error) throw new Error(collectResult.error.message || 'Collection failed')

      // 3) Process the payment
      setStage(STAGES.PROCESS)
      var processResult = await term.processPayment(collectResult.paymentIntent)
      if (processResult.error) throw new Error(processResult.error.message || 'Payment failed')

      // 4) Success!
      setStage(STAGES.SUCCESS)
      // Notify parent after a brief success display
      setTimeout(function () {
        onSuccess && onSuccess(processResult.paymentIntent.id)
      }, 1200)
    } catch (err) {
      setError(err.message || String(err))
      setStage(STAGES.ERROR)
    }
  }

  function handleCancel() {
    var term = terminalRef.current
    if (term && term.getConnectionStatus && term.getConnectionStatus() === 'connected') {
      try { term.cancelCollectPaymentMethod() } catch (_) {}
    }
    onCancel && onCancel()
  }

  if (!open) return null

  return (
    <div
      onClick={function (e) { if (e.target === e.currentTarget && stage !== STAGES.COLLECT && stage !== STAGES.PROCESS) handleCancel() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '460px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)', textAlign: 'center' }}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stripe Terminal</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#111827', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
            ${(amountCents / 100).toFixed(2)}
          </div>
          {description && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{description}</div>}
        </div>

        {/* Stage-based body */}
        {stage === STAGES.INIT && (
          <Spinner message="Connecting to Stripe…" />
        )}

        {stage === STAGES.DISCOVER && (
          <>
            <div style={{ fontSize: '14px', color: '#374151', marginBottom: '10px' }}>
              {readers.length === 0 ? 'Searching for readers…' : 'Pick a reader:'}
            </div>
            {readers.length === 0 ? (
              <Spinner message="" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                {readers.map(function (r) {
                  var isSelected = selectedReaderId === r.id
                  var isSim = r.device_type === 'simulated_wisepos_e' || r.simulated
                  return (
                    <button
                      key={r.id}
                      onClick={function () { setSelectedReaderId(r.id) }}
                      style={{
                        padding: '12px',
                        background: isSelected ? '#ede9fe' : '#fff',
                        border: '2px solid ' + (isSelected ? '#7c3aed' : '#e5e7eb'),
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '13px',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ color: '#111827' }}>
                        {r.label || r.id}
                        {isSim && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#fef3c7', color: '#854d0e', padding: '1px 6px', borderRadius: '999px' }}>TEST</span>}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '2px' }}>{r.device_type}</div>
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCancel} style={btnSecondary}>Cancel</button>
              <button onClick={connectToReader} disabled={!selectedReaderId} style={Object.assign({}, btnPrimary, { opacity: selectedReaderId ? 1 : 0.5 })}>
                Connect
              </button>
            </div>
          </>
        )}

        {stage === STAGES.CONNECT && (
          <Spinner message="Connecting to reader…" />
        )}

        {stage === STAGES.READY && (
          <>
            <div style={{ padding: '14px', background: '#ecfdf5', borderRadius: '10px', marginBottom: '12px', color: '#065f46', fontSize: '13px' }}>
              ✓ Connected to <strong>{connectedReader && (connectedReader.label || connectedReader.id)}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCancel} style={btnSecondary}>Cancel</button>
              <button onClick={startCharge} style={Object.assign({}, btnPrimary, { background: '#16a34a' })}>
                Charge ${(amountCents / 100).toFixed(2)}
              </button>
            </div>
          </>
        )}

        {stage === STAGES.COLLECT && (
          <>
            <div style={{ padding: '24px 16px', background: '#7c3aed', borderRadius: '10px', color: '#fff', marginBottom: '12px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>💳</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>
                Tap, insert, or swipe card on the reader
              </div>
              <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '4px' }}>
                Hand the customer the reader
              </div>
            </div>
            <button onClick={handleCancel} style={btnSecondary}>Cancel</button>
          </>
        )}

        {stage === STAGES.PROCESS && (
          <Spinner message="Processing payment…" />
        )}

        {stage === STAGES.SUCCESS && (
          <div style={{ padding: '24px', background: '#ecfdf5', borderRadius: '10px', color: '#065f46' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
            <div style={{ fontSize: '16px', fontWeight: 800 }}>Payment Approved</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>${(amountCents / 100).toFixed(2)}</div>
          </div>
        )}

        {stage === STAGES.ERROR && (
          <>
            <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '13px', marginBottom: '12px', textAlign: 'left' }}>
              <strong>Error:</strong> {error || 'Something went wrong'}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCancel} style={btnSecondary}>Close</button>
              <button
                onClick={function () { setError(''); setStage(STAGES.INIT) /* reinit */ }}
                style={btnPrimary}
              >
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner({ message }) {
  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{
        width: '32px', height: '32px',
        border: '3px solid #e5e7eb',
        borderTop: '3px solid #7c3aed',
        borderRadius: '50%',
        margin: '0 auto 12px',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {message && <div style={{ fontSize: '13px', color: '#6b7280' }}>{message}</div>}
    </div>
  )
}

const btnPrimary = {
  flex: 1, padding: '12px', background: '#7c3aed', color: '#fff',
  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
}
const btnSecondary = {
  flex: 1, padding: '12px', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
}
