// =============================================================================
// LateDetector.jsx — Phase 6: tells the mobile groomer when they're falling
// behind schedule, with optional GPS-based ETA prediction.
// =============================================================================
// Drop ONE line of JSX into Route.jsx and this component handles everything:
//   • Verifies the late-warnings toggle is ON in shop_settings
//   • Polls every 60 seconds (or on focus) for staleness
//   • Time-only check: NOW > next stop's start_time + 10 min grace = late
//   • GPS check: ask permission ONCE, then use Distance Matrix to predict
//     real arrival time (NOW + drive_minutes + 5 min buffer). If predicted
//     arrival > scheduled start, flag as PREDICTIVELY late
//   • Renders a yellow banner at the top of the parent (or null when fine)
//   • Exposes the "lateStop" via onChange so parent can render per-stop
//     badges inline in the stop list
//   • Action buttons: 📧 Send heads-up email (reuses Phase 5B) + 📞 Call client
//
// Why the toggle?
//   Most groomers know they're late by glancing at the clock. A pop-up
//   reminder would feel like nagging. Opt-in only.
// =============================================================================
import { useState, useEffect, useRef } from 'react'
import { useLoadScript } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'

// MUST be defined OUTSIDE the component (stable ref for useLoadScript)
const GOOGLE_LIBRARIES = ['places']

// How many minutes past scheduled start before we call it "late" (time-only).
// 10 min matches typical industry "grace period" — anything under is fine.
const TIME_GRACE_MIN = 10

// How often to recompute (in ms). 60s = balance of freshness vs battery.
const POLL_INTERVAL_MS = 60 * 1000

// Buffer added to GPS-based ETA predictions (parking, walking up, greeting).
const GPS_ARRIVAL_BUFFER_MIN = 5

// "HH:MM" or "HH:MM:SS" → minutes from midnight
function hmToMinutes(t) {
  if (!t) return 0
  const parts = String(t).split(':')
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)
}

// Current time as minutes from midnight (LOCAL — matches stop.start_time)
function nowAsMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// "5 min" or "1 hr 12 min"
function fmtMinutes(m) {
  m = Math.round(m)
  if (m < 60) return m + ' min'
  const hrs = Math.floor(m / 60)
  const rem = m - hrs * 60
  return hrs + ' hr' + (rem > 0 ? ' ' + rem + ' min' : '')
}

// Get drive minutes between two coords using JS SDK (CORS-safe, same as routeOptimizer)
async function getDriveMinutes(origin, destLat, destLng) {
  if (typeof window === 'undefined' || !window.google || !window.google.maps) return null
  if (!origin || origin.lat == null) return null
  return new Promise(function (resolve) {
    try {
      const service = new window.google.maps.DistanceMatrixService()
      service.getDistanceMatrix({
        origins: [new window.google.maps.LatLng(origin.lat, origin.lng)],
        destinations: [new window.google.maps.LatLng(destLat, destLng)],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      }, function (response, status) {
        if (status !== 'OK' || !response) { resolve(null); return }
        const el = response.rows[0] && response.rows[0].elements && response.rows[0].elements[0]
        if (el && el.status === 'OK' && el.duration) {
          resolve(Math.ceil(el.duration.value / 60))
        } else {
          resolve(null)
        }
      })
    } catch (err) { resolve(null) }
  })
}

