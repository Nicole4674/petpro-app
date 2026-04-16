import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var STATUS_COLORS = {
  waiting: '#7c3aed',
  notified: '#f59e0b',
  booked: '#22c55e',
  expired: '#9ca3af',
  declined: '#dc2626',
  removed: '#6b7280'
}

var STATUS_LABELS = {
  waiting: '⏳ Waiting',
  notified: '📲 Notified',
  booked: '✅ Booked',
  expired: '⏰ Expired',
  declined: '❌ Declined',
  removed: '🗑️ Removed'
}

export default function Waitlist() {
  var navigate = useNavigate()
  var [waitlist, setWaitlist] = useState([])
  var [loading, setLoading] = useState(true)
  var [clients, setClients] = useState([])
  var [pets, setPets] = useState([])
  var [services, setServices] = useState([])
  var [showAddForm, setShowAddForm] = useState(false)
  var [saving, setSaving] = useState(false)
  var [filterStatus, setFilterStatus] = useState('waiting')
  var [filterDate, setFilterDate] = useState('')
  var [newEntry, setNewEntry] = useState({
    client_id: '',
    pet_id: '',
    service_id: '',
    preferred_date: '',
    preferred_time_start: '',
    preferred_time_end: '',
    flexible_dates: false,
    any_time: false,
    notes: ''
  })

  useEffect(function() {
    fetchAll()
  }, [])

  async function fetchAll() {
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch waitlist with joins
    var { data: wlData, error: wlError } = await supabase
      .from('grooming_waitlist')
      .select('*, clients(first_name, last_name, phone, email), pets(name, breed), services:service_id(service_name, price)')
      .eq('groomer_id', user.id)
      .order('position', { ascending: true })

    if (wlError) console.error('Waitlist fetch error:', wlError)
    setWaitlist(wlData || [])

    // Fetch clients for form
    var { data: clientData } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('groomer_id', user.id)
      .order('last_name')

    setClients(clientData || [])

    // Fetch pets
    var { data: petData } = await supabase
      .from('pets')
      .select('id, name, breed, client_id')
      .eq('groomer_id', user.id)

    setPets(petData || [])

    // Fetch services
    var { data: serviceData } = await supabase
      .from('services')
      .select('id, service_name, price, duration')
      .eq('groomer_id', user.id)
      .order('service_name')

    setServices(serviceData || [])

    setLoading(false)
  }

  var filteredPets = pets.filter(function(p) { return p.client_id === newEntry.client_id })

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)

    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Get next position
    var waitingCount = waitlist.filter(function(w) { return w.status === 'waiting' }).length

    var record = {
      groomer_id: user.id,
      client_id: newEntry.client_id,
      pet_id: newEntry.pet_id,
      position: waitingCount + 1,
      status: 'waiting',
      flexible_dates: newEntry.flexible_dates,
      any_time: newEntry.any_time
    }

    // Only add optional fields if they have values
    if (newEntry.service_id) record.service_id = newEntry.service_id
    if (newEntry.preferred_date) record.preferred_date = newEntry.preferred_date
    if (newEntry.preferred_time_start) record.preferred_time_start = newEntry.preferred_time_start
    if (newEntry.preferred_time_end) record.preferred_time_end = newEntry.preferred_time_end
    if (newEntry.notes && newEntry.notes.trim()) record.notes = newEntry.notes.trim()

    console.log('Inserting waitlist record:', record)

    var { data: insertData, error } = await supabase.from('grooming_waitlist').insert([record]).select()

    console.log('Insert result:', insertData, 'Error:', error)

    if (!error) {
      setShowAddForm(false)
      setNewEntry({
        client_id: '', pet_id: '', service_id: '',
        preferred_date: '', preferred_time_start: '', preferred_time_end: '',
        flexible_dates: false, any_time: false, notes: ''
      })
      fetchAll()
    } else {
      alert('Error adding to waitlist: ' + error.message)
    }
    setSaving(false)
  }

  async function moveUp(entry) {
    var waiting = waitlist.filter(function(w) { return w.status === 'waiting' })
    var idx = waiting.findIndex(function(w) { return w.id === entry.id })
    if (idx <= 0) return

    var prev = waiting[idx - 1]
    // Swap positions
    await supabase.from('grooming_waitlist').update({ position: entry.position }).eq('id', prev.id)
    await supabase.from('grooming_waitlist').update({ position: prev.position }).eq('id', entry.id)
    fetchAll()
  }

  async function moveDown(entry) {
    var waiting = waitlist.filter(function(w) { return w.status === 'waiting' })
    var idx = waiting.findIndex(function(w) { return w.id === entry.id })
    if (idx >= waiting.length - 1) return

    var next = waiting[idx + 1]
    await supabase.from('grooming_waitlist').update({ position: entry.position }).eq('id', next.id)
    await supabase.from('grooming_waitlist').update({ position: next.position }).eq('id', entry.id)
    fetchAll()
  }

  async function removeEntry(entry) {
    if (!window.confirm('Remove ' + (entry.pets ? entry.pets.name : 'this pet') + ' from the waitlist?')) return
    await supabase.from('grooming_waitlist').update({ status: 'removed', updated_at: new Date().toISOString() }).eq('id', entry.id)
    fetchAll()
  }

  async function markBooked(entry) {
    await supabase.from('grooming_waitlist').update({ status: 'booked', updated_at: new Date().toISOString() }).eq('id', entry.id)
    fetchAll()
  }

  async function notifyClient(entry) {
    // For now, mark as notified — Twilio integration will send actual SMS later
    await supabase.from('grooming_waitlist').update({
      status: 'notified',
      notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', entry.id)
    fetchAll()
    alert('📲 Notification marked! (Twilio auto-SMS coming in a future update)\n\nClient: ' + (entry.clients ? entry.clients.first_name + ' ' + entry.clients.last_name : '') + '\nPhone: ' + (entry.clients ? entry.clients.phone || 'No phone' : 'Unknown'))
  }

  function formatDate(d) {
    if (!d) return 'Any date'
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatTime(t) {
    if (!t) return ''
    var parts = t.split(':')
    var h = parseInt(parts[0])
    var m = parts[1]
    var ampm = h >= 12 ? 'PM' : 'AM'
    if (h > 12) h -= 12
    if (h === 0) h = 12
    return h + ':' + m + ' ' + ampm
  }

  function getTimePreference(entry) {
    if (entry.any_time) return '🕐 Any time'
    if (entry.preferred_time_start && entry.preferred_time_end) {
      return '🕐 ' + formatTime(entry.preferred_time_start) + ' – ' + formatTime(entry.preferred_time_end)
    }
    if (entry.preferred_time_start) return '🕐 After ' + formatTime(entry.preferred_time_start)
    return '🕐 Any time'
  }

  function timeSince(dateStr) {
    var now = new Date()
    var then = new Date(dateStr)
    var diff = Math.floor((now - then) / 1000 / 60)
    if (diff < 60) return diff + 'm ago'
    var hours = Math.floor(diff / 60)
    if (hours < 24) return hours + 'h ago'
    var days = Math.floor(hours / 24)
    return days + 'd ago'
  }

  // Filter
  var filtered = waitlist.filter(function(w) {
    var matchStatus = filterStatus === 'all' || w.status === filterStatus
    var matchDate = !filterDate || w.preferred_date === filterDate
    return matchStatus && matchDate
  })

  var waitingCount = waitlist.filter(function(w) { return w.status === 'waiting' }).length
  var notifiedCount = waitlist.filter(function(w) { return w.status === 'notified' }).length
  var bookedCount = waitlist.filter(function(w) { return w.status === 'booked' }).length

  if (loading) {
    return (
      <div className="sl-loading">
        <div className="sl-loading-paw">🐾</div>
        <p>Loading waitlist...</p>
      </div>
    )
  }

  return (
    <div className="wl-page">
      {/* Header */}
      <div className="wl-header">
        <div className="wl-header-left">
          <h1 className="wl-title">📋 Grooming Waitlist</h1>
          <p className="wl-subtitle">Manage your waitlist — auto-fill cancelled slots instantly</p>
        </div>
        <button className="sl-add-btn" onClick={function() { setShowAddForm(true) }}>
          ✨ Add to Waitlist
        </button>
      </div>

      {/* Stats */}
      <div className="wl-stats">
        <div className="wl-stat">
          <span className="wl-stat-num wl-stat-purple">{waitingCount}</span>
          <span className="wl-stat-label">Waiting</span>
        </div>
        <div className="wl-stat">
          <span className="wl-stat-num wl-stat-yellow">{notifiedCount}</span>
          <span className="wl-stat-label">Notified</span>
        </div>
        <div className="wl-stat">
          <span className="wl-stat-num wl-stat-green">{bookedCount}</span>
          <span className="wl-stat-label">Booked</span>
        </div>
      </div>

      {/* Filters */}
      <div className="wl-filters">
        <div className="wl-status-filters">
          {['waiting', 'notified', 'booked', 'all'].map(function(s) {
            return (
              <button
                key={s}
                className={'wl-filter-btn' + (filterStatus === s ? ' wl-filter-active' : '')}
                onClick={function() { setFilterStatus(s) }}
              >
                {s === 'waiting' && '⏳ '}
                {s === 'notified' && '📲 '}
                {s === 'booked' && '✅ '}
                {s === 'all' && '📋 '}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          })}
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={function(e) { setFilterDate(e.target.value) }}
          className="sl-input"
          style={{ maxWidth: '180px' }}
          placeholder="Filter by date"
        />
        {filterDate && (
          <button className="wl-clear-date" onClick={function() { setFilterDate('') }}>✕ Clear date</button>
        )}
      </div>

      {/* Waitlist */}
      {filtered.length === 0 ? (
        <div className="sl-empty">
          <div className="sl-empty-icon">📋</div>
          <h3>{waitlist.length === 0 ? 'Waitlist is empty' : 'No matches for this filter'}</h3>
          <p>{waitlist.length === 0 ? 'When clients want an earlier slot, add them here. They\'ll get notified automatically when a cancellation opens up!' : 'Try a different filter'}</p>
          {waitlist.length === 0 && (
            <button className="sl-add-btn" onClick={function() { setShowAddForm(true) }}>
              ✨ Add First Client to Waitlist
            </button>
          )}
        </div>
      ) : (
        <div className="wl-list">
          {filtered.map(function(w, idx) {
            var isWaiting = w.status === 'waiting'
            return (
              <div key={w.id} className={'wl-card' + (w.status !== 'waiting' ? ' wl-card-muted' : '')}>
                {/* Position Badge */}
                {isWaiting && (
                  <div className="wl-position">#{idx + 1}</div>
                )}

                {/* Status stripe */}
                <div className="wl-card-stripe" style={{ backgroundColor: STATUS_COLORS[w.status] || '#7c3aed' }}></div>

                <div className="wl-card-body">
                  {/* Pet + Client */}
                  <div className="wl-card-top">
                    <div className="wl-card-pet">
                      <span className="wl-pet-icon">🐾</span>
                      <div>
                        <div className="wl-pet-name">{w.pets ? w.pets.name : 'Unknown'}</div>
                        <div className="wl-pet-breed">{w.pets ? w.pets.breed : ''}</div>
                      </div>
                    </div>
                    <span className="wl-status-badge" style={{ backgroundColor: STATUS_COLORS[w.status] }}>
                      {STATUS_LABELS[w.status] || w.status}
                    </span>
                  </div>

                  {/* Client Info */}
                  <div className="wl-client-row">
                    <span>👤 {w.clients ? w.clients.first_name + ' ' + w.clients.last_name : 'Unknown'}</span>
                    {w.clients && w.clients.phone && <span>📱 {w.clients.phone}</span>}
                  </div>

                  {/* Preferences */}
                  <div className="wl-prefs">
                    <span className="wl-pref-tag">
                      📅 {w.flexible_dates ? 'Flexible dates' : formatDate(w.preferred_date)}
                    </span>
                    <span className="wl-pref-tag">{getTimePreference(w)}</span>
                    {w.services && (
                      <span className="wl-pref-tag">✂️ {w.services.service_name}</span>
                    )}
                  </div>

                  {/* Notes */}
                  {w.notes && (
                    <div className="wl-note">📝 {w.notes}</div>
                  )}

                  {/* Notified info */}
                  {w.notified_at && (
                    <div className="wl-notified-info">
                      📲 Notified {timeSince(w.notified_at)}
                      {w.auto_expire_hours && <span> · Expires in {w.auto_expire_hours}h</span>}
                    </div>
                  )}

                  {/* Added time */}
                  <div className="wl-added-time">Added {timeSince(w.created_at)}</div>

                  {/* Actions */}
                  <div className="wl-card-actions">
                    {isWaiting && (
                      <>
                        <button className="wl-action-btn wl-action-notify" onClick={function() { notifyClient(w) }}>
                          📲 Notify
                        </button>
                        <button className="wl-action-btn wl-action-book" onClick={function() { markBooked(w) }}>
                          ✅ Book
                        </button>
                        <button className="wl-action-btn wl-action-up" onClick={function() { moveUp(w) }} title="Move up">
                          ▲
                        </button>
                        <button className="wl-action-btn wl-action-down" onClick={function() { moveDown(w) }} title="Move down">
                          ▼
                        </button>
                        <button className="wl-action-btn wl-action-remove" onClick={function() { removeEntry(w) }}>
                          🗑️
                        </button>
                      </>
                    )}
                    {w.status === 'notified' && (
                      <>
                        <button className="wl-action-btn wl-action-book" onClick={function() { markBooked(w) }}>
                          ✅ They Accepted
                        </button>
                        <button className="wl-action-btn wl-action-remove" onClick={function() { removeEntry(w) }}>
                          ❌ They Declined
                        </button>
                      </>
                    )}
                    {(w.status === 'booked' || w.status === 'expired' || w.status === 'declined' || w.status === 'removed') && (
                      <span className="wl-action-done">
                        {w.status === 'booked' && '🎉 Booked successfully!'}
                        {w.status === 'expired' && '⏰ Offer expired'}
                        {w.status === 'declined' && '❌ Client declined'}
                        {w.status === 'removed' && '🗑️ Removed from waitlist'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add to Waitlist Modal */}
      {showAddForm && (
        <div className="sl-modal-overlay" onClick={function(e) { if (e.target.className === 'sl-modal-overlay') setShowAddForm(false) }}>
          <div className="sl-modal">
            <div className="sl-modal-header">
              <h2>✨ Add to Waitlist</h2>
              <button className="sl-modal-close" onClick={function() { setShowAddForm(false) }}>✕</button>
            </div>

            <form onSubmit={handleAdd} className="sl-form">
              {/* Client */}
              <div className="sl-form-group">
                <label className="sl-label">Client *</label>
                <select
                  value={newEntry.client_id}
                  onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { client_id: e.target.value, pet_id: '' })) }}
                  className="sl-input"
                  required
                >
                  <option value="">Select client...</option>
                  {clients.map(function(c) {
                    return <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>
                  })}
                </select>
              </div>

              {/* Pet */}
              <div className="sl-form-group">
                <label className="sl-label">Pet *</label>
                <select
                  value={newEntry.pet_id}
                  onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { pet_id: e.target.value })) }}
                  className="sl-input"
                  required
                >
                  <option value="">Select pet...</option>
                  {filteredPets.map(function(p) {
                    return <option key={p.id} value={p.id}>{p.name} ({p.breed})</option>
                  })}
                </select>
              </div>

              {/* Service */}
              <div className="sl-form-group">
                <label className="sl-label">Service Requested</label>
                <select
                  value={newEntry.service_id}
                  onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { service_id: e.target.value })) }}
                  className="sl-input"
                >
                  <option value="">Any service</option>
                  {services.map(function(s) {
                    return <option key={s.id} value={s.id}>{s.service_name} — ${s.price}</option>
                  })}
                </select>
              </div>

              {/* Date Preference */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Preferred Date</label>
                  <input
                    type="date"
                    value={newEntry.preferred_date}
                    onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { preferred_date: e.target.value })) }}
                    className="sl-input"
                    disabled={newEntry.flexible_dates}
                  />
                </div>
                <div className="sl-form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                  <label className="wl-checkbox-label">
                    <input
                      type="checkbox"
                      checked={newEntry.flexible_dates}
                      onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { flexible_dates: e.target.checked })) }}
                    />
                    Flexible on dates
                  </label>
                </div>
              </div>

              {/* Time Preference */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Earliest Time</label>
                  <input
                    type="time"
                    value={newEntry.preferred_time_start}
                    onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { preferred_time_start: e.target.value })) }}
                    className="sl-input"
                    disabled={newEntry.any_time}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Latest Time</label>
                  <input
                    type="time"
                    value={newEntry.preferred_time_end}
                    onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { preferred_time_end: e.target.value })) }}
                    className="sl-input"
                    disabled={newEntry.any_time}
                  />
                </div>
              </div>

              <div className="sl-form-group">
                <label className="wl-checkbox-label">
                  <input
                    type="checkbox"
                    checked={newEntry.any_time}
                    onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { any_time: e.target.checked })) }}
                  />
                  Any time works
                </label>
              </div>

              {/* Notes */}
              <div className="sl-form-group">
                <label className="sl-label">Notes</label>
                <textarea
                  value={newEntry.notes}
                  onChange={function(e) { setNewEntry(Object.assign({}, newEntry, { notes: e.target.value })) }}
                  className="sl-textarea"
                  rows="2"
                  placeholder="Client prefers mornings, needs a sanitary trim..."
                />
              </div>

              <div className="sl-form-actions">
                <button type="button" className="sl-cancel-btn" onClick={function() { setShowAddForm(false) }}>Cancel</button>
                <button type="submit" className="sl-submit-btn" disabled={saving}>
                  {saving ? '🐾 Adding...' : '✨ Add to Waitlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
