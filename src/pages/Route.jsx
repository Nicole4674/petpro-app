// =============================================================================
// Route.jsx — Today's Route view for mobile groomers.
// =============================================================================
// Pulls today's grooming appointments + boarding pickups + boarding drop-offs,
// joins them with client addresses, and renders:
//   • A map with numbered pins for every stop (RouteMap component)
//   • A list rail showing each stop in time order with quick links
//   • A "Start Route" button that opens Google Maps multi-waypoint nav
//
// This page is the headline mobile groomer feature. MoeGo doesn't have it.
// =============================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoadScript } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { mapsUrl, telUrl, formatAddress } from '../lib/maps'
import { formatPhone } from '../lib/phone'
import RouteMap from '../components/RouteMap'
import LateDetector from '../components/LateDetector'
import { optimizeRoute, formatDriveTime } from '../lib/routeOptimizer'
import { printRouteSheet } from '../lib/printRouteSheet'

// MUST be defined OUTSIDE the component — useLoadScript expects a stable
// reference. If we put this inside the component it would be a new array
// every render and trigger "LoadScript has been reloaded unintentionally"
// warnings + extra script reloads.
// We load 'places' even though Route.jsx doesn't use it — the rest of the
// app already loads it (AddressInput) so this keeps the cached script the same.
const GOOGLE_LIBRARIES = ['places']

// Build the Google Maps multi-stop URL from an array of addresses.
// Origin = current location, destination = last stop, waypoints = the rest.
// Google's URL scheme caps at 9 waypoints; we slice and warn if exceeded.
function buildMultiStopUrl(addresses) {
  if (!addresses || addresses.length === 0) return ''
  // De-dup back-to-back identical addresses (e.g. boarding pickup + dropoff)
  var deduped = []
  addresses.forEach(function (a) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== a) deduped.push(a)
  })
  if (deduped.length === 1) {
    // Single stop → just open directions to it
    return mapsUrl(deduped[0])
  }
  var dest = deduped[deduped.length - 1]
  var waypoints = deduped.slice(0, deduped.length - 1)
  // Google caps multi-stop at ~9 waypoints in URL scheme
  if (waypoints.length > 9) waypoints = waypoints.slice(0, 9)
  return 'https://www.google.com/maps/dir/?api=1' +
    '&destination=' + encodeURIComponent(dest) +
    '&waypoints=' + waypoints.map(encodeURIComponent).join('|') +
    '&travelmode=driving'
}

