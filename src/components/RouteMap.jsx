// =============================================================================
// RouteMap.jsx — Leaflet-based map showing today's stops as numbered pins.
// =============================================================================
// Uses Leaflet + OpenStreetMap (free, no API key). Pins are color-coded by
// status: confirmed=blue, pending=yellow, checked-in=green, completed=gray,
// boarding=purple. Each pin tooltips with client + pet + service + time.
//
// We geocode addresses on the fly using OpenStreetMap's Nominatim API
// (also free, no key, but rate-limited to 1 request/sec — fine for shops
// with <60 stops/day). Geocoded coords are cached in component state so
// we don't re-look-up the same address on every re-render.
//
// Props:
//   • stops: array of { id, address, label, time, status, type } where:
//       - address: string for geocoding
//       - label: short display ("Buddy · Susan T.")
//       - time: ISO time string
//       - status: 'confirmed' | 'pending' | 'checked_in' | 'completed' | etc.
//       - type: 'grooming' | 'boarding_dropoff' | 'boarding_pickup'
//   • height: optional CSS height (default '500px')
// =============================================================================
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'

// Default Leaflet marker icons broken in bundlers — we override with CDN URLs.
// Without this, you get a tiny broken-image icon on every pin.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Status → marker color (we use a colored circle div as a custom icon so
// the pin matches the status pill on the calendar).
function statusColor(status) {
  switch (status) {
    case 'confirmed':   return '#3b82f6'  // blue
    case 'checked_in':  return '#10b981'  // green
    case 'completed':   return '#6b7280'  // gray
    case 'pending':     return '#f59e0b'  // amber
    case 'cancelled':   return '#ef4444'  // red
    default:            return '#7c3aed'  // purple (boarding fallback)
  }
}

// Build a big, highly-visible numbered pin. Sized for outdoor use on a phone
// where small pins disappear at glance speed. Uses a teardrop shape pointing
// down so the tip sits exactly on the coordinate.
function makePinIcon(number, color) {
  return L.divIcon({
    className: 'route-pin',
    html:
      '<div style="' +
        'position:relative; ' +
        'width:44px; height:54px; ' +
        'filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4));' +
      '">' +
        // Pin body — SVG teardrop for crisp edges
        '<svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg" style="position:absolute; top:0; left:0;">' +
          '<path d="M22 0 C9.85 0 0 9.85 0 22 C0 35 22 54 22 54 C22 54 44 35 44 22 C44 9.85 34.15 0 22 0 Z" ' +
                'fill="' + color + '" stroke="#fff" stroke-width="3"/>' +
        '</svg>' +
        // Number on top of pin
        '<div style="' +
          'position:absolute; top:8px; left:0; width:44px; height:30px; ' +
          'display:flex; align-items:center; justify-content:center; ' +
          'color:#fff; font-weight:900; font-size:18px; ' +
          'text-shadow:0 1px 2px rgba(0,0,0,0.4);' +
        '">' + number + '</div>' +
      '</div>',
    iconSize: [44, 54],
    iconAnchor: [22, 54],  // tip of the pin sits exactly on the coordinate
    popupAnchor: [0, -50],
  })
}