export default function LateDetector({
  stops,
  enabled,
  onSendHeadsUp,    // callback when groomer taps "Send heads-up email" — opens Phase 5B modal
  onChange,         // callback that fires whenever lateState changes (parent uses for badges)
}) {
  // --- Google Maps SDK loader (cached across the app) ---
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  })

  // --- State ---
  // userPosition: { lat, lng } once we have GPS, else null
  const [userPosition, setUserPosition] = useState(null)
  // gpsStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
  const [gpsStatus, setGpsStatus] = useState('idle')
  // lateState: { isLate, lateMinutes, lateStop, mode } — the public output
  const [lateState, setLateState] = useState({ isLate: false, lateMinutes: 0, lateStop: null, mode: null })
  // tick is just a timestamp that bumps every POLL_INTERVAL_MS so the effect re-runs
  const [tick, setTick] = useState(0)

  // Ref to remember whether we've already asked for GPS this session
  const askedGpsRef = useRef(false)

  // --- Polling ---
  // Re-check every minute. Also re-check when the tab regains focus (groomer
  // comes back from Maps app or check-in flow).
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => setTick(t => t + 1), POLL_INTERVAL_MS)
    const onFocus = () => setTick(t => t + 1)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled])

  // --- One-time GPS request when enabled ---
  // We ask ONCE per session. If denied, we silently fall back to time-only.
  // No re-asking — that would be annoying.
  useEffect(() => {
    if (!enabled) return
    if (askedGpsRef.current) return
    askedGpsRef.current = true

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable')
      return
    }

    setGpsStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsStatus('granted')
      },
      (err) => {
        // PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3
        setGpsStatus(err.code === 1 ? 'denied' : 'unavailable')
      },
      {
        enableHighAccuracy: false,   // city-block accuracy is enough for ETA
        maximumAge: 60 * 1000,       // accept up to 60s old position
        timeout: 10 * 1000,          // 10s timeout — don't hang forever
      }
    )
  }, [enabled])

  // --- Periodic GPS refresh (every 5 min while enabled + granted) ---
  useEffect(() => {
    if (!enabled || gpsStatus !== 'granted') return
    const interval = setInterval(() => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, maximumAge: 60 * 1000, timeout: 10 * 1000 }
      )
    }, 5 * 60 * 1000)  // every 5 min
    return () => clearInterval(interval)
  }, [enabled, gpsStatus])

  // --- Main detection logic ---
  // Runs when: stops change, gpsStatus changes, userPosition changes, or tick fires.
  // Finds the next un-completed stop, checks if late by time AND/OR GPS, sets state.
  useEffect(() => {
    if (!enabled) {
      setLateState({ isLate: false, lateMinutes: 0, lateStop: null, mode: null })
      return
    }

    let cancelled = false
    ;(async () => {
      // 1. Find the NEXT stop — earliest by start time that hasn't happened yet.
      //    "Hasn't happened" = start time hasn't fully passed (so we still count
      //    the current/upcoming one as the target).
      const now = nowAsMinutes()
      const upcoming = (stops || []).filter(function (s) {
        if (!s || !s.time) return false
        const sm = hmToMinutes(s.time)
        // We want: stops where the start time is in the future OR within the
        // last 90 minutes (so a "currently happening" stop also flags as late).
        return sm + 90 > now
      })
      // Sort by time ascending and take first
      upcoming.sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time))
      const nextStop = upcoming[0]

      if (!nextStop) {
        if (!cancelled) setLateState({ isLate: false, lateMinutes: 0, lateStop: null, mode: null })
        return
      }

      const stopMin = hmToMinutes(nextStop.time)

      // 2. Time-based check: are we already past the grace period?
      const minutesPast = now - stopMin    // negative if stop is in future
      let timeLate = minutesPast > TIME_GRACE_MIN ? minutesPast : 0

      // 3. GPS-based prediction (if we have coords + map SDK + stop has lat/lng)
      let gpsLate = 0
      let usedGps = false
      if (
        userPosition &&
        mapsLoaded &&
        nextStop.lat != null &&
        nextStop.lng != null &&
        gpsStatus === 'granted'
      ) {
        const driveMin = await getDriveMinutes(userPosition, nextStop.lat, nextStop.lng)
        if (cancelled) return
        if (driveMin != null) {
          usedGps = true
          const predictedArrival = now + driveMin + GPS_ARRIVAL_BUFFER_MIN
          gpsLate = Math.max(0, predictedArrival - stopMin)
        }
      }

      // 4. Combine: use the LARGER of the two estimates so we err on the
      //    side of warning (GPS may be optimistic if traffic is bad).
      const lateMin = Math.max(timeLate, gpsLate)
      const isLate = lateMin > 0
      const mode = usedGps ? (timeLate > gpsLate ? 'time' : 'gps') : 'time-only'

      if (!cancelled) {
        setLateState({
          isLate: isLate,
          lateMinutes: lateMin,
          lateStop: isLate ? nextStop : null,
          mode: mode,
        })
      }
    })()

    return () => { cancelled = true }
  }, [stops, enabled, userPosition, mapsLoaded, gpsStatus, tick])

  // --- Notify parent of changes (for per-stop badges) ---
  useEffect(() => {
    if (onChange) onChange(lateState)
  }, [lateState, onChange])

  // --- Render: nothing if not enabled or not late ---
  if (!enabled) return null
  if (!lateState.isLate || !lateState.lateStop) return null

  const stop = lateState.lateStop
  // Format a friendly stop label for the banner
  const stopLabel = stop.label || (stop.clientName + (stop.petName ? ' · ' + stop.petName : ''))

  return (
    <div style={{
      padding: '14px 16px',
      background: '#fef3c7',
      border: '1px solid #f59e0b',
      borderRadius: '12px',
      marginBottom: '14px',
      boxShadow: '0 2px 6px rgba(245,158,11,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#92400e', marginBottom: '4px' }}>
            ⏰ Running ~{fmtMinutes(lateState.lateMinutes)} late to {stopLabel}
          </div>
          <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.4 }}>
            {lateState.mode === 'gps' && (
              <span>📍 Based on your current location + drive time. </span>
            )}
            {lateState.mode === 'time' && (
              <span>🕐 Based on the clock — you haven't checked in yet. </span>
            )}
            {lateState.mode === 'time-only' && gpsStatus !== 'granted' && (
              <span>🕐 Time-only check. {gpsStatus === 'denied' ? 'Enable location for predictive ETAs.' : ''} </span>
            )}
            Want to give them a heads-up?
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {stop.clientEmail && onSendHeadsUp && (
            <button
              onClick={() => onSendHeadsUp(stop)}
              style={{
                padding: '8px 14px',
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Email the client your new ETA"
            >📧 Email</button>
          )}
          {stop.phone && (
            <a
              href={'tel:' + stop.phone}
              style={{
                padding: '8px 14px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'inline-block',
              }}
              title="Call the client"
            >📞 Call</a>
          )}
        </div>
      </div>
    </div>
  )
}
