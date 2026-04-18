import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
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
    const location = useLocation()
    // Pre-fill values from URL params (used by "Book Again" flow on client profile)
    const [preFillBooking, setPreFillBooking] = useState(null)
    // Reschedule modal — holds the appointment being rescheduled
    const [reschedulingAppt, setReschedulingAppt] = useState(null)
    const [cancellingAppt, setCancellingAppt] = useState(null) // Task #19 — recurring cancel flow
    const [view, setView] = useState('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [appointments, setAppointments] = useState([])
    const [clients, setClients] = useState([])
    const [pets, setPets] = useState([])
    const [services, setServices] = useState([])
    const [staffMembers, setStaffMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAddForm, setShowAddForm] = useState(false)
    const [selectedDate, setSelectedDate] = useState(null)
    const [selectedTime, setSelectedTime] = useState(null)
    const [selectedAppt, setSelectedAppt] = useState(null) // appointment detail popup
    const [apptDetailLoading, setApptDetailLoading] = useState(false)
    const [apptNotes, setApptNotes] = useState([]) // paper trail of notes for current appointment
    const [showAddNotePopup, setShowAddNotePopup] = useState(false)
    const [newNoteText, setNewNoteText] = useState('')
    const [savingNote, setSavingNote] = useState(false)
    const [checkingIn, setCheckingIn] = useState(false) // loading state for Check In button
    const [checkingOut, setCheckingOut] = useState(false) // loading state for Check Out button

    // ===== Payment at Checkout state =====
    const [showPaymentPopup, setShowPaymentPopup] = useState(false)
    const [paymentAppt, setPaymentAppt] = useState(null) // full appointment object for payment popup
    const [existingPayments, setExistingPayments] = useState([]) // prior payments for this appt
    const [paymentMethod, setPaymentMethod] = useState('') // 'cash' | 'zelle' | 'venmo'
    const [paymentAmount, setPaymentAmount] = useState('')
    const [tipAmount, setTipAmount] = useState('')
    const [discountAmount, setDiscountAmount] = useState('')
    const [discountReason, setDiscountReason] = useState('')
    const [paymentNotes, setPaymentNotes] = useState('')
    const [recordingPayment, setRecordingPayment] = useState(false)
    const [apptPayments, setApptPayments] = useState([]) // payment history for the appt detail popup

    useEffect(() => {
        fetchData()
    }, [currentDate, view])

    // Handle "Book Again" and "Reschedule" URL params from client profile
    useEffect(() => {
        if (loading) return
        const params = new URLSearchParams(location.search)
        const bookClient = params.get('bookClient')
        const bookPet = params.get('bookPet')
        const bookService = params.get('bookService')
        const rescheduleAppt = params.get('rescheduleAppt')

        if (bookClient && bookPet) {
            setPreFillBooking({
                client_id: bookClient,
                pet_id: bookPet,
                service_id: bookService || '',
            })
            setShowAddForm(true)
            routerNavigate('/calendar', { replace: true })
        } else if (rescheduleAppt) {
            // Find the appointment in the list and open the reschedule modal
            const appt = appointments.find(a => a.id === rescheduleAppt)
            if (appt) {
                setReschedulingAppt(appt)
            } else {
                // Appointment not in current view range — fetch it directly
                ;(async () => {
                    const { data } = await supabase
                        .from('appointments')
                        .select('*, pets(name), services(service_name, time_block_minutes), clients(first_name, last_name)')
                        .eq('id', rescheduleAppt)
                        .single()
                    if (data) setReschedulingAppt(data)
                })()
            }
            routerNavigate('/calendar', { replace: true })
        }
    }, [location.search, loading, appointments])

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

        const [apptResult, clientResult, petResult, serviceResult, staffResult] = await Promise.all([
            supabase
                .from('appointments')
                .select('*, clients(first_name, last_name), pets(name, breed), staff_members(id, first_name, last_name, color_code)')
                .gte('appointment_date', startDate)
                .lte('appointment_date', endDate)
                .order('start_time'),
            supabase.from('clients').select('id, first_name, last_name').eq('groomer_id', user.id).order('last_name'),
            supabase.from('pets').select('id, name, breed, client_id').eq('groomer_id', user.id).order('name'),
            supabase.from('services').select('id, service_name, price, time_block_minutes').eq('groomer_id', user.id).eq('is_active', true),
            supabase.from('staff_members').select('id, first_name, last_name, color_code').eq('groomer_id', user.id).eq('status', 'active').order('first_name'),
        ])

        setAppointments(apptResult.data || [])
        setClients(clientResult.data || [])
        setPets(petResult.data || [])
        setServices(serviceResult.data || [])
        setStaffMembers(staffResult.data || [])
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

    const handleTimeSlotClick = (date, hour, staffId) => {
        setSelectedDate(dateToString(date))
        setSelectedTime(`${String(hour).padStart(2, '0')}:00`)
        if (staffId) {
            setPreFillBooking(prev => ({ ...(prev || {}), staff_id: staffId }))
        }
        setShowAddForm(true)
    }

    const handleApptClick = async (appt, e) => {
        e.stopPropagation()
        setApptDetailLoading(true)
        try {
            // Load full appointment details with pet health info, service, and assigned groomer
            const { data: fullAppt } = await supabase
                .from('appointments')
                .select(`
                    *,
                    clients:client_id ( id, first_name, last_name, phone, email, address, preferred_contact, notes ),
                    pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered, is_senior, grooming_notes ),
                    services:service_id ( id, service_name, price, time_block_minutes ),
                    staff_members:staff_id ( id, first_name, last_name, color_code ),
                    recurring_series:recurring_series_id ( id, interval_weeks, total_count, start_date, status )
                `)
                .eq('id', appt.id)
                .single()

            // Task #19 — If this is a recurring appointment, count how many future instances remain
            if (fullAppt?.recurring_series_id) {
                const todayStr = new Date().toISOString().slice(0, 10)
                const { data: remainingAppts } = await supabase
                    .from('appointments')
                    .select('id, appointment_date, status, checked_out_at, recurring_conflict')
                    .eq('recurring_series_id', fullAppt.recurring_series_id)
                    .gte('appointment_date', todayStr)
                    .is('checked_out_at', null)

                const upcomingCount = (remainingAppts || []).filter(a =>
                    !['cancelled', 'no_show', 'completed', 'rescheduled'].includes(a.status)
                ).length
                fullAppt.recurring_upcoming_count = upcomingCount
            }

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

            // Fetch appointment-level notes from notes table (paper trail timeline)
            const { data: apptNotesData } = await supabase
                .from('notes')
                .select('*')
                .eq('appointment_id', appt.id)
                .order('created_at', { ascending: true })
            setApptNotes(apptNotesData || [])

            // Fetch payment history for this appointment (paper trail)
            const { data: paymentsData } = await supabase
                .from('payments')
                .select('*')
                .eq('appointment_id', appt.id)
                .order('created_at', { ascending: true })
            setApptPayments(paymentsData || [])

            // Reset the add-note popup state
            setShowAddNotePopup(false)
            setNewNoteText('')

            setSelectedAppt({ ...fullAppt, groomingNotes: groomNotes, clientNotes: clientNotes })
        } catch (err) {
            console.error('Error loading appointment:', err)
        } finally {
            setApptDetailLoading(false)
        }
    }

    // Save a new note from the Add Note popup — adds to paper trail
    const handleSaveNote = async () => {
        if (!newNoteText.trim() || !selectedAppt) return
        setSavingNote(true)

        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase.from('notes').insert({
            pet_id: selectedAppt.pet_id,
            client_id: selectedAppt.client_id,
            appointment_id: selectedAppt.id,
            groomer_id: user.id,
            note_type: 'day-of',
            content: newNoteText.trim()
        })

        if (error) {
            alert('Error saving note: ' + error.message)
            setSavingNote(false)
            return
        }

        // Refresh the timeline
        const { data: refreshed } = await supabase
            .from('notes')
            .select('*')
            .eq('appointment_id', selectedAppt.id)
            .order('created_at', { ascending: true })
        setApptNotes(refreshed || [])

        // Reset and close popup
        setNewNoteText('')
        setShowAddNotePopup(false)
        setSavingNote(false)
    }

    // Check the dog IN — stamp the exact arrival time + who did it
    const handleCheckIn = async (apptId) => {
        if (!apptId || checkingIn) return
        setCheckingIn(true)

        const { data: { user } } = await supabase.auth.getUser()
        const now = new Date().toISOString()

        const { error } = await supabase
            .from('appointments')
            .update({ checked_in_at: now, checked_in_by: user.id })
            .eq('id', apptId)

        if (error) {
            alert('Error checking in: ' + error.message)
            setCheckingIn(false)
            return
        }

        // Update the popup view immediately
        if (selectedAppt && selectedAppt.id === apptId) {
            setSelectedAppt({ ...selectedAppt, checked_in_at: now, checked_in_by: user.id })
        }
        // Refresh the calendar so tiles update
        await fetchData()
        setCheckingIn(false)
    }

    // Check Out now OPENS the payment popup first — payment must be recorded before timestamp stamps
    const handleCheckOut = async (apptId) => {
        if (!apptId) return
        // Find the appointment (could be from tile or popup)
        const appt = appointments.find(a => a.id === apptId) || selectedAppt
        if (!appt) return
        await openPaymentPopup(appt)
    }

    // Open the payment popup — fetches existing payments and pre-fills balance due
    const openPaymentPopup = async (appt) => {
        setPaymentAppt(appt)

        // Fetch any prior payments for this appointment (pre-paid online, partial payments, etc.)
        const { data: payments } = await supabase
            .from('payments')
            .select('*')
            .eq('appointment_id', appt.id)
            .order('created_at', { ascending: true })

        setExistingPayments(payments || [])

        // Pre-fill the form with balance due
        const servicePrice = parseFloat(appt.final_price || appt.quoted_price || 0)
        const existingDiscount = parseFloat(appt.discount_amount || 0)
        const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
        const balance = servicePrice - existingDiscount - totalPaid

        setPaymentAmount(balance > 0 ? balance.toFixed(2) : '0.00')
        setTipAmount('')
        setDiscountAmount(existingDiscount > 0 ? existingDiscount.toFixed(2) : '')
        setDiscountReason(appt.discount_reason || '')
        setPaymentMethod('')
        setPaymentNotes('')
        setShowPaymentPopup(true)
    }

    // Record the payment AND stamp checked_out_at in one flow
    const handleRecordPayment = async () => {
        if (!paymentAppt) return
        if (!paymentMethod) {
            alert('Please pick a payment method (Cash, Zelle, or Venmo)')
            return
        }

        const amt = parseFloat(paymentAmount || 0)
        const tip = parseFloat(tipAmount || 0)
        const discount = parseFloat(discountAmount || 0)

        if (amt < 0 || tip < 0 || discount < 0) {
            alert('Amounts cannot be negative')
            return
        }

        setRecordingPayment(true)
        const { data: { user } } = await supabase.auth.getUser()

        // 1. Update discount on appointment if it changed
        const currentDiscount = parseFloat(paymentAppt.discount_amount || 0)
        if (discount !== currentDiscount || discountReason !== (paymentAppt.discount_reason || '')) {
            await supabase.from('appointments').update({
                discount_amount: discount,
                discount_reason: discountReason || null
            }).eq('id', paymentAppt.id)
        }

        // 2. Create payment row (skip if amount and tip are both 0 — just updating discount)
        if (amt > 0 || tip > 0) {
            const { error } = await supabase.from('payments').insert({
                appointment_id: paymentAppt.id,
                client_id: paymentAppt.client_id,
                groomer_id: user.id,
                amount: amt,
                tip_amount: tip,
                method: paymentMethod,
                notes: paymentNotes || null
            })
            if (error) {
                alert('Error recording payment: ' + error.message)
                setRecordingPayment(false)
                return
            }
        }

        // 3. Stamp checked_out_at
        const now = new Date().toISOString()
        await supabase.from('appointments').update({
            checked_out_at: now,
            checked_out_by: user.id
        }).eq('id', paymentAppt.id)

        // 4. Update popup view if this appt is open
        if (selectedAppt && selectedAppt.id === paymentAppt.id) {
            setSelectedAppt({
                ...selectedAppt,
                checked_out_at: now,
                checked_out_by: user.id,
                discount_amount: discount,
                discount_reason: discountReason
            })
        }

        // 5. Refresh + close
        await fetchData()
        // Refresh the payment history inside the open appointment popup
        if (selectedAppt && selectedAppt.id === paymentAppt.id) {
            const { data: refreshedPayments } = await supabase
                .from('payments')
                .select('*')
                .eq('appointment_id', paymentAppt.id)
                .order('created_at', { ascending: true })
            setApptPayments(refreshedPayments || [])
        }
        setShowPaymentPopup(false)
        setPaymentAppt(null)
        setRecordingPayment(false)
    }

    // Already paid in full — just confirm and stamp check-out
    const confirmPaidInFull = async () => {
        if (!paymentAppt) return
        setRecordingPayment(true)
        const { data: { user } } = await supabase.auth.getUser()
        const now = new Date().toISOString()

        await supabase.from('appointments').update({
            checked_out_at: now,
            checked_out_by: user.id
        }).eq('id', paymentAppt.id)

        if (selectedAppt && selectedAppt.id === paymentAppt.id) {
            setSelectedAppt({ ...selectedAppt, checked_out_at: now, checked_out_by: user.id })
        }

        await fetchData()
        setShowPaymentPopup(false)
        setPaymentAppt(null)
        setRecordingPayment(false)
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

            {/* Groomer color legend */}
            {staffMembers.length > 0 && view !== 'month' && (
                <div className="groomer-legend">
                    <span className="groomer-legend-label">🎨 Groomers:</span>
                    {staffMembers.map((g) => (
                        <span key={g.id} className="groomer-legend-item">
                            <span className="groomer-legend-swatch" style={{ backgroundColor: g.color_code || '#9ca3af' }}></span>
                            {g.first_name} {g.last_name}
                        </span>
                    ))}
                    <span className="groomer-legend-item groomer-legend-unassigned">
                        <span className="groomer-legend-swatch" style={{ backgroundColor: '#9ca3af' }}></span>
                        Unassigned
                    </span>
                </div>
            )}

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
                            staff={staffMembers}
                            onSlotClick={handleTimeSlotClick}
                            onApptClick={handleApptClick}
                            onCheckIn={handleCheckIn}
                            onCheckOut={handleCheckOut}
                            checkingIn={checkingIn}
                            checkingOut={checkingOut}
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
                    staffMembers={staffMembers}
                    preFillClientId={preFillBooking?.client_id}
                    preFillPetId={preFillBooking?.pet_id}
                    preFillServiceId={preFillBooking?.service_id}
                    preFillStaffId={preFillBooking?.staff_id}
                    onClose={() => {
                        setShowAddForm(false)
                        setPreFillBooking(null)
                    }}
                    onSaved={() => {
                        setShowAddForm(false)
                        setPreFillBooking(null)
                        fetchData()
                    }}
                />
            )}

            {/* Reschedule Modal (Task #26) */}
            {reschedulingAppt && (
                <RescheduleModal
                    appt={reschedulingAppt}
                    appointments={appointments}
                    onClose={() => setReschedulingAppt(null)}
                    onSaved={() => {
                        setReschedulingAppt(null)
                        fetchData()
                    }}
                />
            )}

            {/* Cancel Modal (Task #19 — 3-option picker for recurring cancellation) */}
            {cancellingAppt && (
                <CancelAppointmentModal
                    appt={cancellingAppt}
                    onClose={() => setCancellingAppt(null)}
                    onSaved={() => {
                        setCancellingAppt(null)
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

                            {/* Task #19 — Recurring series info */}
                            {selectedAppt.recurring_series_id && selectedAppt.recurring_series && (() => {
                                const remaining = selectedAppt.recurring_upcoming_count || 0
                                const isLow = remaining > 0 && remaining < 4
                                const startDate = new Date(selectedAppt.recurring_series.start_date + 'T00:00:00')
                                const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' })
                                return (
                                    <div className={'appt-detail-recurring' + (selectedAppt.recurring_conflict ? ' appt-detail-recurring-conflict' : '')}>
                                        <div className="appt-detail-recurring-top">
                                            <span className="appt-detail-recurring-icon">🔄</span>
                                            <div className="appt-detail-recurring-info">
                                                <div className="appt-detail-recurring-title">Recurring Appointment</div>
                                                <div className="appt-detail-recurring-cadence">
                                                    Every {selectedAppt.recurring_series.interval_weeks} {selectedAppt.recurring_series.interval_weeks === 1 ? 'week' : 'weeks'} on {dayName}, {selectedAppt.recurring_series.total_count} times
                                                </div>
                                                {selectedAppt.recurring_sequence && (
                                                    <div className="appt-detail-recurring-seq">
                                                        Appointment #{selectedAppt.recurring_sequence} of {selectedAppt.recurring_series.total_count}
                                                    </div>
                                                )}
                                            </div>
                                            {remaining > 0 && (
                                                <span className={'appt-detail-recurring-badge' + (isLow ? ' appt-detail-recurring-badge-low' : '')}>
                                                    {isLow ? `${remaining} LEFT` : `${remaining} UPCOMING`}
                                                </span>
                                            )}
                                        </div>
                                        {selectedAppt.recurring_conflict && (
                                            <div className="appt-detail-recurring-conflict-warn">
                                                ⚠️ This instance conflicts with another booking. Click Reschedule to move it, or leave as-is to override.
                                            </div>
                                        )}
                                        {isLow && (
                                            <div className="appt-detail-recurring-renewal">
                                                ⏰ Only {remaining} left — consider booking a new series to keep {selectedAppt.pets?.name} on schedule.
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            {/* Check In / Check Out */}
                            <div className="appt-checkinout-bar">
                                {!selectedAppt.checked_in_at && (
                                    <button
                                        className="appt-checkin-btn"
                                        onClick={() => handleCheckIn(selectedAppt.id)}
                                        disabled={checkingIn}
                                    >
                                        {checkingIn ? 'Checking in...' : '✓ Check In'}
                                    </button>
                                )}
                                {selectedAppt.checked_in_at && !selectedAppt.checked_out_at && (
                                    <>
                                        <div className="appt-checkinout-stamp appt-checkinout-stamp-in">
                                            <span className="appt-checkinout-label">✓ Checked In</span>
                                            <span className="appt-checkinout-time">
                                                {new Date(selectedAppt.checked_in_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <button
                                            className="appt-checkout-btn"
                                            onClick={() => handleCheckOut(selectedAppt.id)}
                                            disabled={checkingOut}
                                        >
                                            {checkingOut ? 'Checking out...' : '→ Check Out'}
                                        </button>
                                    </>
                                )}
                                {selectedAppt.checked_in_at && selectedAppt.checked_out_at && (
                                    <div className="appt-checkinout-complete">
                                        <div className="appt-checkinout-stamp appt-checkinout-stamp-in">
                                            <span className="appt-checkinout-label">✓ Checked In</span>
                                            <span className="appt-checkinout-time">
                                                {new Date(selectedAppt.checked_in_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="appt-checkinout-stamp appt-checkinout-stamp-out">
                                            <span className="appt-checkinout-label">✓ Checked Out</span>
                                            <span className="appt-checkinout-time">
                                                {new Date(selectedAppt.checked_out_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Groomer */}
                            <div className="appt-detail-section">
                                <div className="appt-detail-section-title">✂️ Groomer</div>
                                {selectedAppt.staff_members ? (
                                    <div className="appt-detail-groomer-card">
                                        <span className="appt-detail-groomer-swatch" style={{ backgroundColor: selectedAppt.staff_members.color_code || '#9ca3af' }}></span>
                                        <div>
                                            <div className="appt-detail-groomer-name">{selectedAppt.staff_members.first_name} {selectedAppt.staff_members.last_name}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="appt-detail-groomer-card appt-detail-groomer-unassigned">
                                        <span className="appt-detail-groomer-swatch" style={{ backgroundColor: '#9ca3af' }}></span>
                                        <div>
                                            <div className="appt-detail-groomer-name">Unassigned</div>
                                            <div className="appt-detail-groomer-hint">Edit this appointment to assign a groomer</div>
                                        </div>
                                    </div>
                                )}
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

                            {/* Payment History (paper trail) */}
                            {(() => {
                                const servicePrice = parseFloat(selectedAppt.final_price || selectedAppt.quoted_price || 0)
                                const discount = parseFloat(selectedAppt.discount_amount || 0)
                                const totalPaid = apptPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
                                const totalTips = apptPayments.reduce((sum, p) => sum + parseFloat(p.tip_amount || 0), 0)
                                const amountDue = Math.max(0, servicePrice - discount)
                                const balance = Math.max(0, amountDue - totalPaid)
                                const methodIcon = (m) => m === 'cash' ? '💵' : m === 'zelle' ? '⚡' : m === 'venmo' ? '🔵' : m === 'card' ? '💳' : m === 'check' ? '📝' : '•'

                                return (
                                    <div className="appt-detail-section">
                                        <div className="appt-detail-section-title">💳 Payment History</div>
                                        {apptPayments.length === 0 ? (
                                            <div className="appt-payments-empty">
                                                No payments recorded yet
                                                {balance > 0 && <span className="appt-payments-balance-chip"> · Balance Due ${balance.toFixed(2)}</span>}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="appt-payments-list">
                                                    {apptPayments.map(p => (
                                                        <div key={p.id} className="appt-payment-row">
                                                            <div className="appt-payment-main">
                                                                <span className="appt-payment-method">
                                                                    {methodIcon(p.method)} {p.method.toUpperCase()}
                                                                </span>
                                                                <span className="appt-payment-date">
                                                                    {new Date(p.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <div className="appt-payment-amounts">
                                                                <span className="appt-payment-amount">${parseFloat(p.amount).toFixed(2)}</span>
                                                                {parseFloat(p.tip_amount) > 0 && (
                                                                    <span className="appt-payment-tip">+ ${parseFloat(p.tip_amount).toFixed(2)} tip</span>
                                                                )}
                                                            </div>
                                                            {p.notes && <div className="appt-payment-notes">"{p.notes}"</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="appt-payments-summary">
                                                    <div className="appt-payments-summary-row">
                                                        <span>Service</span>
                                                        <span>${servicePrice.toFixed(2)}</span>
                                                    </div>
                                                    {discount > 0 && (
                                                        <div className="appt-payments-summary-row appt-payments-summary-discount">
                                                            <span>Discount{selectedAppt.discount_reason ? ` (${selectedAppt.discount_reason})` : ''}</span>
                                                            <span>− ${discount.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className="appt-payments-summary-row">
                                                        <span>Total Paid</span>
                                                        <span>${totalPaid.toFixed(2)}</span>
                                                    </div>
                                                    {totalTips > 0 && (
                                                        <div className="appt-payments-summary-row appt-payments-summary-tips">
                                                            <span>Tips</span>
                                                            <span>${totalTips.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    <div className={'appt-payments-summary-row appt-payments-summary-balance ' + (balance < 0.01 ? 'appt-payments-summary-paid' : 'appt-payments-summary-owed')}>
                                                        <span>{balance < 0.01 ? '✓ Paid in Full' : 'Balance Due'}</span>
                                                        <span>${balance.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            })()}

                            {/* Appointment Notes Timeline (paper trail) */}
                            <div className="appt-detail-section">
                                <div className="appt-detail-section-title">📝 Appointment Notes</div>

                                {/* Legacy service_notes — show only if there are no timeline notes yet */}
                                {apptNotes.length === 0 && selectedAppt.service_notes && (
                                    <div className="appt-detail-notes appt-notes-legacy">
                                        {selectedAppt.service_notes}
                                    </div>
                                )}

                                {/* Timeline of notes — oldest first, like a conversation */}
                                {apptNotes.length > 0 && (
                                    <div className="appt-notes-timeline">
                                        {apptNotes.map((note) => (
                                            <div key={note.id} className="appt-note-item">
                                                <div className="appt-note-header">
                                                    <span className={'appt-note-type appt-note-type-' + note.note_type}>
                                                        {note.note_type === 'booking' ? '📅 At booking' :
                                                         note.note_type === 'day-of' ? '🌅 Day of' :
                                                         note.note_type === 'post-visit' ? '✂️ Post visit' :
                                                         '📝 Note'}
                                                    </span>
                                                    <span className="appt-note-time">
                                                        {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="appt-note-content">{note.content}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Empty state */}
                                {apptNotes.length === 0 && !selectedAppt.service_notes && (
                                    <div className="appt-notes-empty">No notes yet — add the first one below.</div>
                                )}

                                {/* Add Note button */}
                                <button
                                    type="button"
                                    className="appt-notes-add-btn"
                                    onClick={() => setShowAddNotePopup(true)}
                                >
                                    + Add Note
                                </button>
                            </div>

                            {/* Flags */}
                            {selectedAppt.has_flags && selectedAppt.flag_details && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">⚠️ PetPro AI Flags</div>
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
                                {selectedAppt.status === 'pending' && (
                                    <button className="appt-action-btn appt-action-confirm" onClick={() => updateApptStatus(selectedAppt.id, 'confirmed')}>
                                        ✔️ Confirm
                                    </button>
                                )}
                                {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && selectedAppt.status !== 'no_show' && (
                                    <>
                                        <button className="appt-action-btn appt-action-reschedule" onClick={() => {
                                            setReschedulingAppt(selectedAppt)
                                            setSelectedAppt(null) // close the detail popup so reschedule modal is clearly on top
                                        }}>
                                            📅 Reschedule
                                        </button>
                                        <button className="appt-action-btn appt-action-noshow" onClick={() => updateApptStatus(selectedAppt.id, 'no_show')}>
                                            🚫 No Show
                                        </button>
                                        <button className="appt-action-btn appt-action-cancel" onClick={() => {
                                            setCancellingAppt(selectedAppt)
                                            setSelectedAppt(null)
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

            {/* Add Note Popup — permanent paper trail entry */}
            {showAddNotePopup && selectedAppt && (
                <div className="modal-overlay" onClick={() => !savingNote && setShowAddNotePopup(false)} style={{ zIndex: 2000 }}>
                    <div className="add-note-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="add-note-popup-header">
                            <h3>📝 Add Note</h3>
                            <button className="modal-close" onClick={() => !savingNote && setShowAddNotePopup(false)}>×</button>
                        </div>
                        <div className="add-note-popup-body">
                            <p className="add-note-popup-hint">
                                Notes are permanent for the paper trail — use for owner requests, day-of changes, or post-visit observations.
                            </p>
                            <textarea
                                className="add-note-popup-textarea"
                                value={newNoteText}
                                onChange={(e) => setNewNoteText(e.target.value)}
                                placeholder="e.g., Owner wants face trimmed shorter today / Dog very anxious, took breaks / Follow up tomorrow about skin"
                                rows={5}
                                autoFocus
                            />
                        </div>
                        <div className="add-note-popup-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setShowAddNotePopup(false)}
                                disabled={savingNote}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleSaveNote}
                                disabled={savingNote || !newNoteText.trim()}
                            >
                                {savingNote ? 'Saving...' : 'Save Note'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment at Checkout Popup */}
            {showPaymentPopup && paymentAppt && (() => {
                const servicePrice = parseFloat(paymentAppt.final_price || paymentAppt.quoted_price || 0)
                const discount = parseFloat(discountAmount || 0)
                const totalPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
                const amountDue = Math.max(0, servicePrice - discount)
                const balance = Math.max(0, amountDue - totalPaid)
                const thisPayment = parseFloat(paymentAmount || 0)
                const thisTip = parseFloat(tipAmount || 0)
                const thisTotal = thisPayment + thisTip
                const isPaidInFull = balance < 0.01

                return (
                    <div className="modal-overlay" onClick={() => !recordingPayment && setShowPaymentPopup(false)} style={{ zIndex: 2000 }}>
                        <div className="payment-popup" onClick={(e) => e.stopPropagation()}>
                            <div className="payment-popup-header">
                                <h3>💳 Take Payment</h3>
                                <button className="modal-close" onClick={() => !recordingPayment && setShowPaymentPopup(false)}>×</button>
                            </div>

                            <div className="payment-popup-body">
                                {/* Who */}
                                <div className="payment-popup-who">
                                    <span className="payment-popup-pet">{paymentAppt.pets?.name || 'Unknown pet'}</span>
                                    <span className="payment-popup-dot">·</span>
                                    <span className="payment-popup-client">{paymentAppt.clients?.first_name} {paymentAppt.clients?.last_name}</span>
                                </div>

                                {/* Receipt Breakdown */}
                                <div className="payment-receipt">
                                    <div className="payment-receipt-row">
                                        <span>Service</span>
                                        <span>${servicePrice.toFixed(2)}</span>
                                    </div>

                                    {/* Discount field — editable */}
                                    <div className="payment-receipt-row payment-receipt-discount">
                                        <span>Discount</span>
                                        <div className="payment-discount-inputs">
                                            <span className="payment-dollar-prefix">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="payment-discount-input"
                                                value={discountAmount}
                                                onChange={(e) => setDiscountAmount(e.target.value)}
                                                placeholder="0.00"
                                                disabled={recordingPayment}
                                            />
                                        </div>
                                    </div>

                                    {discount > 0 && (
                                        <div className="payment-receipt-row payment-receipt-sub">
                                            <input
                                                type="text"
                                                className="payment-discount-reason"
                                                placeholder="Reason (optional) — e.g., friend rate, loyalty"
                                                value={discountReason}
                                                onChange={(e) => setDiscountReason(e.target.value)}
                                                disabled={recordingPayment}
                                            />
                                        </div>
                                    )}

                                    {/* Prior payments if any */}
                                    {existingPayments.length > 0 && (
                                        <>
                                            <div className="payment-receipt-divider"></div>
                                            <div className="payment-receipt-priors">
                                                <div className="payment-receipt-priors-label">Prior payments:</div>
                                                {existingPayments.map(p => (
                                                    <div key={p.id} className="payment-receipt-row payment-receipt-prior">
                                                        <span>
                                                            {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            {' · '}
                                                            <strong>{p.method.toUpperCase()}</strong>
                                                            {parseFloat(p.tip_amount) > 0 && ` (+ $${parseFloat(p.tip_amount).toFixed(2)} tip)`}
                                                        </span>
                                                        <span>${parseFloat(p.amount).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    <div className="payment-receipt-divider"></div>
                                    <div className="payment-receipt-row payment-receipt-balance">
                                        <span>Balance Due</span>
                                        <span>${balance.toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* PAID IN FULL state OR payment form */}
                                {isPaidInFull ? (
                                    <div className="payment-paid-in-full">
                                        <div className="payment-paid-in-full-icon">✓</div>
                                        <div className="payment-paid-in-full-label">PAID IN FULL</div>
                                        <div className="payment-paid-in-full-sub">
                                            No balance owed — ready to check out
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Payment Method Buttons */}
                                        <div className="payment-method-label">Payment Method</div>
                                        <div className="payment-method-buttons">
                                            <button
                                                type="button"
                                                className={'payment-method-btn' + (paymentMethod === 'cash' ? ' payment-method-btn-active' : '')}
                                                onClick={() => setPaymentMethod('cash')}
                                                disabled={recordingPayment}
                                            >
                                                💵 Cash
                                            </button>
                                            <button
                                                type="button"
                                                className={'payment-method-btn' + (paymentMethod === 'zelle' ? ' payment-method-btn-active' : '')}
                                                onClick={() => setPaymentMethod('zelle')}
                                                disabled={recordingPayment}
                                            >
                                                ⚡ Zelle
                                            </button>
                                            <button
                                                type="button"
                                                className={'payment-method-btn' + (paymentMethod === 'venmo' ? ' payment-method-btn-active' : '')}
                                                onClick={() => setPaymentMethod('venmo')}
                                                disabled={recordingPayment}
                                            >
                                                🔵 Venmo
                                            </button>
                                        </div>

                                        {/* Amount + Tip side by side */}
                                        <div className="payment-amount-row">
                                            <div className="payment-field">
                                                <label>Amount</label>
                                                <div className="payment-input-wrap">
                                                    <span className="payment-dollar-prefix">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={paymentAmount}
                                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                                        placeholder="0.00"
                                                        disabled={recordingPayment}
                                                    />
                                                </div>
                                            </div>
                                            <div className="payment-field">
                                                <label>Tip (optional)</label>
                                                <div className="payment-input-wrap">
                                                    <span className="payment-dollar-prefix">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={tipAmount}
                                                        onChange={(e) => setTipAmount(e.target.value)}
                                                        placeholder="0.00"
                                                        disabled={recordingPayment}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Notes */}
                                        <div className="payment-field">
                                            <label>Notes (optional)</label>
                                            <input
                                                type="text"
                                                className="payment-notes-input"
                                                value={paymentNotes}
                                                onChange={(e) => setPaymentNotes(e.target.value)}
                                                placeholder="e.g., owes $10 next visit / paid cash tip on top"
                                                disabled={recordingPayment}
                                            />
                                        </div>

                                        {/* This transaction total */}
                                        {thisTotal > 0 && (
                                            <div className="payment-this-total">
                                                <span>This transaction</span>
                                                <span><strong>${thisTotal.toFixed(2)}</strong></span>
                                            </div>
                                        )}

                                        {/* Partial payment warning */}
                                        {thisPayment > 0 && thisPayment < balance && (
                                            <div className="payment-partial-warning">
                                                ⚠️ Partial payment — ${(balance - thisPayment).toFixed(2)} will remain owed
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="payment-popup-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setShowPaymentPopup(false)}
                                    disabled={recordingPayment}
                                >
                                    Cancel
                                </button>
                                {isPaidInFull ? (
                                    <button
                                        type="button"
                                        className="btn-primary payment-checkout-btn"
                                        onClick={confirmPaidInFull}
                                        disabled={recordingPayment}
                                    >
                                        {recordingPayment ? 'Checking out...' : '✓ Confirm Check Out'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-primary payment-checkout-btn"
                                        onClick={handleRecordPayment}
                                        disabled={recordingPayment || !paymentMethod}
                                    >
                                        {recordingPayment ? 'Recording...' : 'Record Payment & Check Out'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

function TimeGridView({ view, currentDate, appointments, staff, onSlotClick, onApptClick, onCheckIn, onCheckOut, checkingIn, checkingOut }) {
    const dates = view === 'day' ? [currentDate] : getWeekDates(currentDate)
    const today = new Date()
    const isDayView = view === 'day'
    // In Day view: one column per groomer + "Unassigned" at the end. In Week view: one column per day.
    const dayColumns = isDayView
        ? [...(staff || []), { id: null, first_name: 'Unassigned', color_code: '#9ca3af' }]
        : []

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
                {isDayView ? (
                    dayColumns.map((col, i) => (
                        <div
                            key={col.id || 'unassigned'}
                            className="time-col-header"
                        >
                            <span
                                className="groomer-col-swatch"
                                style={{ backgroundColor: col.color_code || '#9ca3af' }}
                            ></span>
                            <span className="groomer-col-name">{col.first_name}{col.last_name ? ' ' + col.last_name.charAt(0) + '.' : ''}</span>
                        </div>
                    ))
                ) : (
                    dates.map((date, i) => (
                        <div
                            key={i}
                            className={`time-col-header ${isSameDay(date, today) ? 'today' : ''}`}
                        >
                            <span className="day-name">{DAY_NAMES[date.getDay()]}</span>
                            <span className="day-number">{date.getDate()}</span>
                        </div>
                    ))
                )}
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
                        {isDayView ? (
                            dayColumns.map((col, i) => {
                                const dateStr = dateToString(currentDate)
                                const slotAppts = appointments.filter((a) => {
                                    if (a.appointment_date !== dateStr) return false
                                    if (a.status === 'cancelled' || a.status === 'rescheduled') return false
                                    const startH = parseInt(a.start_time.split(':')[0])
                                    if (startH !== hour) return false
                                    // Match appointment to this staff column (null = Unassigned)
                                    return (a.staff_id || null) === (col.id || null)
                                })
                                return (
                                    <div
                                        key={col.id || 'unassigned'}
                                        className="time-cell"
                                        onClick={() => onSlotClick(currentDate, hour, col.id)}
                                    >{renderApptBlocks(slotAppts, onApptClick, onCheckIn, onCheckOut, checkingIn, checkingOut)}</div>
                                )
                            })
                        ) : (
                        dates.map((date, i) => {
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
                                        const groomerColor = appt.staff_members?.color_code || '#9ca3af'
                                        const groomerName = appt.staff_members ? appt.staff_members.first_name : 'Unassigned'
                                        const isRecurring = !!appt.recurring_series_id
                                        const hasConflict = !!appt.recurring_conflict
                                        return (
                                            <div
                                                key={appt.id}
                                                className={
                                                    'appt-block' +
                                                    (!appt.staff_members ? ' appt-unassigned' : '') +
                                                    (appt.checked_in_at && !appt.checked_out_at ? ' appt-checked-in' : '') +
                                                    (appt.checked_out_at ? ' appt-checked-out' : '') +
                                                    (hasConflict ? ' appt-recurring-conflict' : '')
                                                }
                                                style={{
                                                    backgroundColor: groomerColor,
                                                    borderLeft: '4px solid ' + groomerColor,
                                                    height: `${span * 100}%`,
                                                    minHeight: '48px',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={(e) => onApptClick(appt, e)}
                                                title={'Groomer: ' + groomerName + (isRecurring ? ' · Recurring appointment' : '') + (hasConflict ? ' · ⚠️ Conflict' : '')}
                                            >
                                                <span className="appt-time">{formatTime(appt.start_time)}</span>
                                                <span className="appt-pet">{appt.pets?.name}</span>
                                                <span className="appt-client">{appt.clients?.first_name} {appt.clients?.last_name}</span>
                                                <span className="appt-groomer-tag">{groomerName}</span>
                                                {isRecurring && <span className="appt-recurring-icon" title="Recurring">🔄</span>}
                                                {hasConflict && <span className="appt-conflict-icon" title="Conflict">⚠️</span>}
                                                {appt.has_flags && <span className="appt-flag">⚠️</span>}
                                                {/* Check In / Out button directly on tile */}
                                                {!appt.checked_in_at && (
                                                    <button
                                                        className="appt-tile-check-btn appt-tile-checkin"
                                                        onClick={(e) => { e.stopPropagation(); onCheckIn && onCheckIn(appt.id) }}
                                                        disabled={checkingIn}
                                                        title="Check In"
                                                    >
                                                        ✓ IN
                                                    </button>
                                                )}
                                                {appt.checked_in_at && !appt.checked_out_at && (
                                                    <button
                                                        className="appt-tile-check-btn appt-tile-checkout"
                                                        onClick={(e) => { e.stopPropagation(); onCheckOut && onCheckOut(appt.id) }}
                                                        disabled={checkingOut}
                                                        title="Check Out"
                                                    >
                                                        → OUT
                                                    </button>
                                                )}
                                                {appt.checked_out_at && (
                                                    <span className="appt-tile-done-badge">✓ DONE</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function renderApptBlocks(slotAppts, onApptClick, onCheckIn, onCheckOut, checkingIn, checkingOut) {
    return slotAppts.map((appt) => {
        const startH = parseInt(appt.start_time.split(':')[0])
        const endH = parseInt(appt.end_time.split(':')[0])
        const span = Math.max(1, endH - startH)
        const groomerColor = appt.staff_members?.color_code || '#9ca3af'
        const groomerName = appt.staff_members ? appt.staff_members.first_name : 'Unassigned'
        const isRecurring = !!appt.recurring_series_id
        const hasConflict = !!appt.recurring_conflict
        return (
            <div
                key={appt.id}
                className={
                    'appt-block' +
                    (!appt.staff_members ? ' appt-unassigned' : '') +
                    (appt.checked_in_at && !appt.checked_out_at ? ' appt-checked-in' : '') +
                    (appt.checked_out_at ? ' appt-checked-out' : '') +
                    (hasConflict ? ' appt-recurring-conflict' : '')
                }
                style={{
                    backgroundColor: groomerColor,
                    borderLeft: '4px solid ' + groomerColor,
                    height: `${span * 100}%`,
                    minHeight: '48px',
                    cursor: 'pointer',
                }}
                onClick={(e) => onApptClick(appt, e)}
                title={'Groomer: ' + groomerName + (isRecurring ? ' · Recurring appointment' : '') + (hasConflict ? ' · ⚠️ Conflict' : '')}
            >
                <span className="appt-time">{formatTime(appt.start_time)}</span>
                <span className="appt-pet">{appt.pets?.name}</span>
                <span className="appt-client">{appt.clients?.first_name} {appt.clients?.last_name}</span>
                <span className="appt-groomer-tag">{groomerName}</span>
                {isRecurring && <span className="appt-recurring-icon" title="Recurring">🔄</span>}
                {hasConflict && <span className="appt-conflict-icon" title="Conflict">⚠️</span>}
                {appt.has_flags && <span className="appt-flag">⚠️</span>}
                {!appt.checked_in_at && (
                    <button
                        className="appt-tile-check-btn appt-tile-checkin"
                        onClick={(e) => { e.stopPropagation(); onCheckIn && onCheckIn(appt.id) }}
                        disabled={checkingIn}
                        title="Check In"
                    >
                        ✓ IN
                    </button>
                )}
                {appt.checked_in_at && !appt.checked_out_at && (
                    <button
                        className="appt-tile-check-btn appt-tile-checkout"
                        onClick={(e) => { e.stopPropagation(); onCheckOut && onCheckOut(appt.id) }}
                        disabled={checkingOut}
                        title="Check Out"
                    >
                        → OUT
                    </button>
                )}
                {appt.checked_out_at && (
                    <span className="appt-tile-done-badge">✓ DONE</span>
                )}
            </div>
        )
    })
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

function AddAppointmentModal({ date, time, clients, pets, services, staffMembers, onClose, onSaved, preFillClientId, preFillPetId, preFillServiceId, preFillStaffId }) {
    const [form, setForm] = useState({
        client_id: preFillClientId || '',
        pet_id: preFillPetId || '',
        service_id: preFillServiceId || '',
        staff_id: preFillStaffId || '',
        appointment_date: date || '',
        start_time: time || '09:00',
        end_time: '',
        quoted_price: '',
        service_notes: '',
        status: 'confirmed',
    })
    // Task #19 — Recurring series state
    const [isRecurring, setIsRecurring] = useState(false)
    const [intervalWeeks, setIntervalWeeks] = useState(6)
    const [totalCount, setTotalCount] = useState(10)
    const [recurringSummary, setRecurringSummary] = useState(null) // {created: 10, conflicts: 2, conflictDates: ['Jun 15', 'Jul 27']}
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

    // Task #19 — Check if two time ranges overlap (for recurring conflict detection)
    const timesOverlap = (startA, endA, startB, endB) => {
        if (!startA || !endA || !startB || !endB) return false
        return startA < endB && startB < endA
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

        const endTime = form.end_time || calculateEndTime(form.start_time, 60)

        // ═══════════ Task #19 — Recurring series path ═══════════
        if (isRecurring) {
            try {
                // 1. Create the recurring_series row
                const { data: seriesRow, error: seriesErr } = await supabase
                    .from('recurring_series')
                    .insert({
                        groomer_id: user.id,
                        client_id: form.client_id,
                        pet_id: form.pet_id,
                        service_id: form.service_id || null,
                        staff_id: form.staff_id || null,
                        interval_weeks: intervalWeeks,
                        total_count: totalCount,
                        start_date: form.appointment_date,
                        start_time: form.start_time,
                        status: 'active',
                    })
                    .select()
                    .single()

                if (seriesErr) throw new Error('Failed to create series: ' + seriesErr.message)

                // 2. Generate all N appointment dates
                const generatedAppts = []
                const baseDate = new Date(form.appointment_date + 'T00:00:00')
                for (let i = 0; i < totalCount; i++) {
                    const apptDate = new Date(baseDate)
                    apptDate.setDate(baseDate.getDate() + (i * intervalWeeks * 7))
                    const yyyy = apptDate.getFullYear()
                    const mm = String(apptDate.getMonth() + 1).padStart(2, '0')
                    const dd = String(apptDate.getDate()).padStart(2, '0')
                    generatedAppts.push({
                        date_str: `${yyyy}-${mm}-${dd}`,
                        sequence: i + 1,
                    })
                }

                // 3. Fetch existing appointments for conflict check (same groomer, same staff, same date range)
                const firstDateStr = generatedAppts[0].date_str
                const lastDateStr = generatedAppts[generatedAppts.length - 1].date_str
                const { data: existingAppts } = await supabase
                    .from('appointments')
                    .select('appointment_date, start_time, end_time, staff_id, status, pets(name)')
                    .eq('groomer_id', user.id)
                    .gte('appointment_date', firstDateStr)
                    .lte('appointment_date', lastDateStr)
                    .not('status', 'in', '(cancelled,rescheduled)')

                // 4. Build rows for bulk insert, flagging conflicts
                const rowsToInsert = generatedAppts.map(g => {
                    let conflict = false
                    if (form.staff_id && existingAppts) {
                        conflict = existingAppts.some(a =>
                            a.appointment_date === g.date_str &&
                            a.staff_id === form.staff_id &&
                            timesOverlap(form.start_time, endTime, a.start_time, a.end_time)
                        )
                    }
                    return {
                        groomer_id: user.id,
                        client_id: form.client_id,
                        pet_id: form.pet_id,
                        service_id: form.service_id || null,
                        staff_id: form.staff_id || null,
                        appointment_date: g.date_str,
                        start_time: form.start_time,
                        end_time: endTime,
                        quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
                        service_notes: form.service_notes || null,
                        status: form.status,
                        has_flags: hasFlags || false,
                        flag_details: flagDetails,
                        flag_status: flagStatus,
                        recurring_series_id: seriesRow.id,
                        recurring_sequence: g.sequence,
                        recurring_conflict: conflict,
                    }
                })

                // 5. Bulk insert all appointments
                const { error: bulkErr } = await supabase
                    .from('appointments')
                    .insert(rowsToInsert)

                if (bulkErr) throw new Error('Failed to create appointments: ' + bulkErr.message)

                // 6. Build summary for user
                const conflicts = rowsToInsert.filter(r => r.recurring_conflict)
                setRecurringSummary({
                    created: rowsToInsert.length,
                    conflicts: conflicts.length,
                    conflictDates: conflicts.map(c => c.appointment_date),
                })
                setSaving(false)
                return // Don't call onSaved yet — user needs to click "Done" on summary
            } catch (err) {
                setError(err.message)
                setSaving(false)
                return
            }
        }
        // ═══════════ End recurring path ═══════════

        const { data: newAppt, error: insertError } = await supabase
            .from('appointments')
            .insert({
                groomer_id: user.id,
                client_id: form.client_id,
                pet_id: form.pet_id,
                service_id: form.service_id || null,
                staff_id: form.staff_id || null,
                appointment_date: form.appointment_date,
                start_time: form.start_time,
                end_time: endTime,
                quoted_price: form.quoted_price ? parseFloat(form.quoted_price) : null,
                service_notes: form.service_notes || null,
                status: form.status,
                has_flags: hasFlags || false,
                flag_details: flagDetails,
                flag_status: flagStatus,
            })
            .select()
            .single()

        if (insertError) {
            setError(insertError.message)
            setSaving(false)
            return
        }

        // If notes were entered at booking, also save to notes table for paper trail
        if (form.service_notes && form.service_notes.trim() && newAppt) {
            await supabase.from('notes').insert({
                pet_id: form.pet_id,
                client_id: form.client_id,
                appointment_id: newAppt.id,
                groomer_id: user.id,
                note_type: 'booking',
                content: form.service_notes.trim()
            })
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

    // Task #19 — After a recurring series is saved, show summary before closing
    if (recurringSummary) {
        const conflictCount = recurringSummary.conflicts
        return (
            <div className="modal-overlay" onClick={() => {}}>
                <div className="modal recurring-summary-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h2>🔄 Recurring Series Created</h2>
                    </div>
                    <div className="recurring-summary-body">
                        <div className="recurring-summary-success">
                            <span className="recurring-summary-big">✅ {recurringSummary.created}</span>
                            <span className="recurring-summary-label">appointments booked</span>
                        </div>
                        {conflictCount > 0 ? (
                            <div className="recurring-summary-conflicts">
                                <div className="recurring-summary-warning">
                                    ⚠️ {conflictCount} {conflictCount === 1 ? 'appointment has' : 'appointments have'} a conflict
                                </div>
                                <p className="recurring-summary-conflict-list-label">Check these dates:</p>
                                <ul className="recurring-summary-conflict-list">
                                    {recurringSummary.conflictDates.map((d, i) => (
                                        <li key={i}>{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</li>
                                    ))}
                                </ul>
                                <p className="recurring-summary-conflict-tip">
                                    Yellow ⚠️ tiles mark conflicts on the calendar. Click one to reschedule or keep as-is.
                                </p>
                            </div>
                        ) : (
                            <p className="recurring-summary-all-clear">
                                🎉 No conflicts — every slot is clear!
                            </p>
                        )}
                    </div>
                    <div className="form-actions">
                        <button className="btn-primary" onClick={onSaved}>Done</button>
                    </div>
                </div>
            </div>
        )
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
                        <label>Groomer *</label>
                        <select name="staff_id" value={form.staff_id} onChange={handleChange} required>
                            <option value="">Select groomer...</option>
                            {staffMembers.map((g) => (
                                <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>
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

                    {/* Task #19 — Recurring appointment section */}
                    <div className="recurring-section">
                        <label className="recurring-checkbox-label">
                            <input
                                type="checkbox"
                                checked={isRecurring}
                                onChange={(e) => setIsRecurring(e.target.checked)}
                            />
                            <span className="recurring-checkbox-text">🔄 Repeat this appointment</span>
                        </label>

                        {isRecurring && (
                            <div className="recurring-options">
                                <div className="recurring-row">
                                    <span>Every</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="52"
                                        value={intervalWeeks}
                                        onChange={(e) => setIntervalWeeks(parseInt(e.target.value) || 1)}
                                        className="recurring-input"
                                    />
                                    <span>weeks,</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="52"
                                        value={totalCount}
                                        onChange={(e) => setTotalCount(parseInt(e.target.value) || 1)}
                                        className="recurring-input"
                                    />
                                    <span>times</span>
                                </div>
                                <p className="recurring-preview">
                                    This will create <strong>{totalCount} appointments</strong>, one every <strong>{intervalWeeks} {intervalWeeks === 1 ? 'week' : 'weeks'}</strong> on the same day and time.
                                </p>
                            </div>
                        )}
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
                            {saving
                                ? (isRecurring ? `Booking ${totalCount} appointments...` : 'Booking...')
                                : isRecurring
                                    ? `🔄 Book ${totalCount} Appointments`
                                    : safetyCheck && safetyCheck.approved ? 'Book Appointment \u2705' : 'Book Appointment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ══════════ RescheduleModal — Task #26 + #19 (recurring) ══════════
// Non-recurring appointments: simple date/time swap.
// Recurring: 3-option picker — this one / this + following / all client recurring.
function RescheduleModal({ appt, appointments, onClose, onSaved }) {
    const [newDate, setNewDate] = useState(appt.appointment_date || '')
    const [newTime, setNewTime] = useState(appt.start_time ? appt.start_time.slice(0, 5) : '09:00')
    // Task #19 — reschedule scope for recurring: 'one' | 'following' | 'all-client'
    const [scope, setScope] = useState('one')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const isRecurringAppt = !!appt.recurring_series_id

    // Calculate duration from existing appointment for end_time
    const duration = (() => {
        if (appt.services?.time_block_minutes) return appt.services.time_block_minutes
        if (appt.start_time && appt.end_time) {
            const [sh, sm] = appt.start_time.split(':').map(Number)
            const [eh, em] = appt.end_time.split(':').map(Number)
            return (eh * 60 + em) - (sh * 60 + sm)
        }
        return 60 // fallback
    })()

    const calcEndTime = (startTime, minutes) => {
        const [h, m] = startTime.split(':').map(Number)
        const totalMin = h * 60 + m + minutes
        const endH = Math.floor(totalMin / 60)
        const endM = totalMin % 60
        return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
    }

    // Check if the new slot overlaps with any other appointment (excluding this one)
    const checkConflict = () => {
        const newEndTime = calcEndTime(newTime, duration)
        const newStart = newTime
        const newEnd = newEndTime

        return appointments.find(a => {
            if (a.id === appt.id) return false
            if (a.status === 'cancelled' || a.status === 'no_show') return false
            if (a.appointment_date !== newDate) return false
            const aStart = a.start_time ? a.start_time.slice(0, 5) : ''
            const aEnd = a.end_time ? a.end_time.slice(0, 5) : ''
            if (!aStart || !aEnd) return false
            // Overlap check
            return newStart < aEnd && newEnd > aStart
        })
    }

    // Calculate how many days we're shifting by (positive = later, negative = earlier)
    const getDayDelta = () => {
        const oldDate = new Date(appt.appointment_date + 'T00:00:00')
        const updDate = new Date(newDate + 'T00:00:00')
        return Math.round((updDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Add N days to a YYYY-MM-DD date string
    const addDaysToDate = (dateStr, days) => {
        const d = new Date(dateStr + 'T00:00:00')
        d.setDate(d.getDate() + days)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
    }

    const handleSave = async (e) => {
        e.preventDefault()
        setError(null)

        if (!newDate || !newTime) {
            setError('Pick both a date and a time.')
            return
        }

        setSaving(true)
        const newEndTime = calcEndTime(newTime, duration)

        // ═══════════ Non-recurring OR "only this one" — single row update ═══════════
        if (!isRecurringAppt || scope === 'one') {
            // Warn on conflict but allow (groomer can adjust after)
            const conflict = checkConflict()
            if (conflict) {
                const confirmed = window.confirm(
                    `⚠️ That slot overlaps with another appointment (${conflict.clients?.first_name || ''} ${conflict.clients?.last_name || ''}). Reschedule anyway?`
                )
                if (!confirmed) {
                    setSaving(false)
                    return
                }
            }
            const { error: updateError } = await supabase
                .from('appointments')
                .update({
                    appointment_date: newDate,
                    start_time: newTime,
                    end_time: newEndTime,
                })
                .eq('id', appt.id)

            setSaving(false)
            if (updateError) {
                setError('Error rescheduling: ' + updateError.message)
                return
            }
            onSaved()
            return
        }

        // ═══════════ Recurring scope: "following" or "all-client" ═══════════
        const dayDelta = getDayDelta()
        const todayStr = new Date().toISOString().slice(0, 10)

        // Build the list of appointment IDs to shift
        let targetAppts = []
        try {
            if (scope === 'following') {
                // This appointment + all future ones in THIS series
                const { data, error: fetchErr } = await supabase
                    .from('appointments')
                    .select('id, appointment_date, start_time, end_time')
                    .eq('recurring_series_id', appt.recurring_series_id)
                    .gte('appointment_date', appt.appointment_date)
                    .is('checked_out_at', null)
                    .not('status', 'in', '(cancelled,rescheduled,completed,no_show)')
                if (fetchErr) throw fetchErr
                targetAppts = data || []
            } else if (scope === 'all-client') {
                // This appointment + all future recurring appts for this client (any series)
                const { data, error: fetchErr } = await supabase
                    .from('appointments')
                    .select('id, appointment_date, start_time, end_time, recurring_series_id')
                    .eq('client_id', appt.client_id)
                    .not('recurring_series_id', 'is', null)
                    .gte('appointment_date', todayStr)
                    .is('checked_out_at', null)
                    .not('status', 'in', '(cancelled,rescheduled,completed,no_show)')
                if (fetchErr) throw fetchErr
                targetAppts = data || []
            }

            if (targetAppts.length === 0) {
                setError('No appointments found to shift.')
                setSaving(false)
                return
            }

            // Build per-appointment update payloads (preserve time-of-day, shift date by delta)
            const updatePromises = targetAppts.map(a => {
                const shiftedDate = addDaysToDate(a.appointment_date, dayDelta)
                // For the exact appointment being edited, also apply the new time-of-day from the form
                if (a.id === appt.id) {
                    return supabase
                        .from('appointments')
                        .update({
                            appointment_date: newDate,
                            start_time: newTime,
                            end_time: newEndTime,
                        })
                        .eq('id', a.id)
                }
                // For all other appointments in scope, only shift the date (keep their original time)
                return supabase
                    .from('appointments')
                    .update({ appointment_date: shiftedDate })
                    .eq('id', a.id)
            })

            const results = await Promise.all(updatePromises)
            const firstErr = results.find(r => r.error)
            if (firstErr && firstErr.error) {
                throw new Error(firstErr.error.message)
            }

            setSaving(false)
            onSaved()
        } catch (err) {
            setSaving(false)
            setError('Error shifting appointments: ' + (err.message || 'unknown'))
        }
    }

    const petName = appt.pets?.name || 'this pet'
    const clientName = appt.clients ? `${appt.clients.first_name} ${appt.clients.last_name}` : ''
    const serviceName = appt.services?.service_name || 'Service'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="reschedule-modal" onClick={e => e.stopPropagation()}>
                <div className="reschedule-header">
                    <h2>📅 Reschedule Appointment</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="reschedule-summary">
                    <div className="reschedule-summary-row">
                        <span className="reschedule-summary-label">Client:</span>
                        <span className="reschedule-summary-value">{clientName}</span>
                    </div>
                    <div className="reschedule-summary-row">
                        <span className="reschedule-summary-label">Pet:</span>
                        <span className="reschedule-summary-value">🐾 {petName}</span>
                    </div>
                    <div className="reschedule-summary-row">
                        <span className="reschedule-summary-label">Service:</span>
                        <span className="reschedule-summary-value">✂️ {serviceName}</span>
                    </div>
                    <div className="reschedule-summary-row">
                        <span className="reschedule-summary-label">Currently:</span>
                        <span className="reschedule-summary-value reschedule-old-time">
                            {appt.appointment_date} at {formatTime(appt.start_time)}
                        </span>
                    </div>
                </div>

                <form onSubmit={handleSave} className="reschedule-form">
                    <div className="reschedule-field">
                        <label>New Date</label>
                        <input
                            type="date"
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            required
                        />
                    </div>
                    <div className="reschedule-field">
                        <label>New Time</label>
                        <input
                            type="time"
                            value={newTime}
                            onChange={e => setNewTime(e.target.value)}
                            required
                        />
                    </div>
                    <div className="reschedule-duration-note">
                        Appointment duration: {duration} min · new end time: {calcEndTime(newTime, duration)}
                    </div>

                    {/* Task #19 — 3-option picker for recurring reschedule */}
                    {isRecurringAppt && (
                        <div className="reschedule-scope">
                            <div className="reschedule-scope-title">🔄 This is a recurring appointment. What should change?</div>
                            <label className={'reschedule-scope-option' + (scope === 'one' ? ' reschedule-scope-selected' : '')}>
                                <input
                                    type="radio"
                                    name="scope"
                                    value="one"
                                    checked={scope === 'one'}
                                    onChange={() => setScope('one')}
                                />
                                <div className="reschedule-scope-label">
                                    <span className="reschedule-scope-name">Only this appointment</span>
                                    <span className="reschedule-scope-hint">Just move this one. The rest of the series stays put.</span>
                                </div>
                            </label>
                            <label className={'reschedule-scope-option' + (scope === 'following' ? ' reschedule-scope-selected' : '')}>
                                <input
                                    type="radio"
                                    name="scope"
                                    value="following"
                                    checked={scope === 'following'}
                                    onChange={() => setScope('following')}
                                />
                                <div className="reschedule-scope-label">
                                    <span className="reschedule-scope-name">This and following (this series only)</span>
                                    <span className="reschedule-scope-hint">Shifts this one and all future appointments in this series by the same number of days.</span>
                                </div>
                            </label>
                            <label className={'reschedule-scope-option reschedule-scope-option-power' + (scope === 'all-client' ? ' reschedule-scope-selected' : '')}>
                                <input
                                    type="radio"
                                    name="scope"
                                    value="all-client"
                                    checked={scope === 'all-client'}
                                    onChange={() => setScope('all-client')}
                                />
                                <div className="reschedule-scope-label">
                                    <span className="reschedule-scope-name">🌟 All future recurring for this client</span>
                                    <span className="reschedule-scope-hint">Shifts every future recurring appointment (FFT + groom + everything) by the same number of days. Saves 10 minutes when a client wants to push everything out.</span>
                                </div>
                            </label>
                        </div>
                    )}

                    {error && <div className="reschedule-error">{error}</div>}

                    <div className="reschedule-actions">
                        <button type="button" className="reschedule-btn reschedule-btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="reschedule-btn reschedule-btn-save" disabled={saving}>
                            {saving
                                ? (isRecurringAppt && scope !== 'one' ? 'Shifting appointments...' : 'Saving...')
                                : (isRecurringAppt && scope === 'following' ? '📅 Shift This & Following'
                                    : isRecurringAppt && scope === 'all-client' ? '🌟 Shift All Future Recurring'
                                    : '📅 Save New Date & Time')}
                        </button>
                    </div>

                    <div className="reschedule-tip">
                        💡 Need to change the service or groomer too? Save the new date first, then click into the appointment to edit anything else.
                    </div>
                </form>
            </div>
        </div>
    )
}


// ========================================================================
// Task #19 — Cancel Appointment Modal (3-option picker for recurring)
// UPDATES status='cancelled' (does NOT delete) so history is preserved
// for tracking chronic cancelers.
// ========================================================================
function CancelAppointmentModal({ appt, onClose, onSaved }) {
    // 'one' | 'following' | 'all-client'
    const [scope, setScope] = useState('one')
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const isRecurringAppt = !!appt.recurring_series_id

    // Friendly pet/client labels for the modal
    const petName = appt.pets?.name || 'this pet'
    const clientName = appt.clients
        ? `${appt.clients.first_name || ''} ${appt.clients.last_name || ''}`.trim()
        : 'this client'

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }
    const formatTime = (timeStr) => {
        if (!timeStr) return ''
        const [h, m] = timeStr.split(':').map(Number)
        const period = h >= 12 ? 'PM' : 'AM'
        const hour12 = h % 12 || 12
        return `${hour12}:${String(m).padStart(2, '0')} ${period}`
    }

    const handleCancelAppt = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        try {
            const todayStr = new Date().toISOString().slice(0, 10)
            const { data: { user } } = await supabase.auth.getUser()

            // Helper — drop a paper-trail note on an appointment so the reason
            // shows up on the timeline forever.
            const logCancelNote = async (apptId, petId, clientId) => {
                if (!reason.trim()) return
                await supabase.from('notes').insert({
                    pet_id: petId,
                    client_id: clientId,
                    appointment_id: apptId,
                    groomer_id: user?.id,
                    note_type: 'cancelled',
                    content: `CANCELLED: ${reason.trim()}`
                })
            }

            if (!isRecurringAppt || scope === 'one') {
                // Single cancel — just this appointment
                const { error: updErr } = await supabase
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('id', appt.id)
                if (updErr) throw updErr

                await logCancelNote(appt.id, appt.pet_id, appt.client_id)
            } else if (scope === 'following') {
                // This + all following in THIS series (from appt's date onward)
                // Fetch the affected appt ids first so we can drop a note on each
                const { data: toCancel, error: fetchErr } = await supabase
                    .from('appointments')
                    .select('id, pet_id, client_id')
                    .eq('recurring_series_id', appt.recurring_series_id)
                    .gte('appointment_date', appt.appointment_date)
                    .not('status', 'in', '(cancelled,checked_out,no_show)')
                if (fetchErr) throw fetchErr

                const { error: updErr } = await supabase
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('recurring_series_id', appt.recurring_series_id)
                    .gte('appointment_date', appt.appointment_date)
                    .not('status', 'in', '(cancelled,checked_out,no_show)')
                if (updErr) throw updErr

                // Mark series itself as cancelled
                await supabase
                    .from('recurring_series')
                    .update({ status: 'cancelled' })
                    .eq('id', appt.recurring_series_id)

                if (reason.trim() && toCancel) {
                    for (const a of toCancel) {
                        await logCancelNote(a.id, a.pet_id, a.client_id)
                    }
                }
            } else if (scope === 'all-client') {
                // Every future recurring appointment for this client,
                // across every series (FFT series + groom series + any other)
                const { data: toCancel, error: fetchErr } = await supabase
                    .from('appointments')
                    .select('id, pet_id, client_id')
                    .eq('client_id', appt.client_id)
                    .not('recurring_series_id', 'is', null)
                    .gte('appointment_date', todayStr)
                    .not('status', 'in', '(cancelled,checked_out,no_show)')
                if (fetchErr) throw fetchErr

                const { error: updErr } = await supabase
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('client_id', appt.client_id)
                    .not('recurring_series_id', 'is', null)
                    .gte('appointment_date', todayStr)
                    .not('status', 'in', '(cancelled,checked_out,no_show)')
                if (updErr) throw updErr

                // Mark all of this client's active recurring series as cancelled
                await supabase
                    .from('recurring_series')
                    .update({ status: 'cancelled' })
                    .eq('client_id', appt.client_id)
                    .eq('status', 'active')

                if (reason.trim() && toCancel) {
                    for (const a of toCancel) {
                        await logCancelNote(a.id, a.pet_id, a.client_id)
                    }
                }
            }

            onSaved && onSaved()
        } catch (err) {
            console.error('Cancel error:', err)
            setError(err.message || 'Failed to cancel. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content reschedule-modal cancel-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="reschedule-header cancel-header">
                    <h2>❌ Cancel Appointment</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleCancelAppt} className="reschedule-form">
                    <div className="cancel-summary">
                        <div className="cancel-summary-row">
                            <strong>{petName}</strong>
                            <span className="cancel-summary-dim">({clientName})</span>
                        </div>
                        <div className="cancel-summary-row">
                            {formatDate(appt.appointment_date)} at {formatTime(appt.start_time)}
                        </div>
                    </div>

                    {isRecurringAppt && (
                        <div className="reschedule-scope">
                            <div className="reschedule-scope-label">
                                🔄 This is a recurring appointment. What do you want to cancel?
                            </div>

                            <label
                                className={
                                    'reschedule-scope-option' +
                                    (scope === 'one' ? ' reschedule-scope-selected' : '')
                                }
                            >
                                <input
                                    type="radio"
                                    name="cancel-scope"
                                    value="one"
                                    checked={scope === 'one'}
                                    onChange={() => setScope('one')}
                                />
                                <div>
                                    <div className="reschedule-scope-title">Only this one</div>
                                    <div className="reschedule-scope-sub">
                                        Cancel just this single appointment. Future recurring bookings stay on the books.
                                    </div>
                                </div>
                            </label>

                            <label
                                className={
                                    'reschedule-scope-option' +
                                    (scope === 'following' ? ' reschedule-scope-selected' : '')
                                }
                            >
                                <input
                                    type="radio"
                                    name="cancel-scope"
                                    value="following"
                                    checked={scope === 'following'}
                                    onChange={() => setScope('following')}
                                />
                                <div>
                                    <div className="reschedule-scope-title">This and all following</div>
                                    <div className="reschedule-scope-sub">
                                        Cancel this appointment and every one after it in THIS series.
                                    </div>
                                </div>
                            </label>

                            <label
                                className={
                                    'reschedule-scope-option reschedule-scope-option-power' +
                                    (scope === 'all-client' ? ' reschedule-scope-selected' : '')
                                }
                            >
                                <input
                                    type="radio"
                                    name="cancel-scope"
                                    value="all-client"
                                    checked={scope === 'all-client'}
                                    onChange={() => setScope('all-client')}
                                />
                                <div>
                                    <div className="reschedule-scope-title">
                                        🌟 All future recurring for {clientName}
                                    </div>
                                    <div className="reschedule-scope-sub">
                                        Stop ALL recurring appointments for this client — FFT, groom, every series. Use this if they're firing you or pausing all visits.
                                    </div>
                                </div>
                            </label>
                        </div>
                    )}

                    <div className="reschedule-field">
                        <label>Reason (optional — saved with the record)</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Dog sick, client out of town, no call no show..."
                            className="reschedule-input"
                        />
                    </div>

                    {error && <div className="reschedule-error">{error}</div>}

                    <div className="cancel-preserve-note">
                        📁 History preserved — cancelled appointments stay in the record so you can spot chronic cancelers.
                    </div>

                    <div className="reschedule-actions">
                        <button
                            type="button"
                            className="reschedule-btn reschedule-btn-cancel"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Never Mind
                        </button>
                        <button
                            type="submit"
                            className="reschedule-btn cancel-btn-confirm"
                            disabled={saving}
                        >
                            {saving
                                ? (isRecurringAppt && scope !== 'one' ? 'Cancelling appointments...' : 'Cancelling...')
                                : (isRecurringAppt && scope === 'following' ? '❌ Cancel This & Following'
                                    : isRecurringAppt && scope === 'all-client' ? '🛑 Cancel All Future Recurring'
                                    : '❌ Cancel Appointment')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
