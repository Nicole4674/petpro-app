// =============================================================================
// MobileDriveTimeWarning.jsx — drop-in component for the booking modal.
// =============================================================================
// Self-contained drive-time sanity check for mobile groomers. Drop ONE line
// of JSX into AddAppointmentModal and this component handles everything:
//   • Loads Google Maps SDK on its own (idempotent — won't double-load if
//     other parts of the app already loaded it)
//   • Checks shop_settings.is_mobile — renders NOTHING for storefront shops
//   • Looks up the client's coords + today's other appointments
//   • Calls checkMobileBookingDriveTime to compute drive times
//   • Renders a yellow warning + 🪄 Auto-add buffer button if too tight
//   • Calls onApplyBuffer(newStart, newEnd) when the button is clicked
//
// The modal doesn't need to know any of the above — it just drops the
// component in and listens for the buffer callback.
// =============================================================================
import { useState, useEffect } from 'react'
import { useLoadScript } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { checkMobileBookingDriveTime, _internal } from '../lib/mobileBookingChecker'

// MUST be defined OUTSIDE the component — useLoadScript wants a stable ref.
// 'places' matches what AddressInput + Route page already load, so the script
// caches across the whole app instead of double-loading.
const GOOGLE_LIBRARIES = ['places']

export default function MobileDriveTimeWarning({
  clientId,
  appointmentDate,
  startTime,
  endTime,
  excludeAppointmentId,   // when editing, skip this appointment in the "others" query
  onApplyBuffer,
}) {
  // ---------- Google Maps SDK loader (cached across the app) ----------
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  })

  // ---------- State ----------
  // isMobileShop: gated by shop_settings.is_mobile. Storefront groomers see
  // nothing — the toggle they enabled in Settings is what flips this on.
  const [isMobileShop, setIsMobileShop] = useState(null)   // null = still loading
  const [groomerId, setGroomerId] = useState(null)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState(null)                  // result of checkMobileBookingDriveTime

  // ---------- One-time setup: load shop_settings.is_mobile ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return
        setGroomerId(user.id)
        const { data: shop } = await supabase
          .from('shop_settings')
          .select('is_mobile')
          .eq('groomer_id', user.id)
          .maybeSingle()
        if (cancelled) return
        setIsMobileShop(!!(shop && shop.is_mobile))
      } catch (err) {
        console.warn('[MobileDriveTimeWarning] Could not load shop_settings:', err)
        if (!cancelled) setIsMobileShop(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ---------- Run the drive-time check whenever inputs change ----------
  // Debounced 600ms so we don't hammer the Distance Matrix API while
  // the user is still typing or picking things.
  useEffect(() => {
    // Bail early if we shouldn't or can't run
    if (isMobileShop !== true) return
    if (!mapsLoaded || !groomerId) return
    if (!clientId || !appointmentDate || !startTime || !endTime) {
      setCheck(null)
      return
    }

    let cancelled = false
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        // 1. Look up the new client's coords
        const { data: client } = await supabase
          .from('clients')
          .select('latitude, longitude, first_name, last_name')
          .eq('id', clientId)
          .maybeSingle()

        if (cancelled) return

        const newAppt = {
          lat: client && client.latitude != null ? parseFloat(client.latitude) : null,
          lng: client && client.longitude != null ? parseFloat(client.longitude) : null,
          startMinutes: _internal.hmToMinutes(startTime),
          endMinutes: _internal.hmToMinutes(endTime),
        }

        // 2. Pull other appointments today — exclude cancelled + self (if editing)
        let q = supabase
          .from('appointments')
          .select('id, start_time, end_time, clients:client_id(first_name, last_name, latitude, longitude)')
          .eq('groomer_id', groomerId)
          .eq('appointment_date', appointmentDate)
          .neq('status', 'cancelled')
        if (excludeAppointmentId) q = q.neq('id', excludeAppointmentId)
        const { data: others } = await q

        if (cancelled) return

        const otherAppts = (others || []).map((a) => {
          const c = a.clients || {}
          return {
            lat: c.latitude != null ? parseFloat(c.latitude) : null,
            lng: c.longitude != null ? parseFloat(c.longitude) : null,
            startMinutes: _internal.hmToMinutes(a.start_time),
            endMinutes: _internal.hmToMinutes(a.end_time),
            label: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'appt',
          }
        })

        // 3. Run the analysis
        const result = await checkMobileBookingDriveTime({ newAppt, otherAppts })
        if (!cancelled) setCheck(result)
      } catch (err) {
        console.error('[MobileDriveTimeWarning] check failed:', err)
        if (!cancelled) setCheck(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 600)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [isMobileShop, mapsLoaded, groomerId, clientId, appointmentDate, startTime, endTime, excludeAppointmentId])

  // ---------- Render ----------

  // Storefront shops see nothing — feature is gated by the Mobile toggle
  if (isMobileShop !== true) return null

  // Loading the SDK or running the check
  if (checking) {
    return (
      <div style={{
        padding: '8px 12px',
        background: '#f3f4f6',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#6b7280',
        marginTop: '10px',
      }}>
        🧠 Checking drive times…
      </div>
    )
  }

  // Don't render anything until we have a result
  if (!check) return null

  // Skipped (no coords, missing input, etc.) — show a soft hint, not a warning
  if (check.skipped) {
    return (
      <div style={{
        padding: '8px 12px',
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#6b7280',
        marginTop: '10px',
      }}>
        ℹ️ Drive-time check unavailable: {check.skipReason}
      </div>
    )
  }

  // All clear — small green confirmation so the groomer knows it ran
  if (check.ok) {
    const beforeStr = check.beforeDriveMins != null
      ? '← ' + _internal.fmtDuration(check.beforeDriveMins) + ' from previous'
      : ''
    const afterStr = check.afterDriveMins != null
      ? _internal.fmtDuration(check.afterDriveMins) + ' to next →'
      : ''
    const summary = [beforeStr, afterStr].filter(Boolean).join('   ·   ')
    return (
      <div style={{
        padding: '8px 12px',
        background: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#166534',
        marginTop: '10px',
      }}>
        ✅ Drive times look good. {summary && <span style={{ color: '#15803d', fontWeight: 600 }}>{summary}</span>}
      </div>
    )
  }

  // Warning — too tight. Show all warnings + (if applicable) auto-buffer button.
  const canAutoBuffer = check.suggestedStartMinutes != null && check.suggestedEndMinutes != null
  return (
    <div style={{
      padding: '12px 14px',
      background: '#fef9c3',
      border: '1px solid #fde047',
      borderRadius: '8px',
      marginTop: '10px',
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 700,
        color: '#854d0e',
        marginBottom: '6px',
      }}>
        ⚠️ Drive-time check
      </div>
      {check.warnings.map((w, i) => (
        <div key={i} style={{
          fontSize: '12px',
          color: '#854d0e',
          lineHeight: 1.4,
          marginBottom: '4px',
        }}>
          {w}
        </div>
      ))}
      {canAutoBuffer && (
        <button
          type="button"
          onClick={() => {
            if (onApplyBuffer) {
              onApplyBuffer(
                _internal.minutesToHm(check.suggestedStartMinutes),
                _internal.minutesToHm(check.suggestedEndMinutes),
              )
            }
          }}
          style={{
            marginTop: '8px',
            padding: '8px 14px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          🪄 Auto-add buffer (move start to {_internal.minutesToHm(check.suggestedStartMinutes)})
        </button>
      )}
    </div>
  )
}