// Format a 24h time string ("14:30:00") to "2:30 PM"
function fmtTime(t) {
  if (!t) return ''
  var parts = String(t).split(':')
  if (parts.length < 2) return t
  var h = parseInt(parts[0], 10)
  var m = parts[1]
  var ampm = h >= 12 ? 'PM' : 'AM'
  var h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

// Today's date as YYYY-MM-DD in the user's local timezone (NOT toISOString —
// that uses UTC and rolls back to yesterday in the evening for CST users).
function todayLocalIso() {
  var d = new Date()
  var y = d.getFullYear()
  var m = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

// Shift a YYYY-MM-DD string by N days (local), returning YYYY-MM-DD.
function shiftDateIso(iso, deltaDays) {
  var d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  var y = d.getFullYear()
  var m = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export default function Route() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  // Which day's route we're viewing (defaults to today; user can navigate).
  var [selectedDate, setSelectedDate] = useState(todayLocalIso())
  var [stops, setStops] = useState([])
  var [error, setError] = useState('')
  // Optimizer state — when "optimized" is non-null, we render that order
  // instead of the time-sorted default. savedMin tells the user what they saved.
  var [optimizedStops, setOptimizedStops] = useState(null)
  var [savedMin, setSavedMin] = useState(0)
  var [optimizing, setOptimizing] = useState(false)
  var [optimizeMsg, setOptimizeMsg] = useState('')

  // Load the Google Maps JS SDK so window.google.maps.DistanceMatrixService
  // is available when the user taps Optimize Route. The REST Distance Matrix
  // endpoint blocks browser calls (CORS) — only the JS SDK works client-side.
  // isLoaded flips to true once the script tag finishes downloading.
  var { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  })

  // ---------------------------------------------------------------------------
  // Heads-up email modal state
  // ---------------------------------------------------------------------------
  // headsUpStop  → null (hidden) or the stop object the modal is for
  // headsUpEta   → minutes (15/30/45/60). Default 30 = sweet spot for prep.
  // headsUpSending → true while edge function is in flight
  // headsUpSent  → { [stopId]: { eta, sentAt } } so the button can show
  //                "✅ Sent" state per-stop after success
  // headsUpError → error message if the send failed
  // Phase 6 — Late detector. Pulled from shop_settings.late_warnings_enabled
  // so each shop opts in. lateState is what LateDetector reports back —
  // we use it to render per-stop badges in the stop list.
  var [lateWarningsEnabled, setLateWarningsEnabled] = useState(false)
  var [lateState, setLateState] = useState({ isLate: false, lateStop: null, lateMinutes: 0, mode: null })

  var [headsUpStop, setHeadsUpStop] = useState(null)
  var [headsUpEta, setHeadsUpEta] = useState(30)
  var [headsUpEtaIsCustom, setHeadsUpEtaIsCustom] = useState(false)  // toggles custom input
  var [headsUpSending, setHeadsUpSending] = useState(false)
  var [headsUpSent, setHeadsUpSent] = useState({})
  var [headsUpError, setHeadsUpError] = useState('')
  // Method = 'email' or 'sms' — same modal, two delivery paths
  var [headsUpMethod, setHeadsUpMethod] = useState('email')

  function openHeadsUp(stop) {
    setHeadsUpStop(stop)
    setHeadsUpEta(30)         // reset to default each time the modal opens
    setHeadsUpEtaIsCustom(false)
    setHeadsUpError('')
    setHeadsUpMethod('email')
  }

  // SMS variant — same modal flow, different send path (uses send-sms quota)
  function openHeadsUpSms(stop) {
    setHeadsUpStop(stop)
    setHeadsUpEta(30)
    setHeadsUpEtaIsCustom(false)
    setHeadsUpError('')
    setHeadsUpMethod('sms')
  }

  function closeHeadsUp() {
    if (headsUpSending) return  // don't allow close mid-send
    setHeadsUpStop(null)
    setHeadsUpError('')
  }

  // Send heads-up via email OR sms (controlled by headsUpMethod state).
  // Email uses send-heads-up-email; SMS uses send-sms (deducts from quota).
  async function sendHeadsUp() {
    if (!headsUpStop) return
    setHeadsUpSending(true)
    setHeadsUpError('')
    try {
      if (headsUpMethod === 'sms') {
        // ─── SMS path ───
        if (!headsUpStop.phone) {
          throw new Error('No phone number on file for this client')
        }
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not signed in')
        // Pull groomer's running_late template (with placeholder support) +
        // any context we need. Fall back to a sensible default.
        var { data: shop } = await supabase
          .from('shop_settings')
          .select('shop_name, sms_templates')
          .eq('groomer_id', user.id)
          .maybeSingle()
        var templates = (shop && shop.sms_templates) || {}
        var tpl = templates.running_late ||
          "Hi {client_first_name}! Just a heads up — I'm running about {minutes} minutes behind for {pet_name}'s {time} appointment. Thanks for your patience! — {shop_name}"
        var firstName = headsUpStop.firstName || headsUpStop.clientName || 'there'
        var petName = headsUpStop.petName || 'your pet'
        var timeLabel = headsUpStop.timeLabel || 'today'
        var shopName = (shop && shop.shop_name) || 'your groomer'
        var msg = tpl.replace(/\{(\w+)\}/g, function (_, k) {
          var vars = {
            client_first_name: firstName,
            pet_name: petName,
            time: timeLabel,
            minutes: headsUpEta,
            shop_name: shopName,
          }
          return vars[k] !== undefined ? vars[k] : ''
        })
        var { data: smsData, error: smsErr } = await supabase.functions.invoke('send-sms', {
          body: {
            to: headsUpStop.phone,
            message: msg,
            groomer_id: user.id,
            sms_type: 'running_late',
          },
        })
        if (smsErr) throw smsErr
        if (!smsData || !smsData.success) {
          throw new Error((smsData && smsData.error) || 'SMS failed')
        }
      } else {
        // ─── Email path (original) ───
        var payload = {
          eta_minutes: headsUpEta,
        }
        if (headsUpStop.type === 'grooming') {
          payload.appointment_id = headsUpStop.dbId
        } else {
          payload.boarding_reservation_id = headsUpStop.dbId
          payload.stop_type = headsUpStop.type   // 'boarding_dropoff' | 'boarding_pickup'
        }
        var { data, error } = await supabase.functions.invoke('send-heads-up-email', {
          body: payload,
        })
        if (error) throw error
        if (data && data.error) throw new Error(data.error)
      }

      // Mark this stop as sent — UI will swap the button to "✅ Sent" state
      setHeadsUpSent(function (prev) {
        var next = Object.assign({}, prev)
        next[headsUpStop.id] = { eta: headsUpEta, sentAt: new Date().toISOString(), method: headsUpMethod }
        return next
      })
      setHeadsUpStop(null)   // close the modal on success
    } catch (err) {
      console.error('[Route] heads-up send failed', err)
      setHeadsUpError(err.message || ('Could not send ' + headsUpMethod + '. Try again.'))
    } finally {
      setHeadsUpSending(false)
    }
  }

  useEffect(function () {
    loadRoute()
  }, [selectedDate])

  // Phase 6 — Load the late-warnings toggle from shop_settings once.
  // We fetch once on mount; if the user changes it in Settings, they need to
  // refresh the Route page to see the change. Acceptable trade-off (toggle
  // changes are rare) vs. polling shop_settings every render.
  useEffect(function () {
    ;(async () => {
      try {
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        var { data: shop } = await supabase
          .from('shop_settings')
          .select('late_warnings_enabled')
          .eq('groomer_id', user.id)
          .maybeSingle()
        setLateWarningsEnabled(!!(shop && shop.late_warnings_enabled))
      } catch (err) {
        console.warn('[Route] Could not load late_warnings_enabled:', err)
      }
    })()
  }, [])

  async function loadRoute() {
    setLoading(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      var today = selectedDate

      // 1. Today's grooming appointments — pull cached lat/lng so the map
      //    can render instantly without re-geocoding addresses.
      //    NEW: email pulled too so the Heads-up button knows who to email.
      //    NEW (Per-appt mobile flag): only is_mobile_visit=true appts come
      //    onto the Route. Storefront appts stay on the Calendar only.
      //    DOUBLE-LOCK: appointment_date EXACTLY equals TODAY's local date —
      //    no future dates leak in. (Tomorrow's appts must wait until tomorrow.)
      var { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, start_time, status, client_id, is_mobile_visit, is_mobile_pickup,
          clients:client_id(first_name, last_name, phone, email, address, address_notes, latitude, longitude),
          pets:pet_id(name),
          services:service_id(service_name)
        `)
        .eq('groomer_id', user.id)
        .eq('appointment_date', today)
        // Include BOTH mobile types: mobile visits (groom at home) AND mobile
        // pickups (drive to client, pick up, groom at shop, drop off). Both
        // require driving to the client, so both belong on the route.
        .or('is_mobile_visit.eq.true,is_mobile_pickup.eq.true')
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })

      if (apptErr) throw apptErr

      // 2. Today's boarding drop-offs (start_date = today)
      //    Mobile-only: storefront drop-offs at the salon don't belong on the route.
      var { data: dropoffs } = await supabase
        .from('boarding_reservations')
        .select(`
          id, start_date, end_date, start_time, end_time, status, client_id, is_mobile_visit,
          clients:client_id(first_name, last_name, phone, email, address, address_notes, latitude, longitude)
        `)
        .eq('groomer_id', user.id)
        .eq('start_date', today)
        .eq('is_mobile_visit', true)
        .neq('status', 'cancelled')

      // 3. Today's boarding pickups (end_date = today)
      //    Mobile-only: storefront pickups happen at the salon, not on the route.
      var { data: pickups } = await supabase
        .from('boarding_reservations')
        .select(`
          id, start_date, end_date, start_time, end_time, status, client_id, is_mobile_visit,
          clients:client_id(first_name, last_name, phone, email, address, address_notes, latitude, longitude)
        `)
        .eq('groomer_id', user.id)
        .eq('end_date', today)
        .eq('is_mobile_visit', true)
        .neq('status', 'cancelled')

      // 4. Combine into a single sorted stop list
      var combined = []

      // Build a stop object. clientId + cached lat/lng included so RouteMap
      // can skip the geocode call when we already have coords from a prior visit.
      // dbId + clientEmail added so the Heads-up email button can address the
      // right appointment + email the right client.
      function makeStop(opts) {
        var client = opts.client || {}
        if (!client.address) return null
        return {
          id: opts.id,           // prefixed string for React keys ('appt-123')
          dbId: opts.dbId,       // raw db UUID for edge function calls
          type: opts.type,
          time: opts.time,
          timeLabel: opts.timeLabel,
          status: opts.status,
          address: client.address,
          addressNotes: client.address_notes || '',
          phone: client.phone,
          clientId: opts.clientId,
          clientEmail: client.email || '',  // empty if client has no email yet
          // Cached coords from clients table (null if not yet geocoded)
          lat: client.latitude != null ? parseFloat(client.latitude) : null,
          lng: client.longitude != null ? parseFloat(client.longitude) : null,
          clientName: [client.first_name, client.last_name].filter(Boolean).join(' '),
          firstName: client.first_name || '',
          petName: opts.petName,
          serviceName: opts.serviceName,
          label: opts.label,
        }
      }

      ;(appts || []).forEach(function (a) {
        var client = a.clients || {}
        // Mobile pickups get a 🚐 marker so they read differently from a
        // groom-at-home mobile visit on the route list.
        var isPickup = a.is_mobile_pickup === true
        var nameStr = [client.first_name, client.last_name].filter(Boolean).join(' ')
        var stop = makeStop({
          id: 'appt-' + a.id,
          dbId: a.id,
          type: 'grooming',
          time: a.start_time,
          timeLabel: fmtTime(a.start_time) + (isPickup ? ' · 🚐 pickup' : ''),
          status: a.status,
          client: client,
          clientId: a.client_id,
          petName: a.pets && a.pets.name,
          serviceName: a.services && a.services.service_name,
          label: (isPickup ? '🚐 ' : '') +
                 (a.pets && a.pets.name ? a.pets.name + ' · ' : '') + nameStr,
        })
        if (stop) combined.push(stop)
      })

      ;(dropoffs || []).forEach(function (b) {
        var client = b.clients || {}
        var stop = makeStop({
          id: 'dropoff-' + b.id,
          dbId: b.id,
          type: 'boarding_dropoff',
          time: b.start_time || '08:00:00',
          timeLabel: fmtTime(b.start_time || '08:00:00') + ' · drop-off',
          status: b.status,
          client: client,
          clientId: b.client_id,
          label: '🏠 Drop-off · ' + [client.first_name, client.last_name].filter(Boolean).join(' '),
        })
        if (stop) combined.push(stop)
      })

      ;(pickups || []).forEach(function (b) {
        var client = b.clients || {}
        var stop = makeStop({
          id: 'pickup-' + b.id,
          dbId: b.id,
          type: 'boarding_pickup',
          time: b.end_time || '12:00:00',
          timeLabel: fmtTime(b.end_time || '12:00:00') + ' · pick-up',
          status: b.status,
          client: client,
          clientId: b.client_id,
          label: '🏠 Pick-up · ' + [client.first_name, client.last_name].filter(Boolean).join(' '),
        })
        if (stop) combined.push(stop)
      })

      // Sort by time within the day
      combined.sort(function (a, b) { return (a.time || '').localeCompare(b.time || '') })

      setStops(combined)
    } catch (err) {
      console.error('[Route] load error', err)
      setError(err.message || 'Could not load today\'s route')
    } finally {
      setLoading(false)
    }
  }

  // Render whichever order is active — optimized takes precedence over time
  var displayStops = optimizedStops || stops

  // Open Google Maps multi-stop nav for ALL today's addresses in order
  function startRoute() {
    if (displayStops.length === 0) return
    var addresses = displayStops.map(function (s) { return s.address }).filter(Boolean)
    var url = buildMultiStopUrl(addresses)
    if (url) window.open(url, '_blank')
  }

  // Run the optimizer. Costs ~1 Distance Matrix API call (very cheap).
  // Result reorders stops by shortest drive time. Toggle off → revert.
  async function handleOptimize() {
    if (optimizedStops) {
      // Already optimized — toggle back to original time-sorted order
      setOptimizedStops(null)
      setSavedMin(0)
      setOptimizeMsg('')
      return
    }
    setOptimizing(true)
    setOptimizeMsg('')
    var apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    var result = await optimizeRoute(stops, apiKey)
    setOptimizing(false)

    if (!result.ok) {
      setOptimizeMsg(result.reason || 'Could not optimize route.')
      return
    }
    // If no time was saved, just show that and don't reorder
    if (!result.savedSeconds || result.savedSeconds <= 0) {
      setOptimizeMsg(result.reason || 'Your current order is already optimal.')
      return
    }
    setOptimizedStops(result.stops)
    setSavedMin(Math.round(result.savedSeconds / 60))
    setOptimizeMsg('Optimized! Saves ~' + formatDriveTime(result.savedSeconds) + ' of drive time.')
  }

  // ─── Phase 3: Fill My Route ──────────────────────────────────────────────
  // Find active clients with NO upcoming appointment who live within ~5 miles
  // of any of today's stops, so the groomer can offer them a slot while already
  // in the area. Free — straight-line distance on cached lat/lng (no Maps API).
  var [fillCandidates, setFillCandidates] = useState(null)
  var [fillLoading, setFillLoading] = useState(false)
  var [fillSent, setFillSent] = useState({})
  var FILL_RADIUS_MI = 5

  function milesBetween(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
    var toRad = function (x) { return x * Math.PI / 180 }
    var R = 3958.8
    var dLat = toRad(lat2 - lat1)
    var dLng = toRad(lng2 - lng1)
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  async function findFillCandidates() {
    setFillLoading(true)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      var routePts = (displayStops || []).filter(function (s) { return s.lat != null && s.lng != null })
      if (routePts.length === 0) { setFillCandidates([]); return }
      var onRoute = {}
      routePts.forEach(function (s) { if (s.clientId) onRoute[s.clientId] = true })

      var today = todayLocalIso()
      var { data: clients } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, sms_consent, latitude, longitude, is_active')
        .eq('groomer_id', user.id)
      var { data: appts } = await supabase
        .from('appointments')
        .select('client_id, appointment_date, status, checked_out_at')
        .eq('groomer_id', user.id)

      var CLOSED = ['cancelled', 'no_show', 'rescheduled', 'completed', 'checked_out']
      var DEAD = ['cancelled', 'no_show', 'rescheduled']
      var meta = {}
      ;(appts || []).forEach(function (a) {
        if (!a.client_id || !a.appointment_date) return
        if (!meta[a.client_id]) meta[a.client_id] = { hasUpcoming: false, lastVisit: null }
        var m = meta[a.client_id]
        var open = a.checked_out_at == null && CLOSED.indexOf(a.status) === -1
        if (open && a.appointment_date >= today) m.hasUpcoming = true
        var served = DEAD.indexOf(a.status) === -1 && (a.checked_out_at != null || a.status === 'completed' || a.appointment_date < today)
        if (served && (!m.lastVisit || a.appointment_date > m.lastVisit)) m.lastVisit = a.appointment_date
      })

      var results = []
      ;(clients || []).forEach(function (c) {
        if (c.is_active === false) return
        if (onRoute[c.id]) return
        var m = meta[c.id] || {}
        if (m.hasUpcoming) return
        var lat = c.latitude != null ? parseFloat(c.latitude) : null
        var lng = c.longitude != null ? parseFloat(c.longitude) : null
        if (lat == null || lng == null) return
        var best = Infinity
        routePts.forEach(function (s) {
          var mi = milesBetween(lat, lng, s.lat, s.lng)
          if (mi != null && mi < best) best = mi
        })
        if (best <= FILL_RADIUS_MI) {
          results.push({
            id: c.id,
            name: [c.first_name, c.last_name].filter(Boolean).join(' '),
            firstName: c.first_name || '',
            phone: c.phone || null,
            sms_consent: c.sms_consent === true,
            lastVisit: m.lastVisit || null,
            miles: best,
          })
        }
      })
      results.sort(function (a, b) { return a.miles - b.miles })
      setFillCandidates(results)
    } catch (err) {
      console.error('[Route] findFillCandidates error', err)
      setFillCandidates([])
    } finally {
      setFillLoading(false)
    }
  }

  async function sendFillInvite(c) {
    if (!c.phone || !c.sms_consent) {
      window.alert(c.name + ' has no SMS consent or phone on file — can\'t text them.')
      return
    }
    var dayWord = (selectedDate === todayLocalIso())
      ? 'today'
      : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    var msg = 'Hi ' + (c.firstName || 'there') + "! I'm grooming in your area " + dayWord + ' and have an opening — want me to swing by? Reply to grab it! 🐾'
    if (!window.confirm('Text ' + c.name + ' at ' + c.phone + '?\n\n"' + msg + '"')) return
    try {
      var { data: { user } } = await supabase.auth.getUser()
      var { data: res, error } = await supabase.functions.invoke('send-sms', {
        body: { to: c.phone, message: msg, groomer_id: user.id, sms_type: 'manual' },
      })
      if (error || (res && res.success === false)) {
        window.alert('Could not text ' + c.name + ': ' + ((res && res.error) || (error && error.message) || 'SMS failed'))
        return
      }
      setFillSent(function (prev) { var n = Object.assign({}, prev); n[c.id] = true; return n })
    } catch (err) {
      window.alert('Could not text: ' + (err.message || err))
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#111827' }}>📍 Today's Route</h1>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading your route…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', margin: '0 0 6px', color: '#111827' }}>📍 Route</h1>
          {/* Date navigation — view any day's route, not just today */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <button onClick={function () { setSelectedDate(shiftDateIso(selectedDate, -1)) }} style={{ padding: '4px 11px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 700 }} title="Previous day">◀</button>
            <input type="date" value={selectedDate} onChange={function (e) { if (e.target.value) setSelectedDate(e.target.value) }} style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} />
            <button onClick={function () { setSelectedDate(shiftDateIso(selectedDate, 1)) }} style={{ padding: '4px 11px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 700 }} title="Next day">▶</button>
            {selectedDate !== todayLocalIso() && (
              <button onClick={function () { setSelectedDate(todayLocalIso()) }} style={{ padding: '4px 12px', border: '1px solid #7c3aed', borderRadius: '8px', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Today</button>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}
            <strong style={{ color: '#111827' }}>{stops.length} stop{stops.length === 1 ? '' : 's'}</strong>
            {optimizedStops && (
              <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 700 }}>
                · 🧠 Optimized (saves {savedMin} min)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* Optimize Route — re-orders stops by shortest drive.
              Disabled until the Maps JS SDK finishes loading (otherwise the
              DistanceMatrixService call would fail with "google is not defined"). */}
          {stops.length >= 3 && (
            <button
              onClick={handleOptimize}
              disabled={optimizing || !mapsLoaded}
              style={{
                padding: '12px 16px',
                background: optimizedStops ? '#7c3aed' : '#fff',
                color: optimizedStops ? '#fff' : '#7c3aed',
                border: '1px solid #7c3aed',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: (optimizing || !mapsLoaded) ? 'wait' : 'pointer',
                opacity: (optimizing || !mapsLoaded) ? 0.6 : 1,
              }}
              title={
                !mapsLoaded ? 'Loading map services…' :
                optimizedStops ? 'Click to revert to time order' :
                'Reorder by shortest drive'
              }
            >
              {!mapsLoaded ? '⏳ Loading…' :
               optimizing ? '🧠 Optimizing…' :
               optimizedStops ? '↩️ Revert to Time Order' :
               '🧠 Optimize Route'}
            </button>
          )}

          {/* Print — paper backup for when phone dies mid-route. Opens a clean
              print-friendly window with addresses, phones, and gate-code notes. */}
          {displayStops.length > 0 && (
            <button
              onClick={function () {
                printRouteSheet(displayStops, {
                  shopName: 'Today\'s Route',
                  isOptimized: !!optimizedStops,
                  savedSeconds: savedMin * 60,
                })
              }}
              style={{
                padding: '12px 16px',
                background: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
              }}
              title="Print a paper backup of today's route"
            >
              🖨️ Print
            </button>
          )}

          {/* Start Route — opens Google Maps with the whole day queued up */}
          {displayStops.length > 0 && (
            <button
              onClick={startRoute}
              style={{
                padding: '12px 20px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
              }}
            >
              🚗 Start Route — {displayStops.length} stop{displayStops.length === 1 ? '' : 's'}
            </button>
          )}

          {/* Phase 3 — Fill My Route: find nearby clients with nothing booked */}
          {displayStops.length > 0 && (
            <button
              onClick={findFillCandidates}
              disabled={fillLoading}
              style={{
                padding: '12px 16px',
                background: '#fff',
                color: '#7c3aed',
                border: '1px solid #7c3aed',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: fillLoading ? 'wait' : 'pointer',
                opacity: fillLoading ? 0.6 : 1,
              }}
              title="Find nearby clients who have nothing booked"
            >
              {fillLoading ? '🔍 Finding…' : '🧲 Fill My Route'}
            </button>
          )}
        </div>
      </div>

      {/* Phase 3 — Fill My Route results: nearby no-upcoming clients + text invite */}
      {fillCandidates !== null && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            🧲 Nearby clients to fill your route
            {fillCandidates.length > 0 ? ' — ' + fillCandidates.length + ' within ' + FILL_RADIUS_MI + ' mi' : ''}
          </div>
          {fillCandidates.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '13px' }}>
              No clients without an upcoming appointment within {FILL_RADIUS_MI} miles of today's stops.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fillCandidates.map(function (c) {
                var canText = !!(c.phone && c.sms_consent)
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {c.miles.toFixed(1)} mi away
                        {c.lastVisit ? ' · last visit ' + c.lastVisit : ' · no prior visit'}
                        {!c.sms_consent ? ' · no SMS consent' : ''}
                      </div>
                    </div>
                    {fillSent[c.id] ? (
                      <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>✓ Texted</span>
                    ) : (
                      <button
                        onClick={function () { sendFillInvite(c) }}
                        disabled={!canText}
                        style={{
                          padding: '7px 12px',
                          background: canText ? '#10b981' : '#e5e7eb',
                          color: canText ? '#fff' : '#9ca3af',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: canText ? 'pointer' : 'not-allowed',
                          whiteSpace: 'nowrap',
                        }}
                        title={canText ? 'Text an invite' : 'No SMS consent or phone on file'}
                      >
                        📱 Text invite
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Phase 6 — Running Late banner. Renders nothing if toggle is off
          OR if the groomer is on schedule. When late, shows a yellow banner
          with Email + Call action buttons and exposes lateState so we can
          render per-stop badges below. */}
      {selectedDate === todayLocalIso() && (
        <LateDetector
          stops={displayStops}
          enabled={lateWarningsEnabled}
          onSendHeadsUp={openHeadsUp}
          onSendHeadsUpSms={openHeadsUpSms}
          onChange={setLateState}
        />
      )}

      {/* Optimizer message banner — savings or "couldn't optimize" reason */}
      {optimizeMsg && (
        <div style={{
          padding: '10px 14px',
          background: optimizedStops ? '#dcfce7' : '#fef3c7',
          border: '1px solid ' + (optimizedStops ? '#86efac' : '#fcd34d'),
          borderRadius: '8px',
          color: optimizedStops ? '#166534' : '#92400e',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          {optimizedStops ? '🧠 ' : '⚠️ '} {optimizeMsg}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!error && stops.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#6b7280' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🌤️</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', color: '#111827' }}>No stops today</div>
          <div style={{ fontSize: '13px' }}>Enjoy the day off, or check the calendar for upcoming bookings.</div>
        </div>
      )}

      {/* Map + list when there are stops */}
      {displayStops.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
          <RouteMap stops={displayStops} height="450px" />

          {/* Stops list */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            {displayStops.map(function (s, idx) {
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 16px',
                  borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                }}>
                  {/* Number badge */}
                  <div style={{
                    flexShrink: 0,
                    width: '32px', height: '32px',
                    borderRadius: '50%',
                    background: s.type === 'grooming' ? '#3b82f6' :
                                s.type === 'boarding_pickup' ? '#10b981' :
                                '#7c3aed',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '13px',
                  }}>
                    {idx + 1}
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                      {s.label}
                      {/* Phase 6 — per-stop late badge. Shows next to the
                          stop label so the groomer can scan their list and
                          immediately see WHICH stop they're behind on. */}
                      {lateState.isLate && lateState.lateStop && lateState.lateStop.id === s.id && (
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 8px',
                          background: '#fef3c7',
                          border: '1px solid #f59e0b',
                          borderRadius: '6px',
                          color: '#92400e',
                          fontSize: '11px',
                          fontWeight: 800,
                          verticalAlign: 'middle',
                        }}>
                          ⏰ {lateState.lateMinutes >= 60
                            ? Math.floor(lateState.lateMinutes / 60) + ' hr ' + (lateState.lateMinutes % 60 ? (lateState.lateMinutes % 60) + ' min' : '')
                            : lateState.lateMinutes + ' min'} late
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {s.timeLabel}
                      {s.serviceName && ' · ' + s.serviceName}
                    </div>
                    {s.address && (
                      <a
                        href={mapsUrl(s.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: '#7c3aed', textDecoration: 'none', display: 'block', marginTop: '4px' }}
                        title="Tap for directions"
                      >
                        🏠 {s.address}
                      </a>
                    )}
                    {/* Address notes — gate codes, parking tips, etc. Shows
                        in a yellow callout so it grabs attention at-a-glance */}
                    {s.addressNotes && (
                      <div style={{
                        marginTop: '6px',
                        padding: '6px 10px',
                        background: '#fef9c3',
                        border: '1px solid #fde047',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#854d0e',
                        fontWeight: 500,
                      }}>
                        📍 {s.addressNotes}
                      </div>
                    )}

                    {/* Send Heads-Up — primary button, easy to find on phone.
                        Only shows if the client has an email on file. After
                        success, swaps to a green "✅ Sent" state with the ETA
                        baked in so you can see at-a-glance what you sent. */}
                    {s.clientEmail && (
                      <button
                        onClick={function () { openHeadsUp(s) }}
                        style={{
                          marginTop: '10px',
                          width: '100%',
                          padding: '10px 14px',
                          background: headsUpSent[s.id] ? '#dcfce7' : '#f5f3ff',
                          color: headsUpSent[s.id] ? '#166534' : '#7c3aed',
                          border: '1px solid ' + (headsUpSent[s.id] ? '#86efac' : '#ddd6fe'),
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                        title={headsUpSent[s.id] ? 'Click to send another' : 'Email client your ETA'}
                      >
                        {headsUpSent[s.id]
                          ? '✅ Heads-up sent (' + headsUpSent[s.id].eta + ' min ETA)'
                          : '📧 Send heads-up email'}
                      </button>
                    )}

                    {/* Navigate to THIS stop — each stop routes to its OWN
                        address, so there's no "next vs first" confusion. You
                        work the list top to bottom: tap stop 1's button, do it,
                        then tap stop 2's. */}
                    {s.address && (
                      <a
                        href={mapsUrl(s.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open GPS to this stop"
                        style={{
                          marginTop: '8px',
                          display: 'block',
                          width: '100%',
                          padding: '10px 14px',
                          background: '#4f46e5',
                          color: '#fff',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '13px',
                          textAlign: 'center',
                          textDecoration: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        🧭 Navigate to {s.firstName || s.clientName || 'this stop'}
                      </a>
                    )}
                  </div>

                  {/* Quick actions — call + nav */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {s.phone && (
                      <a
                        href={telUrl(s.phone)}
                        title="Call"
                        style={{
                          padding: '8px 10px',
                          background: '#f3f4f6',
                          color: '#374151',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        📞
                      </a>
                    )}
                    {s.address && (
                      <a
                        href={mapsUrl(s.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Directions"
                        style={{
                          padding: '8px 10px',
                          background: '#7c3aed',
                          color: '#fff',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        🗺️
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#6b7280', padding: '8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
              Grooming
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }}></span>
              Boarding drop-off
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              Boarding pick-up
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          Heads-Up Email Confirmation Modal
          ===================================================================
          Tap-then-confirm flow per design Q1=B (prevents accidental sends).
          ETA dropdown defaults to 30 min per Q2=C with override (15/30/45/60).
          Modal closes automatically on successful send.
          =================================================================== */}
      {headsUpStop && (
        <div
          onClick={closeHeadsUp}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            onClick={function (e) { e.stopPropagation() }}
            style={{
              background: '#fff',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '8px' }}>
              {headsUpMethod === 'sms' ? '📱' : '📧'}
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', textAlign: 'center', margin: '0 0 4px' }}>
              {headsUpMethod === 'sms' ? 'Send heads-up text?' : 'Send heads-up email?'}
            </h2>
            <div style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', marginBottom: '18px' }}>
              To <strong style={{ color: '#111827' }}>{headsUpStop.firstName || headsUpStop.clientName || 'client'}</strong>
              {headsUpMethod === 'sms' && headsUpStop.phone && (
                <span> · {headsUpStop.phone}</span>
              )}
              {headsUpMethod === 'email' && headsUpStop.clientEmail && (
                <span> · {headsUpStop.clientEmail}</span>
              )}
            </div>

            {/* Stop info preview */}
            <div style={{
              padding: '12px 14px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#374151',
            }}>
              <div style={{ fontWeight: 600, color: '#111827' }}>{headsUpStop.label}</div>
              <div style={{ marginTop: '2px', color: '#6b7280' }}>{headsUpStop.timeLabel}</div>
              {headsUpStop.address && (
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#7c3aed' }}>
                  {headsUpStop.address}
                </div>
              )}
            </div>

            {/* ETA dropdown — smart default 30, with override + custom for
                anything over an hour. Custom mode reveals a number input so
                groomers stuck across town (or pulling a long lunch) can type
                a real ETA instead of just guessing "1 hour". */}
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              ETA — when will you arrive?
            </label>
            <select
              value={headsUpEtaIsCustom ? 'custom' : headsUpEta}
              onChange={function (e) {
                if (e.target.value === 'custom') {
                  setHeadsUpEtaIsCustom(true)
                  setHeadsUpEta(75)   // sensible starting point for "over 1 hour"
                } else {
                  setHeadsUpEtaIsCustom(false)
                  setHeadsUpEta(parseInt(e.target.value, 10))
                }
              }}
              disabled={headsUpSending}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                background: '#fff',
                color: '#111827',
                marginBottom: headsUpEtaIsCustom ? '8px' : '16px',
              }}
            >
              <option value={15}>In about 15 minutes</option>
              <option value={30}>In about 30 minutes</option>
              <option value={45}>In about 45 minutes</option>
              <option value={60}>In about 1 hour</option>
              <option value="custom">Custom (over 1 hour)…</option>
            </select>

            {/* Custom minutes input — only renders when "Custom" is selected.
                Range 60-300 covers 1-5 hours which is plenty for any groomer
                stuck on the wrong side of town. Step 15 makes it click-friendly. */}
            {headsUpEtaIsCustom && (
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="number"
                  min={60}
                  max={300}
                  step={15}
                  value={headsUpEta}
                  onChange={function (e) {
                    var v = parseInt(e.target.value, 10) || 60
                    if (v < 60) v = 60
                    if (v > 300) v = 300
                    setHeadsUpEta(v)
                  }}
                  disabled={headsUpSending}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    background: '#fff',
                    color: '#111827',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                  Minutes (60-300). Email will say "in about {Math.floor(headsUpEta / 60)} hour{Math.floor(headsUpEta / 60) === 1 ? '' : 's'}{headsUpEta % 60 > 0 ? ' ' + (headsUpEta % 60) + ' min' : ''}"
                </div>
              </div>
            )}

            {/* Error message */}
            {headsUpError && (
              <div style={{
                padding: '10px 12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#991b1b',
                fontSize: '12px',
                marginBottom: '12px',
              }}>
                {headsUpError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={closeHeadsUp}
                disabled={headsUpSending}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: '#fff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: headsUpSending ? 'not-allowed' : 'pointer',
                  opacity: headsUpSending ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={sendHeadsUp}
                disabled={headsUpSending}
                style={{
                  flex: 2,
                  padding: '11px',
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: headsUpSending ? 'wait' : 'pointer',
                  opacity: headsUpSending ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
                }}
              >
                {headsUpSending ? 'Sending…' : (headsUpMethod === 'sms' ? '📱 Send text' : '📧 Send email')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}