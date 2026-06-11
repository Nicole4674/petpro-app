// Zones.jsx — Service "Area Days" for mobile groomers.
// A zone is a named area (by ZIP) served on certain days of the week.
// Booking hooks (Phase 2b) use these to batch clients geographically.
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Circle, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────
// 🗺️ Zone Map — SEE your coverage instead of reading zip lists.
// Each zip geocodes to its center point (Google Geocoding REST — same API
// RouteMap uses — with results cached in localStorage forever, so each zip
// costs ONE geocode call ever). Rendered as colored Leaflet circles in the
// zone's color. Read-only v1 — drawing tools maybe later.
// ─────────────────────────────────────────────────────────────────────
var ZIP_CACHE_KEY = 'petpro_zip_coords_v1'

function loadZipCache() {
  try { return JSON.parse(localStorage.getItem(ZIP_CACHE_KEY) || '{}') } catch (e) { return {} }
}

function saveZipCache(cache) {
  try { localStorage.setItem(ZIP_CACHE_KEY, JSON.stringify(cache)) } catch (e) { /* full/blocked — fine */ }
}

// Geocode one US zip → { lat, lng } or null. Google first (reliable),
// OpenStreetMap Nominatim as the free fallback.
async function geocodeZip(zip) {
  var key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      var url = 'https://maps.googleapis.com/maps/api/geocode/json' +
        '?components=postal_code:' + encodeURIComponent(zip) + '|country:US' +
        '&key=' + encodeURIComponent(key)
      var res = await fetch(url)
      var data = await res.json()
      if (data.status === 'OK' && data.results && data.results[0]) {
        var loc = data.results[0].geometry.location
        return { lat: loc.lat, lng: loc.lng }
      }
    } catch (e) { /* fall through to Nominatim */ }
  }
  try {
    var nUrl = 'https://nominatim.openstreetmap.org/search?format=json&country=us&postalcode=' +
      encodeURIComponent(zip) + '&limit=1'
    var nRes = await fetch(nUrl)
    var nData = await nRes.json()
    if (nData && nData[0]) {
      return { lat: parseFloat(nData[0].lat), lng: parseFloat(nData[0].lon) }
    }
  } catch (e) { /* unresolvable zip */ }
  return null
}

// Auto-fit the map to show every circle whenever coords change
function FitToZips({ points }) {
  var map = useMap()
  useEffect(function () {
    if (!points || points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 11)
    } else {
      map.fitBounds(points.map(function (p) { return [p.lat, p.lng] }), { padding: [30, 30] })
    }
  }, [points, map])
  return null
}

function ZoneMap({ zones }) {
  // points = [{ zip, lat, lng, color, zoneName }]
  var [points, setPoints] = useState([])
  var [resolving, setResolving] = useState(false)

  useEffect(function () {
    var cancelled = false
    ;(async function () {
      // Build the zip → zone map (first zone wins if a zip is in two zones)
      var zipMeta = {}
      ;(zones || []).forEach(function (z) {
        ;(z.zips || []).forEach(function (zip) {
          if (!zipMeta[zip]) zipMeta[zip] = { color: z.color || '#7c3aed', zoneName: z.name }
        })
      })
      var zips = Object.keys(zipMeta)
      if (zips.length === 0) { setPoints([]); return }

      setResolving(true)
      var cache = loadZipCache()
      var resolved = []
      var cacheChanged = false
      for (var zip of zips) {
        var coord = cache[zip]
        if (coord === undefined) {
          coord = await geocodeZip(zip)
          cache[zip] = coord   // cache nulls too so bad zips don't re-fetch forever
          cacheChanged = true
        }
        if (coord) {
          resolved.push({ zip: zip, lat: coord.lat, lng: coord.lng, color: zipMeta[zip].color, zoneName: zipMeta[zip].zoneName })
        }
        if (cancelled) return
      }
      if (cacheChanged) saveZipCache(cache)
      if (!cancelled) {
        setPoints(resolved)
        setResolving(false)
      }
    })()
    return function () { cancelled = true }
  }, [zones])

  if ((zones || []).every(function (z) { return !z.zips || z.zips.length === 0 })) return null

  return (
    <div style={{ marginTop: '14px', marginBottom: '4px' }}>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          style={{ height: '340px', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map(function (p) {
            return (
              <Circle
                key={p.zip}
                center={[p.lat, p.lng]}
                radius={4000}
                pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.25, weight: 2 }}
              >
                <Tooltip direction="top" sticky>
                  <strong>{p.zoneName}</strong> · {p.zip}
                </Tooltip>
              </Circle>
            )
          })}
          <FitToZips points={points} />
        </MapContainer>
        {resolving && (
          <div style={{
            position: 'absolute', top: '10px', right: '10px', zIndex: 1000,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '6px 12px', fontSize: '12px', color: '#6b7280', fontWeight: 600,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}>
            📍 Mapping your zips…
          </div>
        )}
      </div>
      <div style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '6px' }}>
        Each circle is one zip, colored by its zone. Hover a circle to see which zone it belongs to.
      </div>
    </div>
  )
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#ec4899', '#0891b2', '#65a30d']

