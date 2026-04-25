// =======================================================
// PetPro — Kiosk Clock In/Out (lobby tablet)
// URL: /kiosk
// =======================================================
// The OWNER leaves this page open on a lobby tablet/laptop.
// Each staff member walks up, types their 4-digit PIN, and the page
// shows their name + a single big button (Clock In or Clock Out).
// After action, shows a success message, then auto-resets to the
// keypad for the next person.
//
// Auth model: uses the owner's session (they're logged in on the
// lobby device). No staff auth needed at this step — just the PIN
// verifies who's clocking in.
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Kiosk() {
  const navigate = useNavigate()
  const [ownerId, setOwnerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  // After PIN match, we show a "confirm" screen with the staff's name
  const [matchedStaff, setMatchedStaff] = useState(null)
  const [activeEntry, setActiveEntry] = useState(null) // current open clock-in for matched staff
  const [submitting, setSubmitting] = useState(false)

  // Final success screen
  const [success, setSuccess] = useState(null) // { action, staffName, time }
  const [clock, setClock] = useState(new Date())

  useEffect(function () {
    // Ensure owner is logged in (this kiosk rides on their session)
    supabase.auth.getUser().then(function (res) {
      const u = res && res.data && res.data.user
      if (!u) {
        navigate('/login')
        return
      }
      setOwnerId(u.id)
      setLoading(false)
    })
  }, [navigate])

  // Live clock in the header
  useEffect(function () {
    const id = setInterval(function () { setClock(new Date()) }, 1000)
    return function () { clearInterval(id) }
  }, [])

  // Auto-dismiss success screen after 4 seconds
  useEffect(function () {
    if (!success) return
    const t = setTimeout(function () {
      setSuccess(null)
      setPin('')
      setMatchedStaff(null)
      setActiveEntry(null)
    }, 4000)
    return function () { clearTimeout(t) }
  }, [success])

  function keypadPress(digit) {
    setError('')
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      verifyPin(next)
    }
  }

  function keypadBackspace() {
    setError('')
    setPin(pin.slice(0, -1))
  }

  function keypadClear() {
    setError('')
    setPin('')
  }

  async function verifyPin(fullPin) {
    // Look up the staff member with this PIN in this shop
    const { data, error: qErr } = await supabase
      .from('staff_members')
      .select('id, first_name, last_name, role')
      .eq('groomer_id', ownerId)
      .eq('pin_code', fullPin)
      .eq('status', 'active')
      .maybeSingle()

    if (qErr || !data) {
      setError('PIN not recognized. Try again.')
      setPin('')
      return
    }

    // Check if they have an open clock-in (no clock_out yet)
    const { data: open, error: openErr } = await supabase
      .from('time_clock')
      .select('*')
      .eq('staff_id', data.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (openErr) {
      setError('Error checking your status. Try again.')
      setPin('')
      return
    }

    setMatchedStaff(data)
    setActiveEntry(open || null)
  }

  async function handleClockAction() {
    if (!matchedStaff) return
    setSubmitting(true)

    if (activeEntry) {
      // If they're still on break when they hit Clock Out, end the break
      // first so the elapsed break time gets folded into break_minutes.
      var finalBreakMinutes = activeEntry.break_minutes || 0
      if (activeEntry.on_break && activeEntry.break_start) {
        var bs = new Date(activeEntry.break_start)
        var bMins = Math.max(0, Math.round((new Date() - bs) / 60000))
        finalBreakMinutes = finalBreakMinutes + bMins
      }

      // CLOCK OUT — close the open entry
      const out = new Date()
      const start = new Date(activeEntry.clock_in)
      const totalMin = Math.max(0, Math.round((out - start) / 60000 - finalBreakMinutes))
      const { error: upErr } = await supabase
        .from('time_clock')
        .update({
          clock_out: out.toISOString(),
          total_minutes: totalMin,
          break_minutes: finalBreakMinutes,
          on_break: false,
          break_start: null,
        })
        .eq('id', activeEntry.id)
      if (upErr) {
        setError('Clock out failed: ' + upErr.message)
        setSubmitting(false)
        return
      }
      setSuccess({
        action: 'Clocked out',
        staffName: matchedStaff.first_name + (matchedStaff.last_name ? ' ' + matchedStaff.last_name.charAt(0) + '.' : ''),
        time: formatTime(out),
        totalMin: totalMin,
        breakMin: finalBreakMinutes,
      })
    } else {
      // CLOCK IN — create a new entry
      const now = new Date()
      const { error: insErr } = await supabase.from('time_clock').insert({
        staff_id: matchedStaff.id,
        groomer_id: ownerId,
        clock_in: now.toISOString(),
        date: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'),
      })
      if (insErr) {
        setError('Clock in failed: ' + insErr.message)
        setSubmitting(false)
        return
      }
      setSuccess({
        action: 'Clocked in',
        staffName: matchedStaff.first_name + (matchedStaff.last_name ? ' ' + matchedStaff.last_name.charAt(0) + '.' : ''),
        time: formatTime(now),
      })
    }
    setSubmitting(false)
  }

  // Toggle break — Start Break (sets break_start + on_break=true)
  // OR End Break (rolls elapsed break minutes into break_minutes, clears state)
  async function handleBreakAction() {
    if (!matchedStaff || !activeEntry) return
    setSubmitting(true)
    try {
      if (activeEntry.on_break) {
        // ── END BREAK — fold elapsed mins into break_minutes
        var bs = activeEntry.break_start ? new Date(activeEntry.break_start) : new Date()
        var elapsedBreak = Math.max(0, Math.round((new Date() - bs) / 60000))
        var newBreakTotal = (activeEntry.break_minutes || 0) + elapsedBreak

        var { error: endErr } = await supabase
          .from('time_clock')
          .update({
            on_break: false,
            break_start: null,
            break_minutes: newBreakTotal,
          })
          .eq('id', activeEntry.id)
        if (endErr) {
          setError('End break failed: ' + endErr.message)
          setSubmitting(false)
          return
        }
        setSuccess({
          action: 'Break ended',
          staffName: matchedStaff.first_name + (matchedStaff.last_name ? ' ' + matchedStaff.last_name.charAt(0) + '.' : ''),
          time: formatTime(new Date()),
          breakMin: elapsedBreak,
        })
      } else {
        // ── START BREAK — set break_start + on_break=true
        var nowIso = new Date().toISOString()
        var { error: startErr } = await supabase
          .from('time_clock')
          .update({
            on_break: true,
            break_start: nowIso,
          })
          .eq('id', activeEntry.id)
        if (startErr) {
          setError('Start break failed: ' + startErr.message)
          setSubmitting(false)
          return
        }
        setSuccess({
          action: 'Break started',
          staffName: matchedStaff.first_name + (matchedStaff.last_name ? ' ' + matchedStaff.last_name.charAt(0) + '.' : ''),
          time: formatTime(new Date()),
        })
      }
    } catch (err) {
      setError('Break action failed: ' + (err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setMatchedStaff(null)
    setActiveEntry(null)
    setPin('')
    setError('')
    setSuccess(null)
  }

  function formatTime(d) {
    let h = d.getHours()
    const m = String(d.getMinutes()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    if (h > 12) h -= 12
    if (h === 0) h = 12
    return h + ':' + m + ' ' + ampm
  }

  function formatClockHeader(d) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return weekdays[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate()
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff' }}>Loading kiosk...</div>
  }

  // ─── STYLES ───
  const page = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    userSelect: 'none',
  }
  const header = {
    width: '100%', textAlign: 'center', marginBottom: '24px',
  }
  const bigTime = { fontSize: '56px', fontWeight: '700', lineHeight: '1' }
  const date = { fontSize: '18px', opacity: 0.8, marginTop: '6px' }
  const card = {
    background: '#fff', color: '#111827', borderRadius: '24px',
    padding: '32px 28px', width: '100%', maxWidth: '420px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  }
  const pinDotsRow = {
    display: 'flex', justifyContent: 'center', gap: '16px', margin: '8px 0 24px',
  }
  const pinDot = (filled) => ({
    width: '20px', height: '20px', borderRadius: '50%',
    background: filled ? '#7c3aed' : '#e5e7eb',
  })
  const keypadGrid = {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
  }
  const keypadBtn = {
    padding: '20px 0', fontSize: '28px', fontWeight: '700',
    background: '#f3f4f6', color: '#111827', border: 'none',
    borderRadius: '14px', cursor: 'pointer',
  }

  // ─── RENDER ───
  return (
    <div style={page}>
      <div style={header}>
        <div style={bigTime}>{formatTime(clock)}</div>
        <div style={date}>{formatClockHeader(clock)}</div>
      </div>

      <div style={card}>
        {success ? (
          // ═══ SUCCESS SCREEN ═══
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '72px', marginBottom: '12px' }}>
              {success.action === 'Clocked in' ? '👋' : '✅'}
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', marginBottom: '6px' }}>
              {success.action}, {success.staffName}!
            </div>
            <div style={{ fontSize: '15px', color: '#6b7280', marginBottom: '18px' }}>
              {success.time}
              {success.totalMin != null && (
                <> · worked {Math.floor(success.totalMin / 60)}h {success.totalMin % 60}m</>
              )}
            </div>
            <button
              onClick={handleClose}
              style={{
                padding: '12px 28px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : matchedStaff ? (
          // ═══ CONFIRM CLOCK IN/OUT/BREAK ═══
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '42px', marginBottom: '8px' }}>🐾</div>
            <div style={{ fontSize: '22px', fontWeight: '700', marginBottom: '6px' }}>
              Hi, {matchedStaff.first_name}!
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              {!activeEntry && 'Ready to start your shift?'}
              {activeEntry && !activeEntry.on_break && (
                <>
                  Clocked in at {formatTime(new Date(activeEntry.clock_in))}
                  {activeEntry.break_minutes > 0 && (
                    <span style={{ display: 'block', fontSize: '12px', marginTop: '2px' }}>
                      ({activeEntry.break_minutes} min on break so far)
                    </span>
                  )}
                </>
              )}
              {activeEntry && activeEntry.on_break && (
                <span style={{ color: '#ea580c', fontWeight: 700 }}>
                  ☕ On break since {activeEntry.break_start ? formatTime(new Date(activeEntry.break_start)) : 'just now'}
                </span>
              )}
            </div>

            {/* CLOCK IN — no active entry yet */}
            {!activeEntry && (
              <button
                onClick={handleClockAction}
                disabled={submitting}
                style={{
                  width: '100%', padding: '18px', marginBottom: '10px',
                  background: '#16a34a',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontSize: '20px', fontWeight: '800', cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? '...' : '▶️ Clock In'}
              </button>
            )}

            {/* ON BREAK — only show END BREAK (can't clock out while on break) */}
            {activeEntry && activeEntry.on_break && (
              <button
                onClick={handleBreakAction}
                disabled={submitting}
                style={{
                  width: '100%', padding: '18px', marginBottom: '10px',
                  background: '#ea580c',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontSize: '20px', fontWeight: '800', cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? '...' : '✅ End Break'}
              </button>
            )}

            {/* CLOCKED IN, NOT ON BREAK — show Start Break + Clock Out side by side */}
            {activeEntry && !activeEntry.on_break && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button
                  onClick={handleBreakAction}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: '18px',
                    background: '#f59e0b',
                    color: '#fff', border: 'none', borderRadius: '12px',
                    fontSize: '17px', fontWeight: '800', cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? '...' : '☕ Start Break'}
                </button>
                <button
                  onClick={handleClockAction}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: '18px',
                    background: '#dc2626',
                    color: '#fff', border: 'none', borderRadius: '12px',
                    fontSize: '17px', fontWeight: '800', cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? '...' : '🛑 Clock Out'}
                </button>
              </div>
            )}

            <button
              onClick={handleClose}
              style={{
                width: '100%', padding: '12px',
                background: '#f3f4f6', color: '#4b5563', border: 'none',
                borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          // ═══ PIN KEYPAD ═══
          <>
            <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '17px', fontWeight: '600', color: '#374151' }}>
              Enter your 4-digit PIN
            </div>
            <div style={pinDotsRow}>
              {[0, 1, 2, 3].map(function (i) {
                return <div key={i} style={pinDot(i < pin.length)} />
              })}
            </div>
            {error && (
              <div style={{ textAlign: 'center', color: '#dc2626', fontSize: '13px', marginBottom: '12px', fontWeight: '600' }}>
                {error}
              </div>
            )}
            <div style={keypadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(function (d) {
                return (
                  <button key={d} style={keypadBtn} onClick={function () { keypadPress(d) }}>{d}</button>
                )
              })}
              <button style={{ ...keypadBtn, background: '#fef3c7', color: '#92400e' }} onClick={keypadClear}>Clear</button>
              <button style={keypadBtn} onClick={function () { keypadPress('0') }}>0</button>
              <button style={{ ...keypadBtn, fontSize: '20px' }} onClick={keypadBackspace}>⌫</button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: '24px', fontSize: '12px', opacity: 0.6 }}>
        🐾 PetPro Lobby Kiosk
      </div>
    </div>
  )
}
