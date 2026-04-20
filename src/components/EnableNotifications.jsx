// ====================================================================
// EnableNotifications — reusable "Turn on notifications" UI
// ====================================================================
// Handles the full browser push enable/disable flow.
//
// Usage:
//   <EnableNotifications variant="settings" userType="groomer" />
//     → compact row, fits in a settings list
//
//   <EnableNotifications variant="hero" userType="client" />
//     → big attention-grabbing card for first-time clients
//
// Smart states:
//   • Loading        → checking subscription status
//   • Unsupported    → browser can't do push (older Safari, etc.)
//   • Blocked        → user previously denied, needs browser settings
//   • Off            → big enable button
//   • On             → confirmation + turn off option
// ====================================================================

import { useState, useEffect } from 'react'
import {
  isPushSupported,
  getPermission,
  hasActiveSubscription,
  enablePushNotifications,
  disablePushNotifications,
  sendTestPush,
} from '../lib/push'

export default function EnableNotifications({ variant = 'settings', userType = 'groomer' }) {
  const [state, setState] = useState('loading') // loading | unsupported | blocked | off | on
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [testStatus, setTestStatus] = useState('') // '' | 'sending' | 'sent'

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    setErrorMsg('')
    if (!isPushSupported()) {
      setState('unsupported')
      return
    }
    const permission = getPermission()
    if (permission === 'denied') {
      setState('blocked')
      return
    }
    const active = await hasActiveSubscription()
    setState(active ? 'on' : 'off')
  }

  async function handleEnable() {
    setBusy(true)
    setErrorMsg('')
    const result = await enablePushNotifications({ userType })
    setBusy(false)
    if (result.success) {
      setState('on')
    } else {
      setErrorMsg(result.error || 'Could not enable notifications.')
      // Refresh in case permission was just denied
      const permission = getPermission()
      if (permission === 'denied') setState('blocked')
    }
  }

  async function handleDisable() {
    setBusy(true)
    setErrorMsg('')
    const result = await disablePushNotifications()
    setBusy(false)
    if (result.success) {
      setState('off')
    } else {
      setErrorMsg(result.error || 'Could not turn off notifications.')
    }
  }

  async function handleTest() {
    setTestStatus('sending')
    setErrorMsg('')
    const result = await sendTestPush()
    if (result.success) {
      setTestStatus('sent')
      setTimeout(() => setTestStatus(''), 3000)
    } else {
      setTestStatus('')
      setErrorMsg(result.error || 'Test failed.')
    }
  }

  // ------------------------------------------------------------------
  // HERO variant — big card, used on Client Portal Dashboard
  // ------------------------------------------------------------------
  if (variant === 'hero') {
    if (state === 'loading') return null // don't flicker on initial load

    if (state === 'unsupported') {
      return (
        <div style={styles.heroCard}>
          <div style={styles.heroEmoji}>📵</div>
          <div style={styles.heroText}>
            <div style={styles.heroTitle}>Notifications aren't supported in this browser</div>
            <div style={styles.heroSubtitle}>
              Try Chrome, Firefox, or Edge to get updates from your groomer.
            </div>
          </div>
        </div>
      )
    }

    if (state === 'blocked') {
      return (
        <div style={styles.heroCard}>
          <div style={styles.heroEmoji}>🔕</div>
          <div style={styles.heroText}>
            <div style={styles.heroTitle}>Notifications are blocked</div>
            <div style={styles.heroSubtitle}>
              Click the lock icon 🔒 in your browser's address bar → Notifications → Allow.
            </div>
          </div>
        </div>
      )
    }

    if (state === 'on') {
      return (
        <div style={{ ...styles.heroCard, background: '#ecfdf5', borderColor: '#10b981' }}>
          <div style={styles.heroEmoji}>🔔</div>
          <div style={styles.heroText}>
            <div style={{ ...styles.heroTitle, color: '#065f46' }}>Notifications are ON</div>
            <div style={styles.heroSubtitle}>
              {testStatus === 'sent'
                ? '✅ Test sent! Check your screen.'
                : "You'll be notified about appointment updates, messages, and reminders."}
            </div>
            {errorMsg && <div style={styles.errorMsg}>{errorMsg}</div>}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleTest}
              disabled={testStatus === 'sending'}
              style={styles.heroSecondaryBtn}
            >
              {testStatus === 'sending' ? 'Sending…' : 'Send test'}
            </button>
            <button
              onClick={handleDisable}
              disabled={busy}
              style={styles.heroSecondaryBtn}
            >
              {busy ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
        </div>
      )
    }

    // state === 'off'
    return (
      <div style={styles.heroCard}>
        <div style={styles.heroEmoji}>🔔</div>
        <div style={styles.heroText}>
          <div style={styles.heroTitle}>Get notifications from your groomer</div>
          <div style={styles.heroSubtitle}>
            Appointment updates, reminders, and messages — right to this device.
          </div>
          {errorMsg && <div style={styles.errorMsg}>{errorMsg}</div>}
        </div>
        <button
          onClick={handleEnable}
          disabled={busy}
          style={styles.heroPrimaryBtn}
        >
          {busy ? 'Enabling…' : 'Turn on notifications'}
        </button>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // SETTINGS variant — compact row, used on Shop Settings
  // ------------------------------------------------------------------
  if (state === 'loading') return null

  if (state === 'unsupported') {
    return (
      <div style={styles.settingsRow}>
        <div>
          <div style={styles.settingsLabel}>Browser notifications</div>
          <div style={styles.settingsHint}>Not supported in this browser — try Chrome or Firefox.</div>
        </div>
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div style={styles.settingsRow}>
        <div>
          <div style={styles.settingsLabel}>Browser notifications</div>
          <div style={styles.settingsHint}>
            Blocked — click the 🔒 in your address bar → Notifications → Allow, then refresh.
          </div>
        </div>
      </div>
    )
  }

  if (state === 'on') {
    return (
      <div style={styles.settingsRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.settingsLabel}>🔔 Browser notifications</div>
          <div style={styles.settingsHint}>
            {testStatus === 'sent'
              ? '✅ Test sent! Check your screen.'
              : "ON — you'll get pings for bookings, messages, and flags."}
          </div>
          {errorMsg && <div style={styles.errorMsg}>{errorMsg}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleTest}
            disabled={testStatus === 'sending'}
            style={styles.settingsOnBtn}
          >
            {testStatus === 'sending' ? 'Sending…' : 'Send test'}
          </button>
          <button onClick={handleDisable} disabled={busy} style={styles.settingsOffBtn}>
            {busy ? 'Turning off…' : 'Turn off'}
          </button>
        </div>
      </div>
    )
  }

  // state === 'off'
  return (
    <div style={styles.settingsRow}>
      <div>
        <div style={styles.settingsLabel}>Browser notifications</div>
        <div style={styles.settingsHint}>Get pinged when a booking, message, or flag needs you.</div>
        {errorMsg && <div style={styles.errorMsg}>{errorMsg}</div>}
      </div>
      <button onClick={handleEnable} disabled={busy} style={styles.settingsOnBtn}>
        {busy ? 'Enabling…' : 'Turn on'}
      </button>
    </div>
  )
}

// --------------------------------------------------------------------
// Inline styles (keeps the component self-contained, no CSS file needed)
// --------------------------------------------------------------------
const styles = {
  // HERO
  heroCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    background: '#eff6ff',
    border: '2px solid #3b82f6',
    borderRadius: '12px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  heroEmoji: { fontSize: '40px', flexShrink: 0 },
  heroText: { flex: 1, minWidth: '200px' },
  heroTitle: { fontSize: '18px', fontWeight: 700, color: '#1e40af', marginBottom: '4px' },
  heroSubtitle: { fontSize: '14px', color: '#334155' },
  heroPrimaryBtn: {
    padding: '12px 24px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  heroSecondaryBtn: {
    padding: '10px 18px',
    background: 'white',
    color: '#065f46',
    border: '1px solid #10b981',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  // SETTINGS
  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '14px 16px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  settingsLabel: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '2px' },
  settingsHint: { fontSize: '13px', color: '#64748b' },
  settingsOnBtn: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  settingsOffBtn: {
    padding: '8px 16px',
    background: 'white',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  // Shared
  errorMsg: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#b91c1c',
    background: '#fef2f2',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #fecaca',
  },
}