const EMPTY_FORM = { id: null, name: '', color: '#7c3aed', days_of_week: [], zipsText: '' }

export default function Zones() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    await fetchZones(user.id)
  }

  async function fetchZones(uid) {
    setLoading(true)
    const { data } = await supabase
      .from('zones')
      .select('*')
      .eq('groomer_id', uid)
      .order('name', { ascending: true })
    setZones(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(z) {
    setForm({
      id: z.id,
      name: z.name || '',
      color: z.color || '#7c3aed',
      days_of_week: Array.isArray(z.days_of_week) ? z.days_of_week : [],
      zipsText: (z.zips || []).join(', '),
    })
    setShowForm(true)
  }

  function toggleDay(d) {
    setForm(function (f) {
      const has = f.days_of_week.indexOf(d) !== -1
      const next = has ? f.days_of_week.filter(x => x !== d) : f.days_of_week.concat(d).sort((a, b) => a - b)
      return Object.assign({}, f, { days_of_week: next })
    })
  }

  function parseZips(text) {
    return (text || '')
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean)
  }

  async function saveZone() {
    if (!form.name.trim()) { window.alert('Give the zone a name first.'); return }
    setSaving(true)
    const payload = {
      groomer_id: userId,
      name: form.name.trim(),
      color: form.color,
      days_of_week: form.days_of_week,
      zips: parseZips(form.zipsText),
    }
    let error
    if (form.id) {
      ;({ error } = await supabase.from('zones').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('zones').insert([payload]))
    }
    setSaving(false)
    if (error) { window.alert('Could not save zone: ' + error.message); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchZones(userId)
  }

  async function deleteZone(z) {
    if (!window.confirm('Delete the "' + z.name + '" zone? This cannot be undone.')) return
    const { error } = await supabase.from('zones').delete().eq('id', z.id)
    if (error) { window.alert('Could not delete: ' + error.message); return }
    fetchZones(userId)
  }

  if (loading) return <div className="loading">Loading zones…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🗺️ Service Zones</h1>
          <p>Group your service area by ZIP and assign each zone its days. Used to batch bookings so your routes stay tight.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ Add Zone</button>
      </div>

      {/* 🗺️ Visual coverage map — circles per zip, colored by zone */}
      {zones.length > 0 && <ZoneMap zones={zones} />}

      {zones.length === 0 && !showForm ? (
        <div className="empty-state">
          <p>No zones yet. Add your first area (e.g. "North side") and pick the days you run it.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {zones.map(z => (
            <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px' }}>
              <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: z.color || '#7c3aed', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#111827' }}>{z.name}</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {(z.days_of_week && z.days_of_week.length > 0)
                    ? z.days_of_week.map(d => DAY_LABELS[d]).join(', ')
                    : 'No days set'}
                  {' · '}
                  {(z.zips && z.zips.length > 0) ? (z.zips.length + ' ZIP' + (z.zips.length === 1 ? '' : 's')) : 'No ZIPs'}
                </div>
                {z.zips && z.zips.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {z.zips.join(', ')}
                  </div>
                )}
              </div>
              <button onClick={() => openEdit(z)} style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>✏️ Edit</button>
              <button onClick={() => deleteZone(z)} style={{ background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit Zone' : 'New Zone'}</h3>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Zone name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(Object.assign({}, form, { name: e.target.value }))}
            placeholder="e.g. North side, The Valley, Downtown"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '14px' }}
          />

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Color</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setForm(Object.assign({}, form, { color: c }))}
                style={{ width: '28px', height: '28px', borderRadius: '6px', background: c, border: form.color === c ? '3px solid #111827' : '1px solid #e5e7eb', cursor: 'pointer' }}
              />
            ))}
          </div>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Days served</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {DAY_LABELS.map((lbl, d) => {
              const on = form.days_of_week.indexOf(d) !== -1
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  style={{ padding: '8px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: on ? '1px solid #7c3aed' : '1px solid #e5e7eb', background: on ? '#7c3aed' : '#fff', color: on ? '#fff' : '#374151' }}
                >{lbl}</button>
              )
            })}
          </div>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>ZIP codes in this zone</label>
          <textarea
            value={form.zipsText}
            onChange={(e) => setForm(Object.assign({}, form, { zipsText: e.target.value }))}
            placeholder="77001, 77002, 77003…  (separate with commas or spaces)"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', resize: 'vertical', marginBottom: '16px' }}
          />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} style={{ padding: '10px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveZone} disabled={saving} style={{ padding: '10px 16px', background: saving ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : '💾 Save Zone'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
