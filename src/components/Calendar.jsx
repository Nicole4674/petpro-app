import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
                        />
                    )}
                </div>

                {/* Revenue Sidebar */}
                <div className="revenue-panel">
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
        </div>
    )
}

function TimeGridView({ view, currentDate, appointments, onSlotClick }) {
    const dates = view === 'day' ? [currentDate] : getWeekDates(currentDate)
    const today = new Date()

    // Calculate red time indicator position
    const nowHour = today.getHours()
    const nowMinute = today.getMinutes()
    const firstHour = HOURS[0]
    const lastHour = HOURS[HOURS.length - 1]
    const showIndicator = nowHour >= firstHour && nowHour <= lastHour
    const rowHeight = 80 // matches CSS min-height
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
                                                }}
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
        status: 'unconfirmed',
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

    // Run PetPro AI safety check
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
                                <option value="unconfirmed">Unconfirmed</option>
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

                    {/* PetPro AI Safety Check Section */}
                    <div className="safety-check-section">
                        <button
                            type="button"
                            className="btn-claude"
                            onClick={runSafetyCheck}
                            disabled={checking || !form.pet_id}
                        >
                            {checking ? 'PetPro AI is checking...' : 'Check with PetPro AI'}
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
