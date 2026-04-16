import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var STATUS_COLORS = {
  scheduled: '#7c3aed',
  confirmed: '#2563eb',
  checked_in: '#16a34a',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#dc2626',
  no_show: '#6b7280',
  pending: '#f59e0b'
}

var STATUS_LABELS = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  pending: 'Pending'
}

export default function Dashboard() {
  var navigate = useNavigate()
  var [view, setView] = useState('day')
  var [currentDate, setCurrentDate] = useState(new Date())
  var [appointments, setAppointments] = useState([])
  var [boardingRes, setBoardingRes] = useState([])
  var [kennels, setKennels] = useState([])
  var [flagCount, setFlagCount] = useState(0)
  var [clients, setClients] = useState([])
  var [pets, setPets] = useState([])
  var [services, setServices] = useState([])
  var [loading, setLoading] = useState(true)
  var [showQuickAdd, setShowQuickAdd] = useState(false)
  var [quickAddType, setQuickAddType] = useState('grooming')
  var [quickForm, setQuickForm] = useState({
    client_id: '', pet_id: '', service_id: '',
    appointment_date: '', start_time: '09:00',
    kennel_id: '', start_date: '', end_date: ''
  })
  var [saving, setSaving] = useState(false)
  var [waitlistCount, setWaitlistCount] = useState(0)

  useEffect(function() {
    fetchAll()
  }, [currentDate, view])

  async function fetchAll() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    var dateStr = formatDateISO(currentDate)
    var range = getDateRange()

    // Fetch appointments for range
    var apptQuery = supabase
      .from('appointments')
      .select('*, clients(first_name, last_name), pets(name, breed)')
      .eq('groomer_id', user.id)
      .gte('appointment_date', range.start)
      .lte('appointment_date', range.end)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })

    var { data: apptData } = await apptQuery
    setAppointments(apptData || [])

    // Fetch boarding reservations that overlap with range
    var { data: boardData } = await supabase
      .from('boarding_reservations')
      .select('*, boarding_reservation_pets(pet_id, pets:pet_id(name, breed)), clients:client_id(first_name, last_name, phone)')
      .eq('groomer_id', user.id)
      .lte('start_date', range.end)
      .gte('end_date', range.start)
      .order('start_date', { ascending: true })

    setBoardingRes(boardData || [])

    // Fetch kennels for occupancy
    var { data: kennelData } = await supabase
      .from('kennels')
      .select('*')
      .eq('groomer_id', user.id)
      .eq('is_active', true)

    setKennels(kennelData || [])

    // Fetch flag count
    var { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('groomer_id', user.id)
      .eq('has_flags', true)
      .eq('flag_status', 'pending')

    setFlagCount(count || 0)

    // Fetch clients, pets, services for quick add
    var { data: clientData } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('groomer_id', user.id)
      .order('last_name')

    setClients(clientData || [])

    var { data: petData } = await supabase
      .from('pets')
      .select('id, name, breed, client_id')
      .eq('groomer_id', user.id)

    setPets(petData || [])

    var { data: serviceData } = await supabase
      .from('services')
      .select('id, name, price, duration')
      .eq('groomer_id', user.id)
      .order('name')

    setServices(serviceData || [])

    // Fetch waitlist count (waiting status)
    var { count: wlCount } = await supabase
      .from('grooming_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('groomer_id', user.id)
      .eq('status', 'waiting')

    setWaitlistCount(wlCount || 0)

    setLoading(false)
  }

  function getDateRange() {
    var d = new Date(currentDate)
    if (view === 'day') {
      var s = formatDateISO(d)
      return { start: s, end: s }
    } else if (view === 'week') {
      var day = d.getDay()
      var start = new Date(d)
      start.setDate(d.getDate() - day)
      var end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { start: formatDateISO(start), end: formatDateISO(end) }
    } else {
      var start = new Date(d.getFullYear(), d.getMonth(), 1)
      var end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { start: formatDateISO(start), end: formatDateISO(end) }
    }
  }

  function formatDateISO(d) {
    var dd = new Date(d)
    return dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0')
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

  function formatDateDisplay(d) {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatDateFull(d) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  function navigateDate(dir) {
    var d = new Date(currentDate)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + (7 * dir))
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  function goToday() {
    setCurrentDate(new Date())
  }

  // Stats calculations
  var todayStr = formatDateISO(new Date())
  var todayAppts = appointments.filter(function(a) { return a.appointment_date === todayStr })
  var checkedInGrooming = todayAppts.filter(function(a) { return a.status === 'checked_in' || a.status === 'in_progress' })
  var completedToday = todayAppts.filter(function(a) { return a.status === 'completed' })
  var stillComing = todayAppts.filter(function(a) { return a.status === 'scheduled' || a.status === 'confirmed' })
  var noShows = todayAppts.filter(function(a) { return a.status === 'no_show' })

  var todayBoarding = boardingRes.filter(function(b) {
    return b.start_date <= todayStr && b.end_date >= todayStr && b.status !== 'cancelled'
  })
  var boardingCheckedIn = todayBoarding.filter(function(b) { return b.status === 'checked_in' })
  var boardingCheckingInToday = boardingRes.filter(function(b) { return b.start_date === todayStr && b.status !== 'cancelled' })
  var boardingCheckingOutToday = boardingRes.filter(function(b) { return b.end_date === todayStr && b.status !== 'cancelled' })

  var totalKennels = kennels.length
  var occupiedKennels = todayBoarding.length
  var occupancyPercent = totalKennels > 0 ? Math.round((occupiedKennels / totalKennels) * 100) : 0

  var revenueToday = completedToday.reduce(function(sum, a) {
    return sum + (parseFloat(a.final_price) || parseFloat(a.quoted_price) || 0)
  }, 0)

  // Quick add
  var filteredPets = pets.filter(function(p) { return p.client_id === quickForm.client_id })

  async function handleQuickAdd(e) {
    e.preventDefault()
    setSaving(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    if (quickAddType === 'grooming') {
      var record = {
        groomer_id: user.id,
        client_id: quickForm.client_id,
        pet_id: quickForm.pet_id,
        service_id: quickForm.service_id || null,
        appointment_date: quickForm.appointment_date,
        start_time: quickForm.start_time,
        status: 'scheduled'
      }
      var { error } = await supabase.from('appointments').insert([record])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
    } else {
      var record = {
        groomer_id: user.id,
        client_id: quickForm.client_id,
        kennel_id: quickForm.kennel_id || null,
        start_date: quickForm.start_date,
        end_date: quickForm.end_date,
        status: 'confirmed'
      }
      var { data: resData, error } = await supabase.from('boarding_reservations').insert([record]).select()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      // Add pet to boarding_reservation_pets
      if (resData && resData[0] && quickForm.pet_id) {
        await supabase.from('boarding_reservation_pets').insert([{
          reservation_id: resData[0].id,
          pet_id: quickForm.pet_id
        }])
      }
    }

    setShowQuickAdd(false)
    setQuickForm({ client_id: '', pet_id: '', service_id: '', appointment_date: '', start_time: '09:00', kennel_id: '', start_date: '', end_date: '' })
    setSaving(false)
    fetchAll()
  }

  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-loading-paw">🐾</div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="db-page">
      {/* Header */}
      <div className="db-header">
        <div className="db-header-left">
          <h1 className="db-title">🐾 PetPro Dashboard</h1>
          <p className="db-date-label">{formatDateFull(currentDate)}</p>
        </div>
        <div className="db-header-right">
          <button className="db-quick-add-btn" onClick={function() { setShowQuickAdd(true) }}>
            ⚡ Quick Book
          </button>
        </div>
      </div>

      {/* View Toggle + Date Navigation */}
      <div className="db-nav-bar">
        <div className="db-view-toggle">
          <button className={'db-view-btn' + (view === 'day' ? ' db-view-active' : '')} onClick={function() { setView('day') }}>Day</button>
          <button className={'db-view-btn' + (view === 'week' ? ' db-view-active' : '')} onClick={function() { setView('week') }}>Week</button>
          <button className={'db-view-btn' + (view === 'month' ? ' db-view-active' : '')} onClick={function() { setView('month') }}>Month</button>
        </div>
        <div className="db-date-nav">
          <button className="db-nav-arrow" onClick={function() { navigateDate(-1) }}>◀</button>
          <button className="db-today-btn" onClick={goToday}>Today</button>
          <button className="db-nav-arrow" onClick={function() { navigateDate(1) }}>▶</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="db-stats">
        <div className="db-stat-card db-stat-purple" onClick={function() { navigate('/calendar') }} style={{ cursor: 'pointer' }}>
          <div className="db-stat-icon">✂️</div>
          <div className="db-stat-info">
            <div className="db-stat-number">{todayAppts.length}</div>
            <div className="db-stat-label">Appointments Today</div>
          </div>
        </div>
        <div className="db-stat-card db-stat-green" onClick={function() { navigate('/boarding/calendar') }} style={{ cursor: 'pointer' }}>
          <div className="db-stat-icon">🏠</div>
          <div className="db-stat-info">
            <div className="db-stat-number">{occupiedKennels}/{totalKennels}</div>
            <div className="db-stat-label">Boarding Occupancy</div>
          </div>
          <div className="db-stat-bar">
            <div className="db-stat-bar-fill" style={{ width: occupancyPercent + '%' }}></div>
          </div>
        </div>
        <div className="db-stat-card db-stat-blue">
          <div className="db-stat-icon">🐾</div>
          <div className="db-stat-info">
            <div className="db-stat-number">{checkedInGrooming.length + boardingCheckedIn.length}</div>
            <div className="db-stat-label">Pets Checked In</div>
          </div>
        </div>
        <div className="db-stat-card db-stat-gold">
          <div className="db-stat-icon">💰</div>
          <div className="db-stat-info">
            <div className="db-stat-number">${revenueToday.toFixed(0)}</div>
            <div className="db-stat-label">Revenue Today</div>
          </div>
        </div>
        {waitlistCount > 0 && (
          <div className="db-stat-card db-stat-orange" onClick={function() { navigate('/waitlist') }} style={{ cursor: 'pointer' }}>
            <div className="db-stat-icon">📋</div>
            <div className="db-stat-info">
              <div className="db-stat-number">{waitlistCount}</div>
              <div className="db-stat-label">On Waitlist</div>
            </div>
          </div>
        )}
        {flagCount > 0 && (
          <div className="db-stat-card db-stat-red" onClick={function() { navigate('/flagged') }} style={{ cursor: 'pointer' }}>
            <div className="db-stat-icon">⚠️</div>
            <div className="db-stat-info">
              <div className="db-stat-number">{flagCount}</div>
              <div className="db-stat-label">AI Flags</div>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Grooming + Boarding + Notes */}
      <div className="db-main-grid">

        {/* ===== GROOMING OVERVIEW ===== */}
        <div className="db-section db-grooming-section">
          <div className="db-section-header">
            <h2 className="db-section-title">✂️ Grooming Overview</h2>
            <div className="db-section-badges">
              <span className="db-badge db-badge-green">{checkedInGrooming.length} checked in</span>
              <span className="db-badge db-badge-purple">{stillComing.length} coming</span>
              <span className="db-badge db-badge-gray">{completedToday.length} done</span>
            </div>
          </div>

          {todayAppts.length === 0 && view === 'day' ? (
            <div className="db-empty-section">
              <span>🐾</span>
              <p>No grooming appointments today</p>
            </div>
          ) : (
            <div className="db-appt-list">
              {(view === 'day' ? todayAppts : appointments).map(function(a) {
                return (
                  <div key={a.id} className="db-appt-row" onClick={function() { navigate('/calendar') }}>
                    <div className="db-appt-time">{formatTime(a.start_time)}</div>
                    <div className="db-appt-status-dot" style={{ backgroundColor: STATUS_COLORS[a.status] || '#7c3aed' }}></div>
                    <div className="db-appt-info">
                      <div className="db-appt-name">
                        {a.pets ? a.pets.name : 'Unknown'}
                        <span className="db-appt-breed">{a.pets ? a.pets.breed : ''}</span>
                      </div>
                      <div className="db-appt-client">
                        {a.clients ? a.clients.first_name + ' ' + a.clients.last_name : 'Unknown'}
                      </div>
                    </div>
                    <div className="db-appt-date-col">
                      {view !== 'day' && <span className="db-appt-date-badge">{formatDateDisplay(a.appointment_date)}</span>}
                    </div>
                    <span className="db-appt-status" style={{ backgroundColor: STATUS_COLORS[a.status] || '#7c3aed' }}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== BOARDING OVERVIEW ===== */}
        <div className="db-section db-boarding-section">
          <div className="db-section-header">
            <h2 className="db-section-title">🏠 Boarding Overview</h2>
            <div className="db-section-badges">
              <span className="db-badge db-badge-green">{boardingCheckedIn.length} in house</span>
              <span className="db-badge db-badge-blue">{boardingCheckingInToday.length} arriving</span>
              <span className="db-badge db-badge-orange">{boardingCheckingOutToday.length} departing</span>
            </div>
          </div>

          {todayBoarding.length === 0 && view === 'day' ? (
            <div className="db-empty-section">
              <span>🏠</span>
              <p>No boarding guests today</p>
            </div>
          ) : (
            <div className="db-appt-list">
              {(view === 'day' ? todayBoarding : boardingRes).map(function(b) {
                var petNames = (b.boarding_reservation_pets || []).map(function(brp) {
                  return brp.pets ? brp.pets.name : 'Unknown'
                }).join(', ')
                var clientName = b.clients ? b.clients.first_name + ' ' + b.clients.last_name : 'Unknown'
                var isCheckIn = b.start_date === todayStr
                var isCheckOut = b.end_date === todayStr

                return (
                  <div key={b.id} className="db-appt-row" onClick={function() { navigate('/boarding/calendar') }}>
                    <div className="db-boarding-dates">
                      <span className="db-boarding-date-sm">{formatDateDisplay(b.start_date)}</span>
                      <span className="db-boarding-arrow">→</span>
                      <span className="db-boarding-date-sm">{formatDateDisplay(b.end_date)}</span>
                    </div>
                    <div className="db-appt-status-dot" style={{ backgroundColor: STATUS_COLORS[b.status] || '#2563eb' }}></div>
                    <div className="db-appt-info">
                      <div className="db-appt-name">
                        {petNames || 'No pets listed'}
                      </div>
                      <div className="db-appt-client">{clientName}</div>
                    </div>
                    <div className="db-boarding-tags">
                      {isCheckIn && <span className="db-tag db-tag-arriving">📥 Arriving</span>}
                      {isCheckOut && <span className="db-tag db-tag-departing">📤 Departing</span>}
                      {!isCheckIn && !isCheckOut && <span className="db-tag db-tag-inhouse">🏠 In House</span>}
                    </div>
                    <span className="db-appt-status" style={{ backgroundColor: STATUS_COLORS[b.status] || '#2563eb' }}>
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ===== NOTES & ALERTS ===== */}
        <div className="db-section db-notes-section">
          <div className="db-section-header">
            <h2 className="db-section-title">📋 Notes & Alerts</h2>
          </div>

          <div className="db-alerts-list">
            {flagCount > 0 && (
              <div className="db-alert db-alert-red" onClick={function() { navigate('/flagged') }}>
                <span className="db-alert-icon">🤖</span>
                <div className="db-alert-text">
                  <strong>Claude AI:</strong> {flagCount} booking{flagCount !== 1 ? 's' : ''} flagged for review
                </div>
                <span className="db-alert-arrow">→</span>
              </div>
            )}

            {boardingCheckingInToday.length > 0 && (
              <div className="db-alert db-alert-blue">
                <span className="db-alert-icon">📥</span>
                <div className="db-alert-text">
                  <strong>{boardingCheckingInToday.length} boarding check-in{boardingCheckingInToday.length !== 1 ? 's' : ''}</strong> today
                </div>
              </div>
            )}

            {boardingCheckingOutToday.length > 0 && (
              <div className="db-alert db-alert-orange">
                <span className="db-alert-icon">📤</span>
                <div className="db-alert-text">
                  <strong>{boardingCheckingOutToday.length} boarding check-out{boardingCheckingOutToday.length !== 1 ? 's' : ''}</strong> today
                </div>
              </div>
            )}

            {noShows.length > 0 && (
              <div className="db-alert db-alert-gray">
                <span className="db-alert-icon">👻</span>
                <div className="db-alert-text">
                  <strong>{noShows.length} no-show{noShows.length !== 1 ? 's' : ''}</strong> today
                </div>
              </div>
            )}

            {stillComing.length > 0 && (
              <div className="db-alert db-alert-purple">
                <span className="db-alert-icon">⏰</span>
                <div className="db-alert-text">
                  <strong>{stillComing.length} appointment{stillComing.length !== 1 ? 's' : ''}</strong> still to come
                </div>
              </div>
            )}

            {occupancyPercent >= 80 && (
              <div className="db-alert db-alert-red">
                <span className="db-alert-icon">🔥</span>
                <div className="db-alert-text">
                  <strong>Boarding at {occupancyPercent}% capacity!</strong> Only {totalKennels - occupiedKennels} kennel{totalKennels - occupiedKennels !== 1 ? 's' : ''} left
                </div>
              </div>
            )}

            {flagCount === 0 && boardingCheckingInToday.length === 0 && boardingCheckingOutToday.length === 0 && noShows.length === 0 && stillComing.length === 0 && occupancyPercent < 80 && (
              <div className="db-alert db-alert-green">
                <span className="db-alert-icon">✅</span>
                <div className="db-alert-text">
                  <strong>All clear!</strong> No alerts right now
                </div>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="db-quick-links">
            <div className="db-quick-link" onClick={function() { navigate('/calendar') }}>✂️ Calendar</div>
            <div className="db-quick-link" onClick={function() { navigate('/boarding/calendar') }}>🏠 Boarding</div>
            <div className="db-quick-link" onClick={function() { navigate('/clients') }}>🐕 Clients</div>
            <div className="db-quick-link" onClick={function() { navigate('/staff') }}>👥 Staff</div>
            <div className="db-quick-link" onClick={function() { navigate('/pricing') }}>💰 Pricing</div>
            <div className="db-quick-link" onClick={function() { navigate('/flagged') }}>🤖 AI Flags</div>
          </div>
        </div>
      </div>

      {/* ===== QUICK ADD MODAL ===== */}
      {showQuickAdd && (
        <div className="db-modal-overlay" onClick={function(e) { if (e.target.className === 'db-modal-overlay') setShowQuickAdd(false) }}>
          <div className="db-modal">
            <div className="db-modal-header">
              <h2>⚡ Quick Book</h2>
              <button className="db-modal-close" onClick={function() { setShowQuickAdd(false) }}>✕</button>
            </div>

            {/* Type Toggle */}
            <div className="db-quick-type-toggle">
              <button
                className={'db-quick-type-btn' + (quickAddType === 'grooming' ? ' db-quick-type-active' : '')}
                onClick={function() { setQuickAddType('grooming') }}
              >
                ✂️ Grooming
              </button>
              <button
                className={'db-quick-type-btn' + (quickAddType === 'boarding' ? ' db-quick-type-active' : '')}
                onClick={function() { setQuickAddType('boarding') }}
              >
                🏠 Boarding
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="db-quick-form">
              {/* Client */}
              <div className="sl-form-group">
                <label className="sl-label">Client *</label>
                <select
                  value={quickForm.client_id}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { client_id: e.target.value, pet_id: '' })) }}
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
                  value={quickForm.pet_id}
                  onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { pet_id: e.target.value })) }}
                  className="sl-input"
                  required
                >
                  <option value="">Select pet...</option>
                  {filteredPets.map(function(p) {
                    return <option key={p.id} value={p.id}>{p.name} ({p.breed})</option>
                  })}
                </select>
              </div>

              {quickAddType === 'grooming' ? (
                <>
                  {/* Service */}
                  <div className="sl-form-group">
                    <label className="sl-label">Service</label>
                    <select
                      value={quickForm.service_id}
                      onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { service_id: e.target.value })) }}
                      className="sl-input"
                    >
                      <option value="">Select service...</option>
                      {services.map(function(s) {
                        return <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                      })}
                    </select>
                  </div>

                  {/* Date + Time */}
                  <div className="sl-form-row">
                    <div className="sl-form-group">
                      <label className="sl-label">Date *</label>
                      <input
                        type="date"
                        value={quickForm.appointment_date}
                        onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { appointment_date: e.target.value })) }}
                        className="sl-input"
                        required
                      />
                    </div>
                    <div className="sl-form-group">
                      <label className="sl-label">Time *</label>
                      <input
                        type="time"
                        value={quickForm.start_time}
                        onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { start_time: e.target.value })) }}
                        className="sl-input"
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Kennel */}
                  <div className="sl-form-group">
                    <label className="sl-label">Kennel</label>
                    <select
                      value={quickForm.kennel_id}
                      onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { kennel_id: e.target.value })) }}
                      className="sl-input"
                    >
                      <option value="">Select kennel...</option>
                      {kennels.map(function(k) {
                        return <option key={k.id} value={k.id}>{k.name}</option>
                      })}
                    </select>
                  </div>

                  {/* Dates */}
                  <div className="sl-form-row">
                    <div className="sl-form-group">
                      <label className="sl-label">Check-in Date *</label>
                      <input
                        type="date"
                        value={quickForm.start_date}
                        onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { start_date: e.target.value })) }}
                        className="sl-input"
                        required
                      />
                    </div>
                    <div className="sl-form-group">
                      <label className="sl-label">Check-out Date *</label>
                      <input
                        type="date"
                        value={quickForm.end_date}
                        onChange={function(e) { setQuickForm(Object.assign({}, quickForm, { end_date: e.target.value })) }}
                        className="sl-input"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="sl-form-actions">
                <button type="button" className="sl-cancel-btn" onClick={function() { setShowQuickAdd(false) }}>Cancel</button>
                <button type="submit" className="sl-submit-btn" disabled={saving}>
                  {saving ? '🐾 Booking...' : '⚡ Book Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
