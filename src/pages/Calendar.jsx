import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { checkBookingSafety } from '../lib/claude'

const HOURS = []
for (let h = 7; h <= 18; h++) {
    HOURS.push(h)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatHour(h) {
    if (h === 0 || h === 12) return '12'
    return h > 12 ? `${h - 12}` : `${h}`
}

function formatAmPm(h) {
    return h >= 12 ? 'PM' : 'AM'
}

function formatTime(timeStr) {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h
    return m === 0 ? `${hr} ${ampm}` : `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

function getWeekDates(date) {
    const d = new Date(date)
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    const dates = []
    for (let i = 0; i < 7; i++) {
        const dd = new Date(start)
        dd.setDate(start.getDate() + i)
        dates.push(dd)
    }
    return dates
}

function getMonthDates(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())
    const dates = []
    const current = new Date(startDate)
    while (dates.length < 42) {
        dates.push(new Date(current))
        current.setDate(current.getDate() + 1)
    }
    return dates
}

function dateToString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(d1, d2) {
    return dateToString(d1) === dateToString(d2)
}

const STATUS_COLORS = {
    confirmed: '#2563eb',
    pending: '#d97706',
    completed: '#16a34a',
    cancelled: '#94a3b8',
    no_show: '#dc2626',
}

export default function Calendar() {
    const routerNavigate = useNavigate()
    const [view, setView] = useState('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [appointments, setAppointments] = useState([])
    const [clients, setClients] = useState([])
    const [pets, setPets] = useState([])
    const [services, setServices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAddForm, setShowAddForm] = useState(false)
    const [selectedDate, setSelectedDate] = useState(null)
    const [selectedTime, setSelectedTime] = useState(null)
    const [selectedAppt, setSelectedAppt] = useState(null) // appointment detail popup
    const [apptDetailLoading, setApptDetailLoading] = useState(false)

    useEffect(() => {
        fetchData()
    }, [currentDate, view])

    const fetchData = async () => {
        const { data: { user } } = await supabase.auth.getUser()

        // Determine date range based on view
        let startDate, endDate
        if (view === 'day') {
            startDate = dateToString(currentDate)
            endDate = startDate
        } else if (view === 'week') {
            const weekDates = getWeekDates(currentDate)
            startDate = dateToString(weekDates[0])
            endDate = dateToString(weekDates[6])
        } else {
            const monthDates = getMonthDates(currentDate)
            startDate = dateToString(monthDates[0])
            endDate = dateToString(monthDates[41])
        }

        const [apptResult, clientResult, petResult, serviceResult] = await Promise.all([
            supabase
                .from('appointments')
                .select('*, clients(first_name, last_name), pets(name, breed)')
                .gte('appointment_date', startDate)
                .lte('appointment_date', endDate)
                .order('start_time'),
            supabase.from('clients').select('id, first_name, last_name').eq('groomer_id', user.id).order('last_name'),
            supabase.from('pets').select('id, name, breed, client_id').eq('groomer_id', user.id).order('name'),
            supabase.from('services').select('id, service_name, price, time_block_minutes').eq('groomer_id', user.id).eq('is_active', true),
        ])

        setAppointments(apptResult.data || [])
        setClients(clientResult.data || [])
        setPets(petResult.data || [])
        setServices(serviceResult.data || [])
        setLoading(false)
    }

    const navigate = (direction) => {
        const d = new Date(currentDate)
        if (view === 'day') d.setDate(d.getDate() + direction)
        else if (view === 'week') d.setDate(d.getDate() + direction * 7)
        else d.setMonth(d.getMonth() + direction)
        setCurrentDate(d)
    }

    const goToToday = () => setCurrentDate(new Date())

    // Revenue calculation
    const getRevenue = () => {
        let filtered = appointments
        if (view === 'day') {
            filtered = appointments.filter((a) => a.appointment_date === dateToString(currentDate))
        }
        const completed = filtered.filter((a) => a.status === 'completed')
        const confirmed = filtered.filter((a) => a.status === 'confirmed')
        const totalCompleted = completed.reduce((sum, a) => sum + (parseFloat(a.final_price) || parseFloat(a.quoted_price) || 0), 0)
        const totalExpected = confirmed.reduce((sum, a) => sum + (parseFloat(a.quoted_price) || 0), 0)
        const activeCount = filtered.filter((a) => a.status !== 'cancelled' && a.status !== 'rescheduled').length
        return { completed: totalCompleted, expected: totalExpected, total: totalCompleted + totalExpected, count: activeCount }
    }

    const revenue = getRevenue()

    const getHeaderText = () => {
        if (view === 'day') {
            return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        }
        if (view === 'week') {
            const weekDates = getWeekDates(currentDate)
            const start = weekDates[0]
            const end = weekDates[6]
            if (start.getMonth() === end.getMonth()) {
                return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`
            }
            return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} - ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
        }
        return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    }

    const handleTimeSlotClick = (date, hour) => {
        setSelectedDate(dateToString(date))
        setSelectedTime(`${String(hour).padStart(2, '0')}:00`)
        setShowAddForm(true)
    }

    const handleApptClick = async (appt, e) => {
        e.stopPropagation()
        setApptDetailLoading(true)
        try {
            // Load full appointment details with pet health info and service
            const { data: fullAppt } = await supabase
                .from('appointments')
                .select(`
                    *,
                    clients:client_id ( id, first_name, last_name, phone, email, address, preferred_contact, notes ),
                    pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered, is_senior, grooming_notes ),
                    services:service_id ( id, service_name, price, time_block_minutes )
                `)
                .eq('id', appt.id)
                .single()

            // Also fetch grooming notes from client_notes table
            let groomNotes = []
            if (fullAppt?.pet_id) {
                const { data: notesData } = await supabase
                    .from('client_notes')
                    .select('*')
                    .eq('pet_id', fullAppt.pet_id)
                    .eq('note_type', 'grooming')
                    .order('created_at', { ascending: false })
                    .limit(5)
                groomNotes = notesData || []
            }

            // Also fetch client notes
            let clientNotes = []
            if (fullAppt?.client_id) {
                const { data: cnData } = await supabase
                    .from('client_notes')
                    .select('*')
                    .eq('client_id', fullAppt.client_id)
                    .eq('note_type', 'client')
                    .order('created_at', { ascending: false })
                    .limit(3)
                clientNotes = cnData || []
            }

            setSelectedAppt({ ...fullAppt, groomingNotes: groomNotes, clientNotes: clientNotes })
        } catch (err) {
            console.error('Error loading appointment:', err)
        } finally {
            setApptDetailLoading(false)
        }
    }

    const updateApptStatus = async (apptId, newStatus) => {
        try {
            const updates = { status: newStatus }
            if (newStatus === 'completed') {
                updates.checked_out_at = new Date().toISOString()
            }
            const { error } = await supabase
                .from('appointments')
                .update(updates)
                .eq('id', apptId)
            if (error) throw error
            setSelectedAppt(prev => ({ ...prev, status: newStatus }))
            fetchData()

            // Auto-notify waitlist when an appointment is cancelled
            if (newStatus === 'cancelled') {
                await checkWaitlistForOpening(apptId)
            }
        } catch (err) {
            console.error('Error updating status:', err)
            alert('Error: ' + err.message)
        }
    }

    // Check waitlist for matching entries when an appointment slot opens up
    const checkWaitlistForOpening = async (cancelledApptId) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get the cancelled appointment details
            const { data: cancelledAppt } = await supabase
                .from('appointments')
                .select('appointment_date, service_id, start_time')
                .eq('id', cancelledApptId)
                .single()

            if (!cancelledAppt) return

            // Find waitlist entries that match this date (or are flexible)
            const { data: waitlistMatches } = await supabase
                .from('grooming_waitlist')
                .select('*, clients:client_id(first_name, last_name, phone), pets:pet_id(name)')
                .eq('groomer_id', user.id)
                .eq('status', 'waiting')
                .order('position', { ascending: true })

            if (!waitlistMatches || waitlistMatches.length === 0) return

            // Filter to find best matches:
            // 1. Same date match or flexible dates
            // 2. Same service match (if specified) or any service
            const matches = waitlistMatches.filter(entry => {
                const dateMatch = entry.flexible_dates || entry.preferred_date === cancelledAppt.appointment_date
                const serviceMatch = !entry.service_id || entry.service_id === cancelledAppt.service_id
                return dateMatch && serviceMatch
            })

            if (matches.length === 0) return

            // Auto-notify the first matching person on the waitlist
            const firstMatch = matches[0]
            const { error: updateError } = await supabase
                .from('grooming_waitlist')
                .update({
                    status: 'notified',
                    notified_at: new Date().toISOString(),
                    notification_count: (firstMatch.notification_count || 0) + 1
                })
                .eq('id', firstMatch.id)

            if (updateError) throw updateError

            // Show notification to the groomer
            const clientName = firstMatch.clients ? firstMatch.clients.first_name + ' ' + firstMatch.clients.last_name : 'Unknown'
            const petName = firstMatch.pets ? firstMatch.pets.name : 'Unknown'
            const phone = firstMatch.clients?.phone || 'no phone'

            alert(
                '📋 Waitlist Match Found!\n\n' +
                clientName + ' with ' + petName + ' was #' + firstMatch.position + ' on the waitlist.\n\n' +
                'They\'ve been marked as notified.\n' +
                'Contact them at: ' + phone + '\n\n' +
                '💡 Tip: Go to the Waitlist page to manage their booking.'
            )
        } catch (err) {
            console.error('Waitlist auto-notify error:', err)
            // Don't alert - this is a bonus feature, don't block the cancellation flow
        }
    }

    if (loading) return <div className="loading">Loading calendar...</div>

    return (
        <div className="calendar-page">
            {/* Header */}
            <div className="calendar-header">
                <div className="calendar-header-left">
                    <Link to="/" className="back-link">← Dashboard</Link>
                    <h1>Calendar</h1>
                </div>
                <div className="calendar-header-center">
                    <button className="btn-nav" onClick={() => navigate(-1)}>←</button>
                    <button className="btn-today" onClick={goToToday}>Today</button>
                    <button className="btn-nav" onClick={() => navigate(1)}>→</button>
                    <span className="calendar-date-label">{getHeaderText()}</span>
                </div>
                <div className="calendar-header-right">
                    <div className="view-toggle">
                        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button>
                        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
                        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
                    </div>
                </div>
            </div>

            <div className="calendar-body">
                {/* Calendar Grid */}
                <div className="calendar-grid-container">
                    {view === 'month' ? (
                        <MonthView
                            currentDate={currentDate}
                            appointments={appointments}
                            onDayClick={(date) => { setCurrentDate(date); setView('day') }}
                        />
                    ) : (
                        <TimeGridView
                            view={view}
                            currentDate={currentDate}
                            appointments={appointments}
                            onSlotClick={handleTimeSlotClick}
                            onApptClick={handleApptClick}
                        />
                    )}
                </div>

                {/* Revenue Sidebar */}
                <div className="revenue-panel">
                    {/* Mini Calendar */}
                    <MiniCalendar
                        currentDate={currentDate}
                        appointments={appointments}
                        onDayClick={(date) => { setCurrentDate(date); setView('day') }}
                    />

                    <h2>Revenue</h2>
                    <div className="revenue-label">
                        {view === 'day' ? 'Today' : view === 'week' ? 'This Week' : 'This Month'}
                    </div>
                    <div className="revenue-total">${revenue.total.toFixed(2)}</div>
                    <div className="revenue-breakdown">
                        <div className="revenue-row">
                            <span>Completed</span>
                            <span className="revenue-completed">${revenue.completed.toFixed(2)}</span>
                        </div>
                        <div className="revenue-row">
                            <span>Expected</span>
                            <span className="revenue-expected">${revenue.expected.toFixed(2)}</span>
                        </div>
                        <div className="revenue-row">
                            <span>Appointments</span>
                            <span>{revenue.count}</span>
                        </div>
                    </div>
                    <button
                        className="btn-primary"
                        style={{ width: '100%', marginTop: '16px' }}
                        onClick={() => {
                            setSelectedDate(dateToString(currentDate))
                            setSelectedTime('09:00')
                            setShowAddForm(true)
                        }}
                    >
                        + New Appointment
                    </button>
                </div>
            </div>

            {/* Add Appointment Modal */}
            {showAddForm && (
                <AddAppointmentModal
                    date={selectedDate}
                    time={selectedTime}
                    clients={clients}
                    pets={pets}
                    services={services}
                    onClose={() => setShowAddForm(false)}
                    onSaved={() => {
                        setShowAddForm(false)
                        fetchData()
                    }}
                />
            )}

            {/* Appointment Detail Popup */}
            {selectedAppt && (
                <div className="modal-overlay" onClick={() => setSelectedAppt(null)}>
                    <div className="appt-detail-modal" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="appt-detail-header" style={{ borderLeftColor: STATUS_COLORS[selectedAppt.status] || '#2563eb' }}>
                            <div className="appt-detail-header-left">
                                <h2>🐾 Appointment Details</h2>
                                <span className="appt-detail-badge" style={{ background: STATUS_COLORS[selectedAppt.status] || '#2563eb' }}>
                                    {selectedAppt.status ? selectedAppt.status.replace('_', ' ').toUpperCase() : 'UNKNOWN'}
                                </span>
                            </div>
                            <button className="modal-close" onClick={() => setSelectedAppt(null)}>×</button>
                        </div>

                        <div className="appt-detail-body">
                            {/* Schedule Info */}
                            <div className="appt-detail-schedule">
                                <div className="appt-detail-sched-item">
                                    <span className="appt-detail-sched-label">📅 Date</span>
                                    <span className="appt-detail-sched-value">{selectedAppt.appointment_date}</span>
                                </div>
                                <div className="appt-detail-sched-item">
                                    <span className="appt-detail-sched-label">🕐 Time</span>
                                    <span className="appt-detail-sched-value">{formatTime(selectedAppt.start_time)} — {formatTime(selectedAppt.end_time)}</span>
                                </div>
                                <div className="appt-detail-sched-item">
                                    <span className="appt-detail-sched-label">💰 Price</span>
                                    <span className="appt-detail-sched-value">${parseFloat(selectedAppt.final_price || selectedAppt.quoted_price || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Service */}
                            {selectedAppt.services && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">✂️ Service</div>
                                    <div className="appt-detail-service-card">
                                        <div className="appt-detail-service-name">{selectedAppt.services.service_name}</div>
                                        <div className="appt-detail-service-meta">
                                            ${parseFloat(selectedAppt.services.price || 0).toFixed(2)} · {selectedAppt.services.time_block_minutes} mins
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pet Profile */}
                            {selectedAppt.pets && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">🐕 Pet Profile</div>
                                    <div className="appt-detail-pet">
                                        <div className="appt-detail-pet-avatar" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                                            {selectedAppt.pets.name ? selectedAppt.pets.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div>
                                            <div className="appt-detail-pet-name">{selectedAppt.pets.name}</div>
                                            <div className="appt-detail-pet-info">
                                                {selectedAppt.pets.breed || 'Unknown breed'}
                                                {selectedAppt.pets.weight ? ' · ' + selectedAppt.pets.weight + ' lbs' : ''}
                                                {selectedAppt.pets.age ? ' · ' + selectedAppt.pets.age : ''}
                                                {selectedAppt.pets.sex ? ' · ' + selectedAppt.pets.sex : ''}
                                            </div>
                                            <div className="appt-detail-pet-tags">
                                                {selectedAppt.pets.is_spayed_neutered && <span className="appt-tag appt-tag-green">Spayed/Neutered</span>}
                                                {!selectedAppt.pets.is_spayed_neutered && <span className="appt-tag appt-tag-yellow">Intact</span>}
                                                {selectedAppt.pets.is_senior && <span className="appt-tag appt-tag-blue">Senior</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Health Alerts */}
                                    {selectedAppt.pets.allergies && (
                                        <div className="appt-alert appt-alert-red">
                                            <strong>⚠️ ALLERGIES:</strong> {selectedAppt.pets.allergies}
                                        </div>
                                    )}
                                    {selectedAppt.pets.medications && (
                                        <div className="appt-alert appt-alert-blue">
                                            <strong>💊 MEDICATIONS:</strong> {selectedAppt.pets.medications}
                                        </div>
                                    )}

                                    {/* Vaccination */}
                                    {selectedAppt.pets.vaccination_status && (
                                        <div className="appt-detail-vax">
                                            <span className={'appt-tag ' + (
                                                selectedAppt.pets.vaccination_status === 'current' ? 'appt-tag-green' :
                                                selectedAppt.pets.vaccination_status === 'expired' ? 'appt-tag-red' : 'appt-tag-yellow'
                                            )}>
                                                💉 {selectedAppt.pets.vaccination_status.replace('_', ' ').toUpperCase()}
                                            </span>
                                            {selectedAppt.pets.vaccination_expiry && (
                                                <span className="appt-detail-vax-date">
                                                    Exp: {selectedAppt.pets.vaccination_expiry}
                                                    {new Date(selectedAppt.pets.vaccination_expiry) < new Date() && <span style={{ color: '#dc2626', fontWeight: 700 }}> — EXPIRED</span>}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Grooming Notes */}
                            {(selectedAppt.pets?.grooming_notes || (selectedAppt.groomingNotes && selectedAppt.groomingNotes.length > 0)) && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">✂️ Grooming Notes</div>
                                    {selectedAppt.pets?.grooming_notes && (
                                        <div className="appt-groom-note appt-groom-note-pinned">
                                            <span className="appt-groom-note-badge">📌 Pet Profile</span>
                                            {selectedAppt.pets.grooming_notes}
                                        </div>
                                    )}
                                    {selectedAppt.groomingNotes && selectedAppt.groomingNotes.map(note => (
                                        <div key={note.id} className="appt-groom-note">
                                            <span className="appt-groom-note-badge">✂️ {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                            {note.note}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Client Notes */}
                            {selectedAppt.clientNotes && selectedAppt.clientNotes.length > 0 && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">📋 Client Notes</div>
                                    {selectedAppt.clientNotes.map(note => (
                                        <div key={note.id} className="appt-client-note">
                                            <span className="appt-client-note-badge">📋 {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                            {note.note}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Owner Contact */}
                            {selectedAppt.clients && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">👤 Owner</div>
                                    <div className="appt-detail-owner">
                                        <div className="appt-detail-owner-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>{selectedAppt.clients.first_name} {selectedAppt.clients.last_name}</span>
                                            <button
                                                className="kc-view-profile-btn"
                                                onClick={() => routerNavigate(`/clients/${selectedAppt.client_id}`)}
                                                style={{ fontSize: '11px', padding: '4px 10px' }}
                                            >
                                                🐾 View Profile
                                            </button>
                                        </div>
                                        {selectedAppt.clients.phone && <div className="appt-detail-owner-row">📱 {selectedAppt.clients.phone}</div>}
                                        {selectedAppt.clients.email && <div className="appt-detail-owner-row">📧 {selectedAppt.clients.email}</div>}
                                        {selectedAppt.clients.preferred_contact && (
                                            <span className="appt-tag appt-tag-purple">Prefers: {selectedAppt.clients.preferred_contact}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            {selectedAppt.service_notes && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">📝 Notes</div>
                                    <div className="appt-detail-notes">{selectedAppt.service_notes}</div>
                                </div>
                            )}

                            {/* Flags */}
                            {selectedAppt.has_flags && selectedAppt.flag_details && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">⚠️ Claude AI Flags</div>
                                    {JSON.parse(selectedAppt.flag_details).map((flag, i) => (
                                        <div key={i} className={`safety-flag safety-flag-${flag.level}`} style={{ marginBottom: '6px' }}>
                                            <span className="flag-level">
                                                {flag.level === 'danger' ? '🛑' : flag.level === 'warning' ? '⚠️' : 'ℹ️'}{' '}
                                                {flag.level.toUpperCase()}
                                            </span>
                                            <span className="flag-message">{flag.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer with Actions */}
                        <div className="appt-detail-footer">
                            <div className="appt-detail-actions">
                                {selectedAppt.status === 'confirmed' && (
                                    <button className="appt-action-btn appt-action-complete" onClick={() => updateApptStatus(selectedAppt.id, 'completed')}>
                                        ✅ Mark Complete
                                    </button>
                                )}
                                {selectedAppt.status === 'pending' && (
                                    <button className="appt-action-btn appt-action-confirm" onClick={() => updateApptStatus(selectedAppt.id, 'confirmed')}>
                                        ✔️ Confirm
                                    </button>
                                )}
                                {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && selectedAppt.status !== 'no_show' && (
                                    <>
                                        <button className="appt-action-btn appt-action-noshow" onClick={() => updateApptStatus(selectedAppt.id, 'no_show')}>
                                            🚫 No Show
                                        </button>
                                        <button className="appt-action-btn appt-action-cancel" onClick={() => {
                                            if (confirm('Cancel this appointment?')) {
                                                updateApptStatus(selectedAppt.id, 'cancelled')
                                                setSelectedAppt(null)
                                            }
                                        }}>
                                            ❌ Cancel
                                        </button>
                                    </>
                                )}
                            </div>
                            <button className="btn-secondary" onClick={() => setSelectedAppt(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading overlay for appointment detail */}
            {apptDetailLoading && (
                <div className="modal-overlay">
                    <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '16px' }}>
                        <div style={{ fontSize: '40px', animation: 'pulse 1s ease-in-out infinite' }}>🐾</div>
                        <p style={{ color: '#64748b', marginTop: '12px' }}>Loading appointment...</p>
                    </div>
                </div>
            )}
        </div>
    )
}

function TimeGridView({ view, currentDate, appointments, onSlotClick, onApptClick }) {
    const dates = view === 'day' ? [currentDate] : getWeekDates(currentDate)
    const today = new Date()

    // Calculate red time indicator position
    const nowHour = today.getHours()
    const nowMinute = today.getMinutes()
    const firstHour = HOURS[0]
    const lastHour = HOURS[HOURS.length - 1]
    const showIndicator = nowHour >= firstHour && nowHour <= lastHour
    const rowHeight = 120 // matches CSS min-height
    const indicatorTop = showIndicator ? ((nowHour - firstHour) * rowHeight) + ((nowMinute / 60) * rowHeight) : 0

    // Auto-update the indicator every minute
    const [, setTick] = useState(0)
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="time-grid">
            {/* Column Headers */}
            <div className="time-grid-header">
                <div className="time-gutter-header"></div>
                {dates.map((date, i) => (
                    <div
                        key={i}
                        className={`time-col-header ${isSameDay(date, today) ? 'today' : ''}`}
                    >
                        <span className="day-name">{DAY_NAMES[date.getDay()]}</span>
                        <span className="day-number">{date.getDate()}</span>
                    </div>
                ))}
            </div>

            {/* Time Rows */}
            <div className="time-grid-body">
                {/* Red current-time indicator line */}
                {showIndicator && (
                    <div className="time-indicator" style={{ top: `${indicatorTop}px` }} />
                )}
                {HOURS.map((hour) => (
                    <div key={hour} className="time-row">
                        <div className="time-gutter">
                            <span>{formatHour(hour)} {formatAmPm(hour)}</span>
                        </div>
                        {dates.map((date, i) => {
                            const dateStr = dateToString(date)
                            const slotAppts = appointments.filter((a) => {
                                if (a.appointment_date !== dateStr) return false
                                if (a.status === 'cancelled' || a.status === 'rescheduled') return false
                                const startH = parseInt(a.start_time.split(':')[0])
                                return startH === hour
                            })
                            return (
                                <div
                                    key={i}
                                    className="time-cell"
                                    onClick={() => onSlotClick(date, hour)}
                                >
                                    {slotAppts.map((appt) => {
                                        const startH = parseInt(appt.start_time.split(':')[0])
                                        const endH = parseInt(appt.end_time.split(':')[0])
                                        const span = Math.max(1, endH - startH)
                                        return (
                                            <div
                                                key={appt.id}
                                                className="appt-block"
                                                style={{
                                                    backgroundColor: STATUS_COLORS[appt.status] || '#2563eb',
                                                    height: `${span * 100}%`,
                                                    minHeight: '48px',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={(e) => onApptClick(appt, e)}
                                                title="Click for details"
                                            >
                                                <span className="appt-time">{formatTime(appt.start_time)}</span>
                                                <span className="appt-pet">{appt.pets?.name}</span>
                                                <span className="appt-client">{appt.clients?.first_name} {appt.clients?.last_name}</span>
                                                {appt.has_flags && <span className="appt-flag">⚠️</span>}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}

function MonthView({ currentDate, appointments, onDayClick }) {
    const dates = getMonthDates(currentDate)
    const today = new Date()
    const currentMonth = currentDate.getMonth()

    return (
        <div className="month-grid">
            <div className="month-header-row">
                {DAY_NAMES.map((d) => (
                    <div key={d} className="month-day-header">{d}</div>
                ))}
            </div>
            <div className="month-body">
                {Array.from({ length: 6 }, (_, week) => (
                    <div key={week} className="month-week-row">
                        {dates.slice(week * 7, week * 7 + 7).map((date, i) => {
                            const dateStr = dateToString(date)
                            const dayAppts = appointments.filter((a) => a.appointment_date === dateStr && a.status !== 'cancelled' && a.status !== 'rescheduled')
                            const isCurrentMonth = date.getMonth() === currentMonth
                            const isToday = isSameDay(date, today)
                            return (
                                <div
                                    key={i}
                                    className={`month-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                                    onClick={() => onDayClick(date)}
                                >
                                    <span className="month-day-number">{date.getDate()}</span>
                                    {dayAppts.length > 0 && (
                                        <div className="month-appt-dots">
                                            {dayAppts.slice(0, 3).map((a, j) => (
                                                <div
                                                    key={j}
                                                    className="month-appt-dot"
                                                    style={{ backgroundColor: STATUS_COLORS[a.status] }}
                                                    title={`${a.pets?.name} - ${formatTime(a.start_time)}`}
                                                />
                                            ))}
                                            {dayAppts.length > 3 && (
                                                <span className="month-more">+{dayAppts.length - 3}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}

function MiniCalendar({ currentDate, appointments, onDayClick }) {
    const [miniDate, setMiniDate] = useState(new Date(currentDate))
    const today = new Date()

    useEffect(() => {
        setMiniDate(new Date(currentDate))
    }, [currentDate])

    const year = miniDate.getFullYear()
    const month = miniDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())

    const days = []
    const d = new Date(startDate)
    for (let i = 0; i < 42; i++) {
        days.push(new Date(d))
        d.setDate(d.getDate() + 1)
    }

    const miniPrev = () => setMiniDate(new Date(year, month - 1, 1))
    const miniNext = () => setMiniDate(new Date(year, month + 1, 1))

    return (
        <div className="mini-cal">
            <div className="mini-cal-header">
                <button className="mini-cal-nav" onClick={miniPrev}>‹</button>
                <span className="mini-cal-title">{MONTH_NAMES[month]} {year}</span>
                <button className="mini-cal-nav" onClick={miniNext}>›</button>
            </div>
            <div className="mini-cal-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={i} className="mini-cal-day-header">{d}</div>
                ))}
                {days.map((day, i) => {
                    const isCurrentMonth = day.getMonth() === month
                    const isToday = isSameDay(day, today)
                    const isSelected = isSameDay(day, currentDate)
                    const dayStr = dateToString(day)
                    const hasAppts = appointments.some(a => a.appointment_date === dayStr && a.status !== 'cancelled')
                    return (
                        <div
                            key={i}
                            className={'mini-cal-day' + (!isCurrentMonth ? ' mini-cal-other' : '') + (isToday ? ' mini-cal-today' : '') + (isSelected ? ' mini-cal-selected' : '')}
                            onClick={() => onDayClick(day)}
                        >
                            {day.getDate()}
                            {hasAppts && <div className="mini-cal-dot"></div>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function AddAppointmentModal({ date, time, clients, pets, services, onClose, onSaved }) {
    const [form, setForm] = useState({
        client_id: '',
        pet_id: '',
        service_id: '',
        appointment_date: date || '',
        start_time: time || '09:00',
        end_time: '',
        quoted_price: '',
        service_notes: '',
        status: 'confirmed',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [filteredPets, setFilteredPets] = useState([])
    const [safetyCheck, setSafetyCheck] = useState(null)
    const [checking, setChecking] = useState(false)

    useEffect(() => {
        if (form.client_id) {
            setFilteredPets(pets.filter((p) => p.client_id === form.client_id))
        } else {
            setFilteredPets([])
        }
    }, [form.client_id, pets])

    useEffect(() => {
        if (form.service_id) {
            const service = services.find((s) => s.id === form.service_id)
            if (service) {
                setForm((prev) => ({
                    ...prev,
                    quoted_price: service.price,
                    end_time: calculateEndTime(prev.start_time, service.time_block_minutes),
                }))
            }
        }
    }, [form.service_id, form.start_time, services])

    const calculateEndTime = (startTime, minutes) => {
        if (!startTime || !minutes) return ''
        const [h, m] = startTime.split(':').map(Number)
        const totalMin = h * 60 + m + minutes
        const endH = Math.floor(totalMin / 60)
        const endM = totalMin % 60
        return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setForm({ ...form, [name]: value })
    }

    // Run Claude AI safety check
    const runSafetyCheck = async () => {
        if (!form.pet_id) {
            setError('Select a pet first so Claude can check their profile.')
            return
        }
        setChecking(true)
        setError(null)
        setSafetyCheck(null)

        const result = await checkBookingSafety({
            pet_id: form.pet_id,
            service_id: form.service_id || null,
            appointment_date: form.appointment_date,
            start_time: form.start_time,
            end_time: form.end_time || calculateEndTime(form.start_time, 60),
        })

        setSafetyCheck(result)
        setChecking(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        const { data: { user } } = await supabase.auth.getUser()

        // Build flag data from safety check
        const hasFlags = safetyCheck && safetyCheck.flags && safetyCheck.flags.length > 0
        const flagDetails = hasFlags ? JSON.stringify(safetyCheck.flags) : null
        const flagStatus = hasFlags
            ? (safetyCheck.approved ? 'approved' : 'pending')
            : 'none'

        const { error: insertError } = await supabase
            .from('appointments')
            .insert({
                groomer_id: user.id,
                client_id: form.client_id,
                pet_id: form.pet_id,
                service_id: form.service_id || null,
                appointment_date: form.appointment_date,
                start_time: form.start_time,
                end_time: form.end_time || calculateEndTime(form.start_time, 60),
                quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
                service_notes: form.service_notes || null,
                status: form.status,
                has_flags: hasFlags || false,
                flag_details: flagDetails,
                flag_status: flagStatus,
            })

        if (insertError) {
            setError(insertError.message)
            setSaving(false)
            return
        }

        // Send email notification if booking has pending flags
        if (hasFlags && flagStatus === 'pending') {
            try {
                const selectedPet = filteredPets.find(p => p.id === form.pet_id)
                const selectedClient = clients.find(c => c.id === form.client_id)
                const selectedService = services.find(s => s.id === form.service_id)

                await supabase.functions.invoke('send-flag-email', {
                    body: {
                        pet_name: selectedPet ? selectedPet.name : 'Unknown',
                        client_name: selectedClient ? selectedClient.first_name + ' ' + selectedClient.last_name : 'Unknown',
                        service_name: selectedService ? selectedService.service_name : 'Not specified',
                        flags: safetyCheck.flags,
                        appointment_date: form.appointment_date,
                        start_time: form.start_time,
                        end_time: form.end_time || calculateEndTime(form.start_time, 60),
                        groomer_email: user.email,
                    },
                })
                console.log('Flag notification email sent')
            } catch (emailErr) {
                console.log('Email notification failed (booking still saved):', emailErr)
            }

            // Send SMS notification too
            try {
                const selectedPetSms = filteredPets.find(p => p.id === form.pet_id)
                const selectedClientSms = clients.find(c => c.id === form.client_id)

                await supabase.functions.invoke('send-flag-sms', {
                    body: {
                        pet_name: selectedPetSms ? selectedPetSms.name : 'Unknown',
                        client_name: selectedClientSms ? selectedClientSms.first_name + ' ' + selectedClientSms.last_name : 'Unknown',
                        flags: safetyCheck.flags,
                        appointment_date: form.appointment_date,
                        start_time: form.start_time,
                        groomer_phone: user.phone || null,
                    },
                })
                console.log('Flag notification SMS sent')
            } catch (smsErr) {
                console.log('SMS notification failed (booking still saved):', smsErr)
            }
        }

        onSaved()
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>New Appointment</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Client *</label>
                        <select name="client_id" value={form.client_id} onChange={handleChange} required>
                            <option value="">Select client...</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Pet *</label>
                        <select name="pet_id" value={form.pet_id} onChange={handleChange} required disabled={!form.client_id}>
                            <option value="">{form.client_id ? 'Select pet...' : 'Select client first'}</option>
                            {filteredPets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.breed})</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Service</label>
                        <select name="service_id" value={form.service_id} onChange={handleChange}>
                            <option value="">Select service...</option>
                            {services.map((s) => (
                                <option key={s.id} value={s.id}>{s.service_name} - ${s.price}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Date *</label>
                            <input type="date" name="appointment_date" value={form.appointment_date} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select name="status" value={form.status} onChange={handleChange}>
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Time *</label>
                            <input type="time" name="start_time" value={form.start_time} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label>End Time</label>
                            <input type="time" name="end_time" value={form.end_time} onChange={handleChange} />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Quoted Price ($)</label>
                        <input type="number" name="quoted_price" value={form.quoted_price} onChange={handleChange} step="0.01" />
                    </div>

                    <div className="form-group">
                        <label>Notes</label>
                        <textarea name="service_notes" value={form.service_notes} onChange={handleChange} rows={2} placeholder="Any notes for this appointment..." />
                    </div>

                    {/* Claude AI Safety Check Section */}
                    <div className="safety-check-section">
                        <button
                            type="button"
                            className="btn-claude"
                            onClick={runSafetyCheck}
                            disabled={checking || !form.pet_id}
                        >
                            {checking ? 'Claude is checking...' : 'Check with Claude AI'}
                        </button>

                        {safetyCheck && (
                            <div className="safety-results">
                                <div className={`safety-summary ${safetyCheck.approved ? 'safety-approved' : 'safety-blocked'}`}>
                                    <span className="safety-icon">{safetyCheck.approved ? '\u2705' : '\u26D4'}</span>
                                    <span>{safetyCheck.summary}</span>
                                </div>

                                {safetyCheck.flags && safetyCheck.flags.map((flag, i) => (
                                    <div key={i} className={`safety-flag safety-flag-${flag.level}`}>
                                        <span className="flag-level">
                                            {flag.level === 'danger' ? '\uD83D\uDED1' : flag.level === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F'}
                                            {' '}{flag.level.toUpperCase()}
                                        </span>
                                        <span className="flag-message">{flag.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {error && <p className="error">{error}</p>}

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        {safetyCheck && !safetyCheck.approved && (
                            <button type="submit" className="btn-warning" disabled={saving}>
                                {saving ? 'Booking...' : 'Book Anyway (Override)'}
                            </button>
                        )}
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? 'Booking...' : safetyCheck && safetyCheck.approved ? 'Book Appointment \u2705' : 'Book Appointment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