// Clean up address string for better geocoding hits. People type addresses
// in many ways — "13623 barons lake in cypress tx", "13623 Barons Lake Ln,
// Cypress, TX 77429", etc. Nominatim does best with comma-separated parts.
function normalizeAddressForGeocode(raw) {
  if (!raw) return ''
  return String(raw)
    // " in " → ", " (so "barons lake in cypress" becomes "barons lake, cypress")
    .replace(/\s+in\s+/gi, ', ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
}

// Build a list of candidate query strings to try in order. People often skip
// the street suffix ("Lane"/"Drive"/etc) which makes OpenStreetMap fail.
// We try the original first, then progressively add common suffixes as a
// fallback so groomers don't have to retype their existing client list.
function geocodeCandidates(rawAddress) {
  var clean = normalizeAddressForGeocode(rawAddress)
  if (!clean) return []
  var candidates = [clean]

  // If there's no obvious suffix already, try adding common ones before the city.
  // We split at the FIRST comma to insert suffix between street and city.
  var hasSuffix = /\b(lane|ln|drive|dr|street|st|road|rd|avenue|ave|boulevard|blvd|court|ct|way|circle|cir|parkway|pkwy|trail|trl|terrace|ter|place|pl)\b/i.test(clean)
  if (!hasSuffix && clean.indexOf(',') > 0) {
    var firstComma = clean.indexOf(',')
    var streetPart = clean.substring(0, firstComma).trim()
    var cityPart = clean.substring(firstComma).trim()
    var suffixes = ['Lane', 'Drive', 'Street', 'Road', 'Court', 'Way', 'Boulevard']
    suffixes.forEach(function (sfx) {
      candidates.push(streetPart + ' ' + sfx + ' ' + cityPart)
    })
  }
  return candidates
}

// Geocode an address using Google Maps Geocoding API. Reliable for any US
// address (~99% hit rate vs OSM's ~70% in newer subdivisions).
// Falls back to OpenStreetMap if Google is missing/misconfigured.
//
// Reads VITE_GOOGLE_MAPS_API_KEY from env (set in .env.local + Vercel).
// API key is restricted by HTTP referrer in Google Cloud, so safe in client.
async function geocodeAddress(address) {
  var clean = normalizeAddressForGeocode(address)
  if (!clean) return null

  var googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // ─── Try Google first (best accuracy) ────────────────────────────────
  if (googleKey) {
    try {
      var url = 'https://maps.googleapis.com/maps/api/geocode/json' +
        '?address=' + encodeURIComponent(clean) +
        '&key=' + googleKey
      var res = await fetch(url)
      if (res.ok) {
        var data = await res.json()
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          var loc = data.results[0].geometry.location
          var coord = { lat: loc.lat, lng: loc.lng }
          console.log('[RouteMap] Google geocoded "' + clean + '" →', coord,
            '(formatted:', data.results[0].formatted_address, ')')
          return coord
        }
        if (data.status === 'ZERO_RESULTS') {
          console.warn('[RouteMap] Google: no result for "' + clean + '"')
        } else if (data.status === 'REQUEST_DENIED') {
          console.error('[RouteMap] Google REQUEST_DENIED — check API key restrictions:', data.error_message)
        } else {
          console.warn('[RouteMap] Google geocode status:', data.status, data.error_message || '')
        }
      } else {
        console.warn('[RouteMap] Google HTTP error', res.status)
      }
    } catch (err) {
      console.warn('[RouteMap] Google geocode threw:', err)
    }
  } else {
    console.warn('[RouteMap] VITE_GOOGLE_MAPS_API_KEY not set — falling back to OpenStreetMap')
  }

  // ─── Fallback to OSM (free, no key, less reliable) ───────────────────
  // Only runs if Google failed/missing. Tries multiple suffix variations.
  var candidates = geocodeCandidates(address)
  for (var i = 0; i < candidates.length; i++) {
    var attempt = candidates[i]
    try {
      var osmUrl = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
        encodeURIComponent(attempt)
      var osmRes = await fetch(osmUrl, { headers: { 'Accept': 'application/json' } })
      if (!osmRes.ok) continue
      var osmData = await osmRes.json()
      if (osmData && osmData.length > 0) {
        var osmCoord = { lat: parseFloat(osmData[0].lat), lng: parseFloat(osmData[0].lon) }
        console.log('[RouteMap] OSM fallback geocoded "' + attempt + '" →', osmCoord)
        return osmCoord
      }
    } catch (err) {
      console.warn('[RouteMap] OSM threw for', attempt, err)
    }
    if (i < candidates.length - 1) await new Promise(function (r) { setTimeout(r, 1100) })
  }

  console.warn('[RouteMap] Geocode FAILED for: "' + address + '"')
  return null
}

// Auto-fit the map to show all loaded pins. Runs whenever the pin list changes.
function FitBounds({ points }) {
  var map = useMap()
  useEffect(function () {
    if (!points || points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13)
      return
    }
    var bounds = L.latLngBounds(points.map(function (p) { return [p.lat, p.lng] }))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [points, map])
  return null
}

