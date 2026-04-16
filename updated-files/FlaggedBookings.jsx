import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${hr} ${ampm}` : `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y}`
}

export default function FlaggedBookings() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  useEffect(() => {
    fetchFlaggedAppointments()
  }, [filter])

  const fetchFlaggedAppointments = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    let query = supabase
      .from('appointments')
      .select('*, clients(first_name, last_name, phone), pets(name, breed, weight, dog_aggressive, matting_level, collapsed_trachea), services(service_name)')
      .eq('groomer_id', user.id)
      .eq('has_flags', true)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (filter !== 'all') {
      query = query.eq('flag_status', filter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching flagged appointments:', error)
    }

    setAppointments(data || [])
    setLoading(false)
  }

  const updateFlagStatus = async (appointmentId, newStatus) => {
    const { error } = await supabase
      .from('appointments')
      .update({ flag_status: newStatus })
      .eq('id', appointmentId)

    if (!error) {
      fetchFlaggedAppointments()
    }
  }

  const parseFlags = (flagDetails) => {
    try {
      return JSON.parse(flagDetails)
    } catch {
      return []
    }
  }

  const getFlagCounts = () => {
    return {
      danger: 0,
      warning: 0,
      info: 0,
    }
  }

  if (loading) return <div className="loading">Loading flagged bookings...</div>

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/" className="back-link">← Dashboard</Link>
        <h1>Flagged Bookings</h1>
      </div>

      {/* Filter Tabs */}
      <div className="flag-filter-tabs">
        <button
          className={`flag-tab ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Needs Review
        </button>
        <button
          className={`flag-tab ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Approved
        </button>
        <button
          className={`flag-tab ${filter === 'disapproved' ? 'active' : ''}`}
          onClick={() => setFilter('disapproved')}
        >
          Declined
        </button>
        <button
          className={`flag-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Flagged
        </button>
      </div>

      {/* Results Count */}
      <div className="flag-count-bar">
        {appointments.length} {filter === 'all' ? 'flagged' : filter} appointment{appointments.length !== 1 ? 's' : ''}
      </div>

      {/* Appointment Cards */}
      {appointments.length === 0 ? (
        <div className="empty-state">
          <p>{filter === 'pending' ? 'No bookings need review right now!' : 'No flagged bookings in this category.'}</p>
        </div>
      ) : (
        <div className="flagged-list">
          {appointments.map((appt) => {
            const flags = parseFlags(appt.flag_details)
            const dangerCount = flags.filter(f => f.level === 'danger').length
            const warningCount = flags.filter(f => f.level === 'warning').length
            const infoCount = flags.filter(f => f.level === 'info').length

            return (
              <div key={appt.id} className={`flagged-card flagged-card-${appt.flag_status}`}>
                {/* Card Header */}
                <div className="flagged-card-header">
                  <div className="flagged-pet-info">
                    <h3>{appt.pets?.name}</h3>
                    <span className="flagged-breed">{appt.pets?.breed}{appt.pets?.weight ? ` • ${appt.pets.weight} lbs` : ''}</span>
                  </div>
                  <div className="flagged-appt-info">
                    <span className="flagged-date">{formatDate(appt.appointment_date)}</span>
                    <span className="flagged-time">{formatTime(appt.start_time)} - {formatTime(appt.end_time)}</span>
                  </div>
                </div>

                {/* Client & Service */}
                <div className="flagged-details-row">
                  <span>Client: {appt.clients?.first_name} {appt.clients?.last_name}</span>
                  {appt.clients?.phone && <span> • {appt.clients.phone}</span>}
                  {appt.services?.service_name && <span> • {appt.services.service_name}</span>}
                  {appt.quoted_price && <span> • ${parseFloat(appt.quoted_price).toFixed(2)}</span>}
                </div>

                {/* Flag Badges */}
                <div className="flagged-badge-row">
                  {dangerCount > 0 && <span className="flag-badge flag-badge-danger">{dangerCount} Danger</span>}
                  {warningCount > 0 && <span className="flag-badge flag-badge-warning">{warningCount} Warning</span>}
                  {infoCount > 0 && <span className="flag-badge flag-badge-info">{infoCount} Info</span>}
                  <span className={`flag-status-badge flag-status-${appt.flag_status}`}>
                    {appt.flag_status === 'pending' ? 'Needs Review' : appt.flag_status === 'approved' ? 'Approved' : 'Declined'}
                  </span>
                </div>

                {/* Individual Flags */}
                <div className="flagged-flags">
                  {flags.map((flag, i) => (
                    <div key={i} className={`safety-flag safety-flag-${flag.level}`}>
                      <span className="flag-level">
                        {flag.level === 'danger' ? '\uD83D\uDED1' : flag.level === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F'}
                        {' '}{flag.level.toUpperCase()}
                      </span>
                      <span className="flag-message">{flag.message}</span>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                {appt.flag_status === 'pending' && (
                  <div className="flagged-actions">
                    <button
                      className="btn-approve"
                      onClick={() => updateFlagStatus(appt.id, 'approved')}
                    >
                      Approve Booking
                    </button>
                    <button
                      className="btn-decline"
                      onClick={() => updateFlagStatus(appt.id, 'disapproved')}
                    >
                      Decline
                    </button>
                  </div>
                )}

                {/* Already reviewed */}
                {appt.flag_status === 'approved' && (
                  <div className="flagged-actions">
                    <span className="flagged-reviewed">Reviewed & Approved</span>
                    <button
                      className="btn-secondary-sm"
                      onClick={() => updateFlagStatus(appt.id, 'pending')}
                    >
                      Undo
                    </button>
                  </div>
                )}

                {appt.flag_status === 'disapproved' && (
                  <div className="flagged-actions">
                    <span className="flagged-reviewed flagged-declined-text">Declined</span>
                    <button
                      className="btn-secondary-sm"
                      onClick={() => updateFlagStatus(appt.id, 'pending')}
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
