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
import { supabase } from '../lib/supabase'
import { mapsUrl, telUrl, formatAddress } from '../lib/maps'
import { formatPhone } from '../lib/phone'
import RouteMap from '../components/RouteMap'

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

export default function Route() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [stops, setStops] = useState([])
  var [error, setError] = useState('')

  useEffect(function () {
    loadRoute()
  }, [])

  async function loadRoute() {
    setLoading(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      var today = todayLocalIso()

      // 1. Today's grooming appointments — pull cached lat/lng so the map
      //    can render instantly without re-geocoding addresses.
      var { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, start_time, status, client_id,
          clients:client_id(first_name, last_name, phone, address, address_notes, latitude, longitude),
          pets:pet_id(name),
          services:service_id(service_name)
        `)
        .eq('groomer_id', user.id)
        .eq('appointment_date', today)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })

      if (apptErr) throw apptErr

      // 2. Today's boarding drop-offs (start_date = today)
      var { data: dropoffs } = await supabase
        .from('boarding_reservations')
        .select(`
          id, start_date, end_date, start_time, end_time, status, client_id,
          clients:client_id(first_name, last_name, phone, address, address_notes, latitude, longitude)
        `)
        .eq('groomer_id', user.id)
        .eq('start_date', today)
        .neq('status', 'cancelled')

      // 3. Today's boarding pickups (end_date = today)
      var { data: pickups } = await supabase
        .from('boarding_reservations')
        .select(`
          id, start_date, end_date, start_time, end_time, status, client_id,
          clients:client_id(first_name, last_name, phone, address, address_notes, latitude, longitude)
        `)
        .eq('groomer_id', user.id)
        .eq('end_date', today)
        .neq('status', 'cancelled')

      // 4. Combine into a single sorted stop list
      var combined = []

      // Build a stop object. clientId + cached lat/lng included so RouteMap
      // can skip the geocode call when we already have coords from a prior visit.
      function makeStop(opts) {
        var client = opts.client || {}
        if (!client.address) return null
        return {
          id: opts.id,
          type: opts.type,
          time: opts.time,
          timeLabel: opts.timeLabel,
          status: opts.status,
          address: client.address,
          addressNotes: client.address_notes || '',
          phone: client.phone,
          clientId: opts.clientId,
          // Cached coords from clients table (null if not yet geocoded)
          lat: client.latitude != null ? parseFloat(client.latitude) : null,
          lng: client.longitude != null ? parseFloat(client.longitude) : null,
          clientName: [client.first_name, client.last_name].filter(Boolean).join(' '),
          petName: opts.petName,
          serviceName: opts.serviceName,
          label: opts.label,
        }
      }

      ;(appts || []).forEach(function (a) {
        var client = a.clients || {}
        var stop = makeStop({
          id: 'appt-' + a.id,
          type: 'grooming',
          time: a.start_time,
          timeLabel: fmtTime(a.start_time),
          status: a.status,
          client: client,
          clientId: a.client_id,
          petName: a.pets && a.pets.name,
          serviceName: a.services && a.services.service_name,
          label: (a.pets && a.pets.name ? a.pets.name + ' · ' : '') +
                 [client.first_name, client.last_name].filter(Boolean).join(' '),
        })
        if (stop) combined.push(stop)
      })

      ;(dropoffs || []).forEach(function (b) {
        var client = b.clients || {}
        var stop = makeStop({
          id: 'dropoff-' + b.id,
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

  // Open Google Maps multi-stop nav for ALL today's addresses in order
  function startRoute() {
    if (stops.length === 0) return
    var addresses = stops.map(function (s) { return s.address }).filter(Boolean)
    var url = buildMultiStopUrl(addresses)
    if (url) window.open(url, '_blank')
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
          <h1 style={{ fontSize: '22px', margin: '0 0 4px', color: '#111827' }}>📍 Today's Route</h1>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}
            <strong style={{ color: '#111827' }}>{stops.length} stop{stops.length === 1 ? '' : 's'}</strong>
          </div>
        </div>

        {/* Start Route — opens Google Maps with the whole day queued up */}
        {stops.length > 0 && (
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
            🚗 Start Route — {stops.length} stop{stops.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

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
      {stops.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
          <RouteMap stops={stops} height="450px" />

          {/* Stops list */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            {stops.map(function (s, idx) {
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
    </div>
  )
}