export default function RouteMap({ stops, height }) {
  // Map of address string → { lat, lng } once geocoded.
  // Persisted across re-renders within this component instance only.
  var [coords, setCoords] = useState({})
  var [geocoding, setGeocoding] = useState(false)
  var rateLimitTimer = useRef(0)

  // Two-tier coord resolution:
  //   1. CACHED — stops already carry lat/lng from clients.latitude/longitude.
  //      No API call, instant render.
  //   2. FRESH — for stops missing coords, geocode via Google → write
  //      coords back to clients table (so next page load is instant).
  // Map any clientId → its address so we can update the right rows after
  // a successful geocode.
  useEffect(function () {
    var cancelled = false

    async function run() {
      // Pre-fill local state with already-cached coords from the stops payload
      var prefill = {}
      var addressToClientIds = {}  // address → list of client_id's that share it
      stops.forEach(function (s) {
        if (s.address && s.lat != null && s.lng != null) {
          prefill[s.address] = { lat: s.lat, lng: s.lng }
        }
        if (s.address && s.clientId) {
          if (!addressToClientIds[s.address]) addressToClientIds[s.address] = []
          if (addressToClientIds[s.address].indexOf(s.clientId) === -1) {
            addressToClientIds[s.address].push(s.clientId)
          }
        }
      })
      if (Object.keys(prefill).length > 0) {
        setCoords(function (prev) { return Object.assign({}, prev, prefill) })
      }

      // Find addresses still missing coords (need to geocode)
      var unique = []
      var seen = {}
      stops.forEach(function (s) {
        if (s.address && !seen[s.address] && !prefill[s.address] && !coords[s.address]) {
          seen[s.address] = true
          unique.push(s.address)
        }
      })
      if (unique.length === 0) return

      setGeocoding(true)
      // Geocode all missing addresses in parallel
      var results = await Promise.all(unique.map(function (addr) {
        return geocodeAddress(addr).then(function (r) { return { addr: addr, coord: r } })
      }))
      if (cancelled) return

      // Merge fresh results into local state for immediate render
      setCoords(function (prev) {
        var next = Object.assign({}, prev)
        results.forEach(function (r) { if (r.coord) next[r.addr] = r.coord })
        return next
      })

      // ─── Cache back to DB ─────────────────────────────────────────────
      // Save successful geocodes to clients table so future page loads
      // skip the API call. Fire-and-forget — failures here aren't user-facing.
      results.forEach(function (r) {
        if (!r.coord) return
        var clientIds = addressToClientIds[r.addr]
        if (!clientIds || clientIds.length === 0) return
        clientIds.forEach(function (cid) {
          supabase
            .from('clients')
            .update({
              latitude: r.coord.lat,
              longitude: r.coord.lng,
              coords_geocoded_at: new Date().toISOString(),
            })
            .eq('id', cid)
            .then(function (res) {
              if (res.error) {
                console.warn('[RouteMap] Could not cache coords to client', cid, res.error.message)
              } else {
                console.log('[RouteMap] Cached coords to client', cid, '→', r.coord)
              }
            })
        })
      })

      if (!cancelled) setGeocoding(false)
    }
    run()

    return function () { cancelled = true }
  }, [stops])

  // Stops resolved to coordinates. When multiple stops share the same
  // address (back-to-back at the same house, or a test environment with
  // every stop at one address), we offset duplicates very slightly so the
  // pins fan out and stay individually visible/clickable.
  var addressUseCount = {}
  var pins = stops
    .map(function (s, idx) {
      var c = coords[s.address]
      if (!c) return null
      var seen = addressUseCount[s.address] || 0
      addressUseCount[s.address] = seen + 1
      // ~5 meters per duplicate, fanned in a small circle
      var offsetLat = c.lat + Math.sin(seen * 1.2) * 0.00006 * seen
      var offsetLng = c.lng + Math.cos(seen * 1.2) * 0.00006 * seen
      return Object.assign({}, s, { lat: offsetLat, lng: offsetLng, number: idx + 1 })
    })
    .filter(Boolean)

  if (stops.length === 0) {
    return (
      <div style={{
        height: height || '500px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
        color: '#6b7280', fontSize: '14px',
      }}>
        🗺️ No stops today
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[29.97, -95.69]}  // Cypress, TX default — auto-fit overrides
        zoom={11}
        style={{
          height: height || '500px',
          width: '100%',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map(function (p) {
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={makePinIcon(p.number, statusColor(p.status))}
            >
              <Popup>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{p.number}. {p.label}</div>
                {p.time && <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.time}</div>}
                {p.address && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{p.address}</div>}
                {/* Address notes — gate codes, parking tips. Shown in a
                    bright yellow box inside the popup so groomer notices */}
                {p.addressNotes && (
                  <div style={{
                    marginTop: '6px',
                    padding: '6px 8px',
                    background: '#fef9c3',
                    border: '1px solid #fde047',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#854d0e',
                    fontWeight: 600,
                  }}>
                    📍 {p.addressNotes}
                  </div>
                )}
              </Popup>
            </Marker>
          )
        })}
        <FitBounds points={pins} />
      </MapContainer>

      {/* Geocoding indicator — shown while we're looking up addresses */}
      {geocoding && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '6px 12px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '999px',
          fontSize: '11px',
          color: '#374151',
          fontWeight: 600,
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          zIndex: 1000,
        }}>
          📍 Loading {stops.length - pins.length} more…
        </div>
      )}

      {/* Address-not-found warning — when geocoding finished but pins < stops.
          Tells the groomer which client addresses need to be fixed for routing. */}
      {!geocoding && pins.length < stops.length && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          right: '10px',
          padding: '10px 14px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#92400e',
          fontWeight: 600,
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          ⚠️ {stops.length - pins.length} of {stops.length} address{stops.length === 1 ? '' : 'es'} couldn't be mapped.
          {' '}Edit the client's address to include the street suffix + zip (e.g. "Lane, Cypress, TX 77429").
          Open browser console to see which.
        </div>
      )}
    </div>
  )
}
