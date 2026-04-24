import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { checkBookingSafety } from '../lib/claude'
import { notifyUser } from '../lib/push'

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

// Task #77 — Detect major US holidays so we can warn about recurring appts landing on them.
// Returns the holiday name (e.g., "Thanksgiving") or null.
function isUSHoliday(d) {
    var m = d.getMonth() // 0=Jan
    var day = d.getDate()
    var dow = d.getDay() // 0=Sun ... 4=Thu
    // Fixed-date holidays
    if (m === 0 && day === 1) return "New Year's Day"
    if (m === 5 && day === 19) return "Juneteenth"
    if (m === 6 && day === 4) return "Independence Day"
    if (m === 10 && day === 11) return "Veterans Day"
    if (m === 11 && day === 24) return "Christmas Eve"
    if (m === 11 && day === 25) return "Christmas Day"
    if (m === 11 && day === 31) return "New Year's Eve"
    // MLK Day — 3rd Monday of January
    if (m === 0 && dow === 1 && day >= 15 && day <= 21) return 'MLK Day'
    // Presidents Day — 3rd Monday of February
    if (m === 1 && dow === 1 && day >= 15 && day <= 21) return "Presidents Day"
    // Memorial Day — last Monday of May
    if (m === 4 && dow === 1 && day >= 25 && day <= 31) return 'Memorial Day'
    // Labor Day — 1st Monday of September
    if (m === 8 && dow === 1 && day >= 1 && day <= 7) return 'Labor Day'
    // Columbus Day — 2nd Monday of October
    if (m === 9 && dow === 1 && day >= 8 && day <= 14) return 'Columbus Day'
    // Thanksgiving — 4th Thursday of November
    if (m === 10 && dow === 4 && day >= 22 && day <= 28) return 'Thanksgiving'
    // Black Friday — day after Thanksgiving (4th Fri, falls on 23-29)
    if (m === 10 && dow === 5 && day >= 23 && day <= 29) return 'Black Friday'
    // Mother's Day — 2nd Sunday of May
    if (m === 4 && dow === 0 && day >= 8 && day <= 14) return "Mother's Day"
    // Father's Day — 3rd Sunday of June
    if (m === 5 && dow === 0 && day >= 15 && day <= 21) return "Father's Day"
    return null
}

// Task #77 — Compute every date in a recurring series.
// Returns [{ date: Date, dateStr: 'YYYY-MM-DD', sequence: 1..N, label: 'Thu, Apr 23, 2026' }, ...]
// Safe to call with any values — returns [] if inputs are invalid.
function computeRecurringDates(startDateStr, intervalWeeks, totalCount) {
    var out = []
    if (!startDateStr) return out
    var iv = parseInt(intervalWeeks, 10)
    var n = parseInt(totalCount, 10)
    if (!iv || iv < 1) iv = 1
    if (!n || n < 1) return out
    if (n > 60) n = 60 // safety cap
    var base = new Date(startDateStr + 'T00:00:00')
    if (isNaN(base.getTime())) return out
    for (var i = 0; i < n; i++) {
        var d = new Date(base)
        d.setDate(base.getDate() + (i * iv * 7))
        out.push({
            date: d,
            dateStr: dateToString(d),
            sequence: i + 1,
            label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        })
    }
    return out
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
    const [showRecurringDates, setShowRecurringDates] = useState(false) // Task #77 — toggles "View all dates" list in popup
    const [view, setView] = useState('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    // Sidebar collapse toggle — persists across sessions so groomers don't
    // have to re-collapse every login. Especially useful on mobile.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(function () {
        try { return localStorage.getItem('petpro_calendar_sidebar_collapsed') === 'true' }
        catch (e) { return false }
    })
    // Drag-to-reschedule state (Item #6 from app to-do list).
    // draggedAppt — the appointment currently being dragged
    // dragConfirm — when user drops, store drop info and show confirm modal
    const [draggedAppt, setDraggedAppt] = useState(null)
    const [dragConfirm, setDragConfirm] = useState(null)

    // ===== Mass Text state (emergency / day-of cancellations) =====
    // Pulls every client with an appt on the chosen date, shows them,
    // lets Nicole uncheck any, type ONE message, send to all via Twilio.
    const [showMassText, setShowMassText] = useState(false)
    const [massTextDate, setMassTextDate] = useState(null)
    const [massTextMessage, setMassTextMessage] = useState('')
    const [massTextRecipients, setMassTextRecipients] = useState({}) // { clientId: bool }
    const [massTextSending, setMassTextSending] = useState(false)
    const [massTextResults, setMassTextResults] = useState(null) // { sent, failed, errors }
    function toggleSidebar() {
        setSidebarCollapsed(function (prev) {
            const next = !prev
            try { localStorage.setItem('petpro_calendar_sidebar_collapsed', String(next)) } catch (e) {}
            return next
        })
    }
    const [appointments, setAppointments] = useState([])
    const [clients, setClients] = useState([])
    const [pets, setPets] = useState([])
    const [services, setServices] = useState([])
    const [staffMembers, setStaffMembers] = useState([])
    const [blockedTimes, setBlockedTimes] = useState([]) // Task #38 — staff time blocks (lunch, errands, etc.)
    const [loading, setLoading] = useState(true)
    const [showAddForm, setShowAddForm] = useState(false)
    const [selectedDate, setSelectedDate] = useState(null)
    const [selectedTime, setSelectedTime] = useState(null)
    const [selectedAppt, setSelectedAppt] = useState(null) // appointment detail popup
    const [apptDetailLoading, setApptDetailLoading] = useState(false)
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false) // click-to-change status pill
    const [showAddPetToApptModal, setShowAddPetToApptModal] = useState(false) // multi-pet: + Add Pet to existing appt
    // Multi-pet: in-popup "change service" editor — tracks which appointment_pet is being edited + the pending new service_id
    const [editingServiceApptPetId, setEditingServiceApptPetId] = useState(null)
    const [pendingServiceId, setPendingServiceId] = useState('')
    // In-popup "change groomer" editor — toggles dropdown + holds pending staff_id (tier 1/2 customizability)
    const [editingGroomer, setEditingGroomer] = useState(false)
    const [pendingStaffId, setPendingStaffId] = useState('')
    const [apptNotes, setApptNotes] = useState([]) // paper trail of notes for current appointment
    const [showAddNotePopup, setShowAddNotePopup] = useState(false)
    const [newNoteText, setNewNoteText] = useState('')
    const [savingNote, setSavingNote] = useState(false)
    const [checkingIn, setCheckingIn] = useState(false) // loading state for Check In button
    const [checkingOut, setCheckingOut] = useState(false) // loading state for Check Out button

    // ===== Task #38 — Block Off Time =====
    // slotChooser: when user clicks an empty slot, we pop up a small chooser (Book vs Block)
    //   shape: { date: Date, hour: number, staffId: string | null } | null
    const [slotChooser, setSlotChooser] = useState(null)
    // blockModal: controls the Block Time create/edit modal
    //   shape: { mode: 'create'|'edit', date, hour, staffId, block? } | null
    const [blockModal, setBlockModal] = useState(null)
    const [savingBlock, setSavingBlock] = useState(false)

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
    // Payment edit modal state — for fixing typos or adding a tip that came in later
    const [editingPayment, setEditingPayment] = useState(null) // full payment row being edited, or null
    const [editPayAmount, setEditPayAmount] = useState('')
    const [editPayTip, setEditPayTip] = useState('')
    const [editPayMethod, setEditPayMethod] = useState('')
    const [editPayNotes, setEditPayNotes] = useState('')
    const [savingEditPayment, setSavingEditPayment] = useState(false)
    // "Add Payment" modal — for recording a tip/payment that comes in after the original checkout
    const [showAddPayment, setShowAddPayment] = useState(false)
    const [addPayAmount, setAddPayAmount] = useState('')
    const [addPayTip, setAddPayTip] = useState('')
    const [addPayMethod, setAddPayMethod] = useState('cash')
    const [addPayNotes, setAddPayNotes] = useState('')
    const [savingAddPayment, setSavingAddPayment] = useState(false)

    // ===== Inline Send Message (from appointment popup) =====
    const [newMessageText, setNewMessageText] = useState('')
    const [sendingMessage, setSendingMessage] = useState(false)
    const [sendMessageStatus, setSendMessageStatus] = useState(null) // 'success' | 'error' | null

    useEffect(() => {
        fetchData()
    }, [currentDate, view])

    // Close the status dropdown whenever the appt detail popup closes or changes appts
    useEffect(() => {
        if (!selectedAppt) setStatusDropdownOpen(false)
        // Task #77 — also collapse the recurring dates list so each popup open starts clean
        setShowRecurringDates(false)
        // Reset inline message composer each time the popup opens a different appt
        setNewMessageText('')
        setSendMessageStatus(null)
    }, [selectedAppt?.id])

    // Handle "Book Again", "Reschedule", and "View" URL params from client profile
    useEffect(() => {
        if (loading) return
        const params = new URLSearchParams(location.search)
        const bookClient = params.get('bookClient')
        const bookPet = params.get('bookPet')
        const bookService = params.get('bookService')
        const rescheduleAppt = params.get('rescheduleAppt')
        const viewAppt = params.get('viewAppt')

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
        } else if (viewAppt) {
            // Jump calendar to the appointment's date + open the full detail popup
            // so the groomer can see the surrounding schedule context (easier to move things).
            const appt = appointments.find(a => a.id === viewAppt)
            if (appt) {
                setCurrentDate(new Date(appt.appointment_date + 'T00:00:00'))
                handleApptClick(appt, null)
            } else {
                // Not in current view range — fetch minimal record to get the date, then hydrate popup
                ;(async () => {
                    const { data } = await supabase
                        .from('appointments')
                        .select('id, appointment_date')
                        .eq('id', viewAppt)
                        .single()
                    if (data) {
                        setCurrentDate(new Date(data.appointment_date + 'T00:00:00'))
                        handleApptClick({ id: viewAppt }, null)
                    }
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

        const [apptResult, clientResult, petResult, serviceResult, staffResult, blockedResult] = await Promise.all([
            supabase
                .from('appointments')
                .select('*, clients(id, first_name, last_name, phone), pets(name, breed), staff_members(id, first_name, last_name, color_code), appointment_pets(id, pet_id, service_id, quoted_price, pets(id, name, breed))')
                .gte('appointment_date', startDate)
                .lte('appointment_date', endDate)
                .order('start_time'),
            supabase.from('clients').select('id, first_name, last_name').eq('groomer_id', user.id).order('last_name'),
            supabase.from('pets').select('id, name, breed, client_id').eq('groomer_id', user.id).order('name'),
            supabase.from('services').select('id, service_name, price, time_block_minutes').eq('groomer_id', user.id).eq('is_active', true),
            supabase.from('staff_members').select('id, first_name, last_name, color_code').eq('groomer_id', user.id).eq('status', 'active').order('first_name'),
            // Task #38 — fetch blocked time slots for the visible date range
            supabase
                .from('blocked_times')
                .select('*, staff_members(id, first_name, last_name, color_code)')
                .gte('block_date', startDate)
                .lte('block_date', endDate)
                .order('start_time'),
        ])

        if (apptResult.error) console.error('[fetchData] appointments fetch error:', apptResult.error)
        if (blockedResult.error) console.error('[fetchData] blocked_times fetch error:', blockedResult.error)

        setAppointments(apptResult.data || [])
        setClients(clientResult.data || [])
        setPets(petResult.data || [])
        setServices(serviceResult.data || [])
        setStaffMembers(staffResult.data || [])
        setBlockedTimes(blockedResult.data || [])
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
    // Completed = checked_out / completed appts (money already earned)
    // Expected  = everything ELSE on the calendar (scheduled, confirmed,
    //            unconfirmed, pending, checked_in) — money we should earn.
    // Excluded  = cancelled, no_show, rescheduled (won't bring money).
    // Also returns Total Pets (unique pet count) and Finished Appts (for MoeGo-style panel).
    const getRevenue = () => {
        let filtered = appointments
        if (view === 'day') {
            filtered = appointments.filter((a) => a.appointment_date === dateToString(currentDate))
        }
        const DONE_STATUSES = ['completed', 'checked_out']
        const DEAD_STATUSES = ['cancelled', 'no_show', 'rescheduled']
        const completed = filtered.filter((a) => DONE_STATUSES.indexOf(a.status) >= 0)
        const expected = filtered.filter((a) =>
            DONE_STATUSES.indexOf(a.status) < 0 && DEAD_STATUSES.indexOf(a.status) < 0
        )
        const active = filtered.filter((a) => DEAD_STATUSES.indexOf(a.status) < 0)
        const totalCompleted = completed.reduce((sum, a) => sum + (parseFloat(a.final_price) || parseFloat(a.quoted_price) || 0), 0)
        const totalExpected = expected.reduce((sum, a) => sum + (parseFloat(a.quoted_price) || 0), 0)
        // Total Pets: count pets across all non-dead appts (handles multi-pet bookings via appointment_pets)
        const petIdSet = new Set()
        active.forEach((a) => {
            if (a.appointment_pets && a.appointment_pets.length > 0) {
                a.appointment_pets.forEach((ap) => { if (ap.pet_id) petIdSet.add(ap.pet_id) })
            } else if (a.pet_id) {
                petIdSet.add(a.pet_id)
            }
        })
        return {
            completed: totalCompleted,
            expected: totalExpected,
            total: totalCompleted + totalExpected,
            count: active.length,
            finishedCount: completed.length,
            totalPets: petIdSet.size,
        }
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
        // Task #38 — empty-slot click now opens a chooser (Book vs Block) instead of jumping
        // straight to the booking form. Nicole wanted this so she can block lunch/errand time.
        setSlotChooser({ date: date, hour: hour, staffId: staffId || null })
    }

    // ===== Drag-to-reschedule handlers (Item #6) =====
    // When groomer drags an appointment block onto a different time slot,
    // we stash the drop info and pop a confirm modal before updating.
    // Staff-id switch in day view = reassigning to that groomer.
    const handleApptDragStart = (appt) => {
        // Don't allow dragging cancelled / completed / checked-out appointments
        if (!appt) return
        if (appt.status === 'cancelled' || appt.status === 'completed' || appt.checked_out_at) return
        setDraggedAppt(appt)
    }
    const handleApptDragEnd = () => {
        setDraggedAppt(null)
    }
    const handleSlotDrop = (date, hour, staffId) => {
        if (!draggedAppt) return
        const newDate = dateToString(date)
        const newTime = String(hour).padStart(2, '0') + ':00'
        const currentDate = draggedAppt.appointment_date
        const currentStart = draggedAppt.start_time ? draggedAppt.start_time.slice(0, 5) : ''
        const currentStaff = draggedAppt.staff_id || null
        const dropStaff = staffId !== undefined ? (staffId || null) : currentStaff
        // Same spot = no-op (cancel drag)
        if (newDate === currentDate && newTime === currentStart && dropStaff === currentStaff) {
            setDraggedAppt(null)
            return
        }
        setDragConfirm({
            appt: draggedAppt,
            newDate: newDate,
            newTime: newTime,
            newStaffId: dropStaff,
            staffIdPassed: staffId !== undefined, // track whether day-view drop (includes staff change)
        })
        setDraggedAppt(null)
    }
    // Confirm the drop → update DB with new date/time (and staff if day view)
    const handleConfirmDrop = async () => {
        if (!dragConfirm) return
        const { appt, newDate, newTime, newStaffId, staffIdPassed } = dragConfirm
        // Calculate duration from the existing start/end
        const [sh, smRaw] = appt.start_time.split(':').map(Number)
        const [eh, emRaw] = appt.end_time.split(':').map(Number)
        const sm = smRaw || 0
        const em = emRaw || 0
        const durationMin = Math.max(15, (eh * 60 + em) - (sh * 60 + sm))
        // Compute new end time
        const [nh, nm] = newTime.split(':').map(Number)
        const totalEndMin = nh * 60 + nm + durationMin
        const newEndHour = Math.floor(totalEndMin / 60)
        const newEndMin = totalEndMin % 60
        const newEndTime = String(newEndHour).padStart(2, '0') + ':' + String(newEndMin).padStart(2, '0')
        // Conflict check — any other active appt overlapping new slot for same groomer
        const conflict = appointments.find((a) => {
            if (a.id === appt.id) return false
            if (a.status === 'cancelled' || a.status === 'no_show' || a.status === 'rescheduled') return false
            if (a.appointment_date !== newDate) return false
            if ((a.staff_id || null) !== (newStaffId || null)) return false
            const aStart = a.start_time ? a.start_time.slice(0, 5) : ''
            const aEnd = a.end_time ? a.end_time.slice(0, 5) : ''
            if (!aStart || !aEnd) return false
            return newTime < aEnd && newEndTime > aStart
        })
        if (conflict) {
            const who = (conflict.clients?.first_name || '') + ' ' + (conflict.clients?.last_name || '')
            alert('Can\'t move — conflicts with ' + who.trim() + ' at ' + conflict.start_time.slice(0, 5) + '.')
            setDragConfirm(null)
            return
        }
        // Build update payload
        const updateFields = {
            appointment_date: newDate,
            start_time: newTime + ':00',
            end_time: newEndTime + ':00',
        }
        if (staffIdPassed) {
            updateFields.staff_id = newStaffId
        }
        const { error } = await supabase
            .from('appointments')
            .update(updateFields)
            .eq('id', appt.id)
        if (error) {
            alert('Error moving appointment: ' + error.message)
            setDragConfirm(null)
            return
        }
        setDragConfirm(null)
        fetchData()
    }

    // ===== Task #38 — chooser handlers =====
    const handleChooseBook = () => {
        if (!slotChooser) return
        const { date, hour, staffId } = slotChooser
        setSelectedDate(dateToString(date))
        setSelectedTime(`${String(hour).padStart(2, '0')}:00`)
        if (staffId) {
            setPreFillBooking(prev => ({ ...(prev || {}), staff_id: staffId }))
        }
        setSlotChooser(null)
        setShowAddForm(true)
    }

    const handleChooseBlock = () => {
        if (!slotChooser) return
        const { date, hour, staffId } = slotChooser
        setBlockModal({
            mode: 'create',
            date: dateToString(date),
            hour: hour,
            staffId: staffId || null,
            block: null,
        })
        setSlotChooser(null)
    }

    // Click an existing gray BLOCKED tile → edit it
    const handleBlockClick = (blk) => {
        setBlockModal({
            mode: 'edit',
            date: blk.block_date,
            hour: parseInt(blk.start_time.split(':')[0]),
            staffId: blk.staff_id || null,
            block: blk,
        })
    }

    // ===== Task #38 — save / delete =====
    const handleSaveBlock = async (payload) => {
        try {
            setSavingBlock(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not logged in')

            if (blockModal && blockModal.mode === 'edit' && blockModal.block) {
                // UPDATE existing block
                const { error } = await supabase
                    .from('blocked_times')
                    .update({
                        staff_id: payload.staff_id || null,
                        block_date: payload.block_date,
                        start_time: payload.start_time,
                        end_time: payload.end_time,
                        note: payload.note || null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', blockModal.block.id)
                if (error) throw error
            } else {
                // INSERT new block
                const { error } = await supabase
                    .from('blocked_times')
                    .insert({
                        groomer_id: user.id,
                        staff_id: payload.staff_id || null,
                        block_date: payload.block_date,
                        start_time: payload.start_time,
                        end_time: payload.end_time,
                        note: payload.note || null,
                    })
                if (error) throw error
            }
            setBlockModal(null)
            await fetchData()
        } catch (err) {
            console.error('[handleSaveBlock] error:', err)
            alert('Could not save block: ' + (err.message || err))
        } finally {
            setSavingBlock(false)
        }
    }

    const handleDeleteBlock = async () => {
        if (!blockModal || !blockModal.block) return
        if (!window.confirm('Remove this blocked time?')) return
        try {
            setSavingBlock(true)
            const { error } = await supabase
                .from('blocked_times')
                .delete()
                .eq('id', blockModal.block.id)
            if (error) throw error
            setBlockModal(null)
            await fetchData()
        } catch (err) {
            console.error('[handleDeleteBlock] error:', err)
            alert('Could not delete block: ' + (err.message || err))
        } finally {
            setSavingBlock(false)
        }
    }

    // Task #77 — Jump to a specific sibling in a recurring series.
    // Closes the current popup, moves the calendar to that week, then re-opens on the target appt.
    const jumpToSibling = async (siblingId, siblingDateStr) => {
        if (!siblingId) return
        // If they clicked the one they're already on, no-op
        if (selectedAppt && selectedAppt.id === siblingId) return
        // Navigate the calendar to that date in week view so they can see context
        try {
            var d = new Date(siblingDateStr + 'T00:00:00')
            if (!isNaN(d.getTime())) {
                setCurrentDate(d)
                setView('week')
            }
        } catch (e) { /* ignore */ }
        // Close current popup, then open the target appt via the existing full-load flow
        setSelectedAppt(null)
        setTimeout(function () {
            handleApptClick({ id: siblingId }, null)
        }, 50)
    }

    const handleApptClick = async (appt, e) => {
        console.log('[handleApptClick] CLICKED appt id:', appt.id, 'date:', appt.appointment_date, 'has appointment_pets?', !!appt.appointment_pets, 'count:', appt.appointment_pets?.length || 0)
        if (e && e.stopPropagation) e.stopPropagation()
        setApptDetailLoading(true)
        try {
            // Load full appointment details with pet health info, service, and assigned groomer
            // Multi-pet: appointment_pets brings ALL pets attached to this booking with their own service + price
            const { data: fullAppt, error: fetchError } = await supabase
                .from('appointments')
                .select(`
                    *,
                    clients:client_id ( id, first_name, last_name, phone, email, address, preferred_contact, notes ),
                    pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered, is_senior, grooming_notes ),
                    services:service_id ( id, service_name, price, time_block_minutes ),
                    staff_members:staff_id ( id, first_name, last_name, color_code ),
                    recurring_series:recurring_series_id ( id, interval_weeks, total_count, start_date, status ),
                    appointment_pets (
                        id,
                        pet_id,
                        service_id,
                        quoted_price,
                        service_notes,
                        groomer_notes,
                        pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered, is_senior, grooming_notes ),
                        services:service_id ( id, service_name, price, time_block_minutes )
                    )
                `)
                .eq('id', appt.id)
                .single()

            if (fetchError) {
                console.error('[handleApptClick] Supabase fetch error:', fetchError)
                // Fall back to whatever basic data we already have on appt
                setSelectedAppt(appt)
                setApptDetailLoading(false)
                return
            }
            if (!fullAppt) {
                console.error('[handleApptClick] No appointment data returned for id', appt.id)
                setSelectedAppt(appt)
                setApptDetailLoading(false)
                return
            }
            console.log('[handleApptClick] loaded appt with', fullAppt.appointment_pets?.length || 0, 'pets')

            // Task #19 — If this is a recurring appointment, count how many future instances remain
            // Task #77 — ALSO fetch all siblings (full list, ordered by sequence) for the clickable dates list
            if (fullAppt?.recurring_series_id) {
                const todayStr = new Date().toISOString().slice(0, 10)
                const { data: allSiblings } = await supabase
                    .from('appointments')
                    .select('id, appointment_date, start_time, status, checked_in_at, checked_out_at, recurring_sequence, recurring_conflict')
                    .eq('recurring_series_id', fullAppt.recurring_series_id)
                    .order('recurring_sequence', { ascending: true })

                const siblings = allSiblings || []
                fullAppt.recurring_siblings = siblings

                // Count future instances still on the books (not cancelled, not checked out, not already rescheduled)
                const upcomingCount = siblings.filter(a =>
                    a.appointment_date >= todayStr &&
                    !a.checked_out_at &&
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

    // Multi-pet: Remove a pet from an existing appointment (sick dog scenario)
    // Auto-shrinks appointment end_time by the removed pet's service time block
    const handleRemovePetFromAppointment = async (apptPetId, petName) => {
        if (!selectedAppt) return
        if (!window.confirm('Remove ' + petName + ' from this appointment? The end time will auto-shrink.')) return

        try {
            // 1. Delete the appointment_pets row
            const { error: delErr } = await supabase
                .from('appointment_pets')
                .delete()
                .eq('id', apptPetId)
            if (delErr) throw delErr

            // 2. Compute remaining pets and new end_time
            var remainingPets = (selectedAppt.appointment_pets || []).filter(function (ap) {
                return ap.id !== apptPetId
            })

            if (remainingPets.length === 0) {
                alert('That was the last pet on this appointment. Consider cancelling the appointment.')
                fetchData()
                setSelectedAppt(null)
                return
            }

            // Sum time blocks of remaining pets
            var totalMinutes = 0
            remainingPets.forEach(function (ap) {
                totalMinutes += (ap.services?.time_block_minutes || 0)
            })

            // Compute new end_time = start_time + totalMinutes
            var startParts = selectedAppt.start_time.split(':').map(Number)
            var totalStartMin = startParts[0] * 60 + startParts[1] + totalMinutes
            var endH = Math.floor(totalStartMin / 60)
            var endM = totalStartMin % 60
            var newEndTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0')

            // 3. Update appointment: end_time + backward-compat fields (first remaining pet, new total)
            var firstPet = remainingPets[0]
            var newTotal = remainingPets.reduce(function (sum, ap) {
                return sum + parseFloat(ap.quoted_price || 0)
            }, 0)

            await supabase
                .from('appointments')
                .update({
                    end_time: newEndTime,
                    pet_id: firstPet.pet_id,
                    service_id: firstPet.service_id,
                    quoted_price: newTotal,
                })
                .eq('id', selectedAppt.id)

            // 4. Refresh popup + calendar
            await handleApptClick(selectedAppt, { stopPropagation: function () {} })
            fetchData()
        } catch (err) {
            alert('Error removing pet: ' + err.message)
        }
    }

    // Multi-pet: Change the service for a single pet on an existing appointment.
    // Auto-shrinks/extends the appointment end_time based on the new service's time block.
    // Warns (with override) if the new end time overlaps another appointment on the same day/staff.
    // Price is NOT auto-updated — groomer edits manually per product decision.
    const handleChangePetService = async (apptPetId) => {
        if (!selectedAppt || !pendingServiceId) return

        // Find the new service from the services list
        var newService = (services || []).find(function (s) { return s.id === pendingServiceId })
        if (!newService) {
            alert('Service not found. Try reopening the popup.')
            return
        }

        // Find the appointment_pet being edited
        var oldApptPet = (selectedAppt.appointment_pets || []).find(function (ap) { return ap.id === apptPetId })
        if (!oldApptPet) return

        // If nothing changed, just close the editor
        if (oldApptPet.service_id === pendingServiceId) {
            setEditingServiceApptPetId(null)
            setPendingServiceId('')
            return
        }

        try {
            // 1. Compute the new total time block for the whole appointment
            //    (sum of every pet's service time, with this pet's service swapped)
            var newTotalMinutes = 0
            ;(selectedAppt.appointment_pets || []).forEach(function (ap) {
                if (ap.id === apptPetId) {
                    newTotalMinutes += (newService.time_block_minutes || 0)
                } else {
                    newTotalMinutes += (ap.services?.time_block_minutes || 0)
                }
            })

            // 2. Compute new end_time = start_time + newTotalMinutes
            var startParts = selectedAppt.start_time.split(':').map(Number)
            var startTotalMin = startParts[0] * 60 + startParts[1]
            var endTotalMin = startTotalMin + newTotalMinutes
            var endH = Math.floor(endTotalMin / 60)
            var endM = endTotalMin % 60
            var newEndTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0')

            // 3. Conflict check — look at other appointments same day + same staff, see if [startTotalMin, endTotalMin) overlaps
            var conflicts = (appointments || []).filter(function (a) {
                if (a.id === selectedAppt.id) return false
                if (a.appointment_date !== selectedAppt.appointment_date) return false
                // If appointment has a staff assignment, only check same staff; otherwise check all
                if (selectedAppt.staff_id && a.staff_id !== selectedAppt.staff_id) return false
                if (['cancelled', 'no_show', 'rescheduled'].indexOf(a.status) >= 0) return false
                var aStart = (a.start_time || '').split(':').map(Number)
                var aEnd = (a.end_time || '').split(':').map(Number)
                if (aStart.length < 2 || aEnd.length < 2) return false
                var aStartMin = aStart[0] * 60 + aStart[1]
                var aEndMin = aEnd[0] * 60 + aEnd[1]
                // Overlap: newStart < aEnd AND newEnd > aStart
                return startTotalMin < aEndMin && endTotalMin > aStartMin
            })

            if (conflicts.length > 0) {
                var conflictLines = conflicts.slice(0, 3).map(function (c) {
                    var nm = c.clients ? ((c.clients.first_name || '') + ' ' + (c.clients.last_name || '')).trim() : 'Appointment'
                    return '• ' + (nm || 'Appointment') + ' (' + (c.start_time || '?') + '–' + (c.end_time || '?') + ')'
                }).join('\n')
                var extra = conflicts.length > 3 ? '\n• +' + (conflicts.length - 3) + ' more…' : ''
                var msg = 'Heads up — changing to "' + newService.service_name + '" (' + (newService.time_block_minutes || 0) + ' mins) will make this appointment end at ' + newEndTime + ', which overlaps with:\n\n' + conflictLines + extra + '\n\nSave anyway?'
                if (!window.confirm(msg)) return
            }

            // 4. Update appointment_pets row (service swap)
            var { error: apErr } = await supabase
                .from('appointment_pets')
                .update({ service_id: newService.id })
                .eq('id', apptPetId)
            if (apErr) throw apErr

            // 5. Update appointment end_time. If this pet is the "primary" (matches appointments.pet_id),
            //    also sync the backward-compat service_id field.
            var apptUpdate = { end_time: newEndTime }
            if (selectedAppt.pet_id === oldApptPet.pet_id) {
                apptUpdate.service_id = newService.id
            }
            var { error: aErr } = await supabase
                .from('appointments')
                .update(apptUpdate)
                .eq('id', selectedAppt.id)
            if (aErr) throw aErr

            // 6. Close editor + refresh popup + calendar
            setEditingServiceApptPetId(null)
            setPendingServiceId('')
            await handleApptClick(selectedAppt, { stopPropagation: function () {} })
            fetchData()
        } catch (err) {
            alert('Error changing service: ' + (err.message || err))
        }
    }

    // Change the assigned groomer on an existing appointment, with conflict check + override.
    // Called from the ✏️ Change button in the Groomer section of the appointment popup.
    // "" (empty string) means "Unassigned".
    const handleChangeGroomer = async () => {
        if (!selectedAppt) return

        var newStaffId = pendingStaffId === '' ? null : pendingStaffId
        var currentStaffId = selectedAppt.staff_id || null

        // If nothing changed, just close the editor
        if (newStaffId === currentStaffId) {
            setEditingGroomer(false)
            setPendingStaffId('')
            return
        }

        try {
            // 1. If assigning to a groomer (not unassigning), check their schedule for the same day.
            //    Overlap: selectedAppt.start_time < other.end_time AND selectedAppt.end_time > other.start_time.
            if (newStaffId) {
                var startParts = (selectedAppt.start_time || '').split(':').map(Number)
                var endParts = (selectedAppt.end_time || '').split(':').map(Number)
                var apptStartMin = startParts[0] * 60 + (startParts[1] || 0)
                var apptEndMin = endParts[0] * 60 + (endParts[1] || 0)

                var conflicts = (appointments || []).filter(function (a) {
                    if (a.id === selectedAppt.id) return false
                    if (a.appointment_date !== selectedAppt.appointment_date) return false
                    if (a.staff_id !== newStaffId) return false
                    if (['cancelled', 'no_show', 'rescheduled'].indexOf(a.status) >= 0) return false
                    var aStart = (a.start_time || '').split(':').map(Number)
                    var aEnd = (a.end_time || '').split(':').map(Number)
                    if (aStart.length < 2 || aEnd.length < 2) return false
                    var aStartMin = aStart[0] * 60 + (aStart[1] || 0)
                    var aEndMin = aEnd[0] * 60 + (aEnd[1] || 0)
                    return apptStartMin < aEndMin && apptEndMin > aStartMin
                })

                if (conflicts.length > 0) {
                    var newStaff = (staffMembers || []).find(function (s) { return s.id === newStaffId })
                    var newStaffName = newStaff ? (newStaff.first_name || 'That groomer') : 'That groomer'
                    var conflictLines = conflicts.slice(0, 3).map(function (c) {
                        var nm = c.clients ? ((c.clients.first_name || '') + ' ' + (c.clients.last_name || '')).trim() : 'Appointment'
                        return '• ' + (nm || 'Appointment') + ' (' + (c.start_time || '?') + '–' + (c.end_time || '?') + ')'
                    }).join('\n')
                    var extra = conflicts.length > 3 ? '\n• +' + (conflicts.length - 3) + ' more…' : ''
                    var msg = 'Heads up — ' + newStaffName + ' is already booked during this time:\n\n' + conflictLines + extra + '\n\nAssign anyway?'
                    if (!window.confirm(msg)) return
                }
            }

            // 2. Update the appointment's staff_id
            var { error: updErr } = await supabase
                .from('appointments')
                .update({ staff_id: newStaffId })
                .eq('id', selectedAppt.id)
            if (updErr) throw updErr

            // 3. Close editor + refresh popup + calendar
            setEditingGroomer(false)
            setPendingStaffId('')
            await handleApptClick(selectedAppt, { stopPropagation: function () {} })
            fetchData()
        } catch (err) {
            alert('Error changing groomer: ' + (err.message || err))
        }
    }

    // Multi-pet: Add a pet to an existing appointment (2nd dog added 2 days later scenario)
    // Auto-extends appointment end_time by the new pet's service time block
    const handleAddPetToExistingAppointment = async (petData) => {
        if (!selectedAppt) return
        try {
            // 1. Insert the new appointment_pets row
            const { data: { user } } = await supabase.auth.getUser()
            const { error: insertErr } = await supabase
                .from('appointment_pets')
                .insert({
                    appointment_id: selectedAppt.id,
                    pet_id: petData.pet_id,
                    service_id: petData.service_id || null,
                    quoted_price: parseFloat(petData.quoted_price || 0),
                    groomer_id: user.id,
                })
            if (insertErr) throw insertErr

            // 2. Compute new end_time = start_time + sum of all pets' time_block_minutes
            var allPetsTimeMinutes = 0
            ;(selectedAppt.appointment_pets || []).forEach(function (ap) {
                allPetsTimeMinutes += (ap.services?.time_block_minutes || 0)
            })
            allPetsTimeMinutes += (petData.time_block_minutes || 0)

            var startParts = selectedAppt.start_time.split(':').map(Number)
            var totalStartMin = startParts[0] * 60 + startParts[1] + allPetsTimeMinutes
            var endH = Math.floor(totalStartMin / 60)
            var endM = totalStartMin % 60
            var newEndTime = String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0')

            // 3. Compute new total price (sum of all pets including new one)
            var newTotal = (selectedAppt.appointment_pets || []).reduce(function (sum, ap) {
                return sum + parseFloat(ap.quoted_price || 0)
            }, 0) + parseFloat(petData.quoted_price || 0)

            // 4. Update appointment end_time + backward-compat fields
            const { error: updateErr } = await supabase
                .from('appointments')
                .update({
                    end_time: newEndTime,
                    quoted_price: newTotal,
                })
                .eq('id', selectedAppt.id)
            if (updateErr) throw updateErr

            // 5. Close modal + refresh popup + refresh calendar
            setShowAddPetToApptModal(false)
            await handleApptClick(selectedAppt, { stopPropagation: function () {} })
            fetchData()
        } catch (err) {
            alert('Error adding pet: ' + err.message)
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

    // ---- Inline Send Message from the appointment popup ----
    // Finds (or creates) a thread for (groomer, client), inserts the message,
    // bumps thread.last_message_at, and fires a push to the client portal.
    const handleSendMessageFromPopup = async () => {
        if (!newMessageText.trim() || !selectedAppt || sendingMessage) return
        setSendingMessage(true)
        setSendMessageStatus(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not signed in')

            const clientId = selectedAppt.client_id
            if (!clientId) throw new Error('This appointment has no client on file')

            // Find an existing thread for this (groomer, client) pair, or create one.
            let { data: existingThread, error: threadFindErr } = await supabase
                .from('threads')
                .select('id')
                .eq('groomer_id', user.id)
                .eq('client_id', clientId)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle()
            if (threadFindErr) throw threadFindErr

            let threadId = existingThread?.id
            if (!threadId) {
                const { data: newThread, error: newThreadErr } = await supabase
                    .from('threads')
                    .insert({ groomer_id: user.id, client_id: clientId, subject: null })
                    .select('id')
                    .single()
                if (newThreadErr) throw newThreadErr
                threadId = newThread.id
            }

            // Insert the message
            const text = newMessageText.trim()
            const { data: inserted, error: msgErr } = await supabase
                .from('messages')
                .insert({
                    thread_id: threadId,
                    groomer_id: user.id,
                    client_id: clientId,
                    sender_type: 'groomer',
                    text: text,
                    read_by_groomer: true,
                    read_by_client: false,
                })
                .select()
                .single()
            if (msgErr) throw msgErr

            // Bump thread timestamp
            await supabase
                .from('threads')
                .update({ last_message_at: inserted.created_at })
                .eq('id', threadId)

            // Fire-and-forget push notification to the client (non-blocking)
            ;(async function notifyClient() {
                try {
                    const { data: clientRow } = await supabase
                        .from('clients')
                        .select('user_id')
                        .eq('id', clientId)
                        .maybeSingle()
                    if (!clientRow?.user_id) return
                    const { data: shopRow } = await supabase
                        .from('shop_settings')
                        .select('shop_name')
                        .eq('groomer_id', user.id)
                        .maybeSingle()
                    const shopName = (shopRow && shopRow.shop_name) || 'Your groomer'
                    notifyUser({
                        userId: clientRow.user_id,
                        title: shopName,
                        body: text.slice(0, 100),
                        url: '/portal/messages/' + threadId,
                        tag: 'thread-' + threadId,
                    })
                } catch (e) {
                    console.warn('[push] notify client failed (non-fatal):', e)
                }
            })()

            setNewMessageText('')
            setSendMessageStatus('success')
            // Auto-clear the success message after 3s
            setTimeout(function () { setSendMessageStatus(null) }, 3000)
        } catch (err) {
            console.error('Send message from popup failed:', err)
            setSendMessageStatus('error')
        } finally {
            setSendingMessage(false)
        }
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

    // Manually change appointment status from the detail popup
    const handleStatusChange = async (newStatus) => {
        if (!selectedAppt) return
        if (selectedAppt.status === newStatus) {
            setStatusDropdownOpen(false)
            return
        }
        const { error } = await supabase
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', selectedAppt.id)
        if (error) {
            alert('Error updating status: ' + error.message)
            return
        }
        setSelectedAppt({ ...selectedAppt, status: newStatus })
        setStatusDropdownOpen(false)
        await fetchData()
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
        // MULTI-PET: if this booking has appointment_pets rows, sum their quoted_price.
        // LEGACY single-pet: fall back to the parent appointment's price.
        var servicePrice
        if (appt.appointment_pets && appt.appointment_pets.length > 0) {
            servicePrice = appt.appointment_pets.reduce(function (sum, ap) {
                return sum + parseFloat(ap.quoted_price || 0)
            }, 0)
        } else {
            servicePrice = parseFloat(appt.final_price || appt.quoted_price || 0)
        }
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
            alert('Please pick a payment method (Cash, Zelle, Venmo, or Credit Card)')
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

    // Open the edit modal for a specific payment row — prefills fields
    const openEditPayment = (p) => {
        setEditingPayment(p)
        setEditPayAmount(p.amount != null ? String(p.amount) : '')
        setEditPayTip(p.tip_amount != null ? String(p.tip_amount) : '')
        setEditPayMethod(p.method || 'cash')
        setEditPayNotes(p.notes || '')
    }

    // Save changes to an existing payment row (fix typo, add tip later, change method, etc.)
    const handleUpdatePayment = async () => {
        if (!editingPayment) return
        var amt = parseFloat(editPayAmount || 0)
        if (isNaN(amt) || amt < 0) { alert('Enter a valid amount.'); return }
        var tip = parseFloat(editPayTip || 0)
        if (isNaN(tip) || tip < 0) tip = 0
        if (!editPayMethod) { alert('Pick a payment method.'); return }

        setSavingEditPayment(true)
        try {
            var { error } = await supabase
                .from('payments')
                .update({
                    amount: amt,
                    tip_amount: tip,
                    method: editPayMethod,
                    notes: editPayNotes || null,
                })
                .eq('id', editingPayment.id)
            if (error) throw error

            // Refresh the payment history list in the popup
            if (selectedAppt) {
                var { data: refreshed } = await supabase
                    .from('payments')
                    .select('*')
                    .eq('appointment_id', selectedAppt.id)
                    .order('created_at', { ascending: true })
                setApptPayments(refreshed || [])
            }
            setEditingPayment(null)
            fetchData()
        } catch (err) {
            alert('Error updating payment: ' + (err.message || err))
        }
        setSavingEditPayment(false)
    }

    // Open the Add Payment modal — e.g. client paid cash at checkout, then tipped later via Zelle
    const openAddPayment = () => {
        setAddPayAmount('')
        setAddPayTip('')
        setAddPayMethod('cash')
        setAddPayNotes('')
        setShowAddPayment(true)
    }

    // Insert an additional payment row (does NOT touch checked_out_at — that already happened at checkout)
    const handleAddAdditionalPayment = async () => {
        if (!selectedAppt) return
        var amt = parseFloat(addPayAmount || 0)
        var tip = parseFloat(addPayTip || 0)
        if (isNaN(amt) || amt < 0) amt = 0
        if (isNaN(tip) || tip < 0) tip = 0
        if (amt === 0 && tip === 0) { alert('Enter an amount or a tip.'); return }
        if (!addPayMethod) { alert('Pick a payment method.'); return }

        setSavingAddPayment(true)
        try {
            var { data: { user } } = await supabase.auth.getUser()
            var { error } = await supabase.from('payments').insert({
                appointment_id: selectedAppt.id,
                client_id: selectedAppt.client_id,
                groomer_id: user.id,
                amount: amt,
                tip_amount: tip,
                method: addPayMethod,
                notes: addPayNotes || null,
            })
            if (error) throw error

            // Refresh the payment history list in the popup
            var { data: refreshed } = await supabase
                .from('payments')
                .select('*')
                .eq('appointment_id', selectedAppt.id)
                .order('created_at', { ascending: true })
            setApptPayments(refreshed || [])

            setShowAddPayment(false)
            fetchData()
        } catch (err) {
            alert('Error adding payment: ' + (err.message || err))
        }
        setSavingAddPayment(false)
    }

    // Delete a payment row (typo correction, refund, or duplicate entry)
    const handleDeletePayment = async (p) => {
        if (!p) return
        var amtStr = parseFloat(p.amount || 0).toFixed(2)
        if (!window.confirm('Delete this $' + amtStr + ' ' + (p.method || '').toUpperCase() + ' payment? This cannot be undone.')) return

        try {
            var { error } = await supabase
                .from('payments')
                .delete()
                .eq('id', p.id)
            if (error) throw error

            if (selectedAppt) {
                var { data: refreshed } = await supabase
                    .from('payments')
                    .select('*')
                    .eq('appointment_id', selectedAppt.id)
                    .order('created_at', { ascending: true })
                setApptPayments(refreshed || [])
            }
            fetchData()
        } catch (err) {
            alert('Error deleting payment: ' + (err.message || err))
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

    // Fire the new waitlist-notify edge function when a slot opens up.
    // The edge function handles: toggle check, day-of-week filter,
    // Haiku picker, templated message, push notification, response window.
    const checkWaitlistForOpening = async (cancelledApptId) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: cancelledAppt } = await supabase
                .from('appointments')
                .select('appointment_date, start_time, end_time, service_id, staff_id')
                .eq('id', cancelledApptId)
                .single()

            if (!cancelledAppt) return

            // Build ISO timestamps for the open slot
            const slotStart = cancelledAppt.appointment_date + 'T' + cancelledAppt.start_time
            const slotEnd = cancelledAppt.appointment_date + 'T' + cancelledAppt.end_time

            // Fire-and-forget — don't block the cancel flow if it fails
            supabase.functions.invoke('waitlist-notify', {
                body: {
                    groomer_id: user.id,
                    cancelled_appointment_id: cancelledApptId,
                    start_time: slotStart,
                    end_time: slotEnd,
                    service_id: cancelledAppt.service_id,
                    staff_id: cancelledAppt.staff_id || null
                }
            }).catch(err => console.error('waitlist-notify error:', err))
        } catch (err) {
            console.error('Waitlist auto-notify error:', err)
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
                    <button
                        onClick={() => { setShowMassText(true); setMassTextDate(dateToString(currentDate)) }}
                        title="Mass text every client with an appointment on a given day (for emergencies / day-of cancellations)"
                        style={{
                            padding: '8px 14px', background: '#fff',
                            color: '#dc2626', border: '1px solid #fecaca',
                            borderRadius: '8px', fontWeight: '600', fontSize: '13px',
                            cursor: 'pointer', marginRight: '10px',
                        }}
                    >
                        📣 Mass Text
                    </button>
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
                            blockedTimes={blockedTimes}
                            staff={staffMembers}
                            onSlotClick={handleTimeSlotClick}
                            onApptClick={handleApptClick}
                            onBlockClick={handleBlockClick}
                            onCheckIn={handleCheckIn}
                            onCheckOut={handleCheckOut}
                            checkingIn={checkingIn}
                            checkingOut={checkingOut}
                            onApptDragStart={handleApptDragStart}
                            onApptDragEnd={handleApptDragEnd}
                            onSlotDrop={handleSlotDrop}
                            draggedApptId={draggedAppt ? draggedAppt.id : null}
                        />
                    )}
                </div>

                {/* Revenue Sidebar — collapsible for more calendar room (mobile especially) */}
                <div className={'revenue-panel' + (sidebarCollapsed ? ' revenue-panel-collapsed' : '')}>
                    {/* Collapse / expand toggle */}
                    <button
                        type="button"
                        className="sidebar-toggle-btn"
                        onClick={toggleSidebar}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? '›' : '‹'}
                    </button>

                    {!sidebarCollapsed && (
                        <>
                            {/* Mini Calendar */}
                            <MiniCalendar
                                currentDate={currentDate}
                                appointments={appointments}
                                onDayClick={(date) => { setCurrentDate(date); setView('day') }}
                            />

                            {/* Quick Jump — 1 to 14 weeks out from today (matches MoeGo) */}
                            <QuickJump
                                onJump={(date) => { setCurrentDate(date); setView('day') }}
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
                        <div className="revenue-row">
                            <span>Finished appts</span>
                            <span>{revenue.finishedCount}</span>
                        </div>
                        <div className="revenue-row">
                            <span>Total pets</span>
                            <span>{revenue.totalPets}</span>
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
                        </>
                    )}
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

            {/* Task #38 — Chooser popup (Book vs Block) when clicking an empty slot */}
            {slotChooser && (
                <SlotChooserModal
                    slot={slotChooser}
                    staff={staffMembers}
                    onBook={handleChooseBook}
                    onBlock={handleChooseBlock}
                    onClose={() => setSlotChooser(null)}
                />
            )}

            {/* Task #38 — Block Time create / edit modal */}
            {blockModal && (
                <BlockTimeModal
                    modal={blockModal}
                    staff={staffMembers}
                    saving={savingBlock}
                    onSave={handleSaveBlock}
                    onDelete={handleDeleteBlock}
                    onClose={() => setBlockModal(null)}
                />
            )}

            {/* Mass Text Modal */}
            {showMassText && (() => {
                // Find all active appointments on the selected date
                const dayAppts = appointments.filter(function (a) {
                    if (a.appointment_date !== massTextDate) return false
                    if (a.status === 'cancelled' || a.status === 'no_show' || a.status === 'rescheduled') return false
                    return true
                })
                // Dedupe clients + pull phone/name
                const clientMap = {}
                dayAppts.forEach(function (a) {
                    const c = a.clients
                    if (!c || !c.id) return
                    if (!clientMap[c.id]) {
                        clientMap[c.id] = {
                            id: c.id,
                            name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
                            phone: c.phone,
                            times: [],
                        }
                    }
                    if (a.start_time) clientMap[c.id].times.push(a.start_time.slice(0, 5))
                })
                const clientList = Object.values(clientMap)
                const selectedCount = clientList.filter(function (c) {
                    // Default all to checked if massTextRecipients[id] is undefined
                    return massTextRecipients[c.id] !== false && c.phone
                }).length
                const noPhoneCount = clientList.filter(function (c) { return !c.phone }).length

                async function handleSendMassText() {
                    if (!massTextMessage.trim()) { alert('Type a message first'); return }
                    const recipients = clientList.filter(function (c) {
                        return massTextRecipients[c.id] !== false && c.phone
                    })
                    if (recipients.length === 0) { alert('No recipients selected'); return }
                    if (!window.confirm('Send this message to ' + recipients.length + ' client' + (recipients.length === 1 ? '' : 's') + '?\n\n"' + massTextMessage + '"')) return
                    setMassTextSending(true)
                    const results = { sent: 0, failed: 0, errors: [] }
                    for (const r of recipients) {
                        try {
                            const res = await supabase.functions.invoke('send-sms', {
                                body: { to: r.phone, message: massTextMessage },
                            })
                            if (res.error) { results.failed++; results.errors.push(r.name + ': ' + res.error.message) }
                            else if (res.data && res.data.success === false) { results.failed++; results.errors.push(r.name + ': ' + res.data.error) }
                            else { results.sent++ }
                        } catch (err) {
                            results.failed++
                            results.errors.push(r.name + ': ' + err.message)
                        }
                    }
                    setMassTextResults(results)
                    setMassTextSending(false)
                }

                function closeMassText() {
                    setShowMassText(false)
                    setMassTextMessage('')
                    setMassTextRecipients({})
                    setMassTextResults(null)
                }

                return (
                    <div
                        onClick={closeMassText}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
                        }}
                    >
                        <div
                            onClick={function (e) { e.stopPropagation() }}
                            style={{
                                background: '#fff', color: '#111827',
                                borderRadius: '16px', padding: '24px',
                                maxWidth: '560px', width: '100%', maxHeight: '85vh',
                                overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            }}
                        >
                            <h2 style={{ margin: '0 0 6px', fontSize: '20px' }}>📣 Mass Text</h2>
                            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
                                Send one message to every client with an appointment on a specific day. For emergencies / day-of cancellations.
                            </p>

                            {massTextResults ? (
                                <div>
                                    <div style={{ padding: '16px', background: massTextResults.failed === 0 ? '#f0fdf4' : '#fffbeb', border: '1px solid ' + (massTextResults.failed === 0 ? '#bbf7d0' : '#fde68a'), borderRadius: '10px', marginBottom: '14px' }}>
                                        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>
                                            {massTextResults.failed === 0 ? '✅ All messages sent' : '⚠️ Partial success'}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#374151' }}>
                                            Sent: <strong>{massTextResults.sent}</strong>
                                            {massTextResults.failed > 0 && <> · Failed: <strong>{massTextResults.failed}</strong></>}
                                        </div>
                                        {massTextResults.errors.length > 0 && (
                                            <div style={{ marginTop: '10px', fontSize: '12px', color: '#92400e' }}>
                                                <strong>Failures:</strong>
                                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                                    {massTextResults.errors.slice(0, 5).map(function (e, i) { return <li key={i}>{e}</li> })}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button onClick={closeMassText} style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Done</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Date picker */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Date</label>
                                        <input
                                            type="date"
                                            value={massTextDate || ''}
                                            onChange={function (e) { setMassTextDate(e.target.value); setMassTextRecipients({}) }}
                                            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                                        />
                                    </div>

                                    {/* Recipients */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                                                Recipients ({selectedCount} selected)
                                            </label>
                                            {noPhoneCount > 0 && (
                                                <span style={{ fontSize: '11px', color: '#dc2626' }}>{noPhoneCount} missing phone — will skip</span>
                                            )}
                                        </div>
                                        {clientList.length === 0 ? (
                                            <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '8px', fontSize: '13px' }}>
                                                No appointments on this date.
                                            </div>
                                        ) : (
                                            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px' }}>
                                                {clientList.map(function (c) {
                                                    const checked = massTextRecipients[c.id] !== false && !!c.phone
                                                    return (
                                                        <label
                                                            key={c.id}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                                padding: '8px 10px', cursor: c.phone ? 'pointer' : 'not-allowed',
                                                                opacity: c.phone ? 1 : 0.5, fontSize: '13px',
                                                                borderRadius: '6px',
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={!c.phone}
                                                                onChange={function (e) {
                                                                    setMassTextRecipients(Object.assign({}, massTextRecipients, { [c.id]: e.target.checked }))
                                                                }}
                                                            />
                                                            <span style={{ flex: 1 }}>
                                                                <strong>{c.name || 'Unnamed'}</strong>
                                                                <span style={{ color: '#6b7280', marginLeft: '6px' }}>
                                                                    {c.phone || '(no phone)'} {c.times.length > 0 && '· ' + c.times.join(', ')}
                                                                </span>
                                                            </span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Message */}
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Message ({massTextMessage.length} chars)
                                        </label>
                                        <textarea
                                            value={massTextMessage}
                                            onChange={function (e) { setMassTextMessage(e.target.value) }}
                                            rows={4}
                                            placeholder="Hi, we have an emergency today and need to cancel your appointment. Please reach out to reschedule. Thank you!"
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                                        />
                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                            SMS fits 160 chars; longer messages may be split into multiple texts.
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button onClick={closeMassText} disabled={massTextSending} style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                                        <button
                                            onClick={handleSendMassText}
                                            disabled={massTextSending || selectedCount === 0 || !massTextMessage.trim()}
                                            style={{
                                                padding: '10px 20px',
                                                background: (massTextSending || selectedCount === 0 || !massTextMessage.trim()) ? '#9ca3af' : '#dc2626',
                                                color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer',
                                            }}
                                        >
                                            {massTextSending ? 'Sending...' : '📣 Send to ' + selectedCount}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* Drag-to-reschedule Confirm Modal (Item #6) */}
            {dragConfirm && (
                <DragDropConfirmModal
                    dragConfirm={dragConfirm}
                    staffMembers={staffMembers}
                    onCancel={() => setDragConfirm(null)}
                    onConfirm={handleConfirmDrop}
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
                    onSaved={(scope, cancelledApptId) => {
                        setCancellingAppt(null)
                        fetchData()
                        // Only fire waitlist auto-notify for single cancels
                        // (not bulk/recurring — those skip the waitlist ping).
                        if (scope === 'one' && cancelledApptId) {
                            checkWaitlistForOpening(cancelledApptId)
                        }
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
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <span
                                        className="appt-detail-badge"
                                        onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                                        style={{
                                            background: STATUS_COLORS[selectedAppt.status] || '#2563eb',
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                        }}
                                        title="Click to change status"
                                    >
                                        {selectedAppt.status ? selectedAppt.status.replace('_', ' ').toUpperCase() : 'UNKNOWN'} ▾
                                    </span>
                                    {statusDropdownOpen && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                marginTop: '6px',
                                                background: '#fff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                                                zIndex: 20,
                                                minWidth: '170px',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {['pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map((s, idx, arr) => {
                                                const isSelected = selectedAppt.status === s
                                                const label = s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
                                                return (
                                                    <div
                                                        key={s}
                                                        onClick={() => handleStatusChange(s)}
                                                        style={{
                                                            padding: '10px 12px',
                                                            cursor: 'pointer',
                                                            fontSize: '13px',
                                                            fontWeight: 500,
                                                            color: '#1f2937',
                                                            borderBottom: idx < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                                                            background: isSelected ? '#f9fafb' : '#fff',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6' }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#f9fafb' : '#fff' }}
                                                    >
                                                        <span style={{
                                                            display: 'inline-block',
                                                            width: '10px',
                                                            height: '10px',
                                                            borderRadius: '50%',
                                                            background: STATUS_COLORS[s],
                                                            flexShrink: 0,
                                                        }} />
                                                        <span style={{ flex: 1 }}>{label}</span>
                                                        {isSelected && <span style={{ color: '#6b7280' }}>✓</span>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
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
                                        {/* Task #77 — collapsible list of all dates in the series (REAL rows, clickable to jump) */}
                                        {(() => {
                                            var siblings = selectedAppt.recurring_siblings || []
                                            if (siblings.length === 0) return null
                                            var currentId = selectedAppt.id
                                            var todayStr = dateToString(new Date())
                                            return (
                                                <div className="appt-detail-recurring-dates-wrap">
                                                    <button
                                                        type="button"
                                                        className="appt-detail-recurring-toggle"
                                                        onClick={() => setShowRecurringDates(v => !v)}
                                                    >
                                                        {showRecurringDates ? '▾' : '▸'} {showRecurringDates ? 'Hide' : 'View'} all {siblings.length} dates
                                                    </button>
                                                    {showRecurringDates && (
                                                        <>
                                                            <p className="appt-detail-recurring-dates-hint">💡 Click any date to jump to that week</p>
                                                            <ul className="appt-detail-recurring-dates-list">
                                                                {siblings.map(function (s) {
                                                                    var isCurrent = s.id === currentId
                                                                    var isPast = (s.appointment_date < todayStr || !!s.checked_out_at) && !isCurrent
                                                                    var isCancelled = s.status === 'cancelled' || s.status === 'no_show' || s.status === 'rescheduled'
                                                                    var hasConflict = !!s.recurring_conflict
                                                                    var dObj = new Date(s.appointment_date + 'T00:00:00')
                                                                    var label = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                                                                    var cls = 'appt-detail-recurring-date-item'
                                                                    if (isCurrent) cls += ' appt-detail-recurring-date-current'
                                                                    else if (isPast) cls += ' appt-detail-recurring-date-past'
                                                                    if (isCancelled) cls += ' appt-detail-recurring-date-cancelled'
                                                                    if (hasConflict) cls += ' appt-detail-recurring-date-conflict'
                                                                    return (
                                                                        <li
                                                                            key={s.id}
                                                                            className={cls + (isCurrent ? '' : ' appt-detail-recurring-date-clickable')}
                                                                            onClick={isCurrent ? undefined : function () { jumpToSibling(s.id, s.appointment_date) }}
                                                                            title={isCurrent ? 'This is the appointment you\'re viewing' : 'Jump to this appointment'}
                                                                        >
                                                                            <span className="appt-detail-recurring-date-seq">#{s.recurring_sequence}</span>
                                                                            <span className="appt-detail-recurring-date-label">{label}</span>
                                                                            {hasConflict && <span className="appt-detail-recurring-date-tag appt-detail-recurring-date-tag-conflict">⚠️ conflict</span>}
                                                                            {isCurrent && <span className="appt-detail-recurring-date-tag">this one</span>}
                                                                            {isCancelled && <span className="appt-detail-recurring-date-tag appt-detail-recurring-date-tag-cancelled">{s.status}</span>}
                                                                            {isPast && !isCurrent && !isCancelled && <span className="appt-detail-recurring-date-tag appt-detail-recurring-date-tag-past">past</span>}
                                                                            {!isCurrent && <span className="appt-detail-recurring-date-jump">→</span>}
                                                                        </li>
                                                                    )
                                                                })}
                                                            </ul>
                                                        </>
                                                    )}
                                                </div>
                                            )
                                        })()}
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

                            {/* Groomer — click ✏️ Change to reassign (conflict check + override) */}
                            <div className="appt-detail-section">
                                <div className="appt-detail-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>✂️ Groomer</span>
                                    {!editingGroomer && (
                                        <button
                                            onClick={function () {
                                                setPendingStaffId(selectedAppt.staff_id || '')
                                                setEditingGroomer(true)
                                            }}
                                            style={{ background: 'transparent', border: '1px solid #d1d5db', color: '#6d28d9', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                        >
                                            ✏️ Change
                                        </button>
                                    )}
                                </div>
                                {editingGroomer ? (
                                    <div style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fafafa' }}>
                                        <select
                                            value={pendingStaffId}
                                            onChange={function (e) { setPendingStaffId(e.target.value) }}
                                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', marginBottom: '8px', background: '#fff' }}
                                        >
                                            <option value="">— Unassigned —</option>
                                            {(staffMembers || []).map(function (s) {
                                                return (
                                                    <option key={s.id} value={s.id}>
                                                        {s.first_name} {s.last_name || ''}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={handleChangeGroomer}
                                                style={{ flex: 1, padding: '8px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                            >
                                                ✓ Save
                                            </button>
                                            <button
                                                onClick={function () {
                                                    setEditingGroomer(false)
                                                    setPendingStaffId('')
                                                }}
                                                style={{ flex: 1, padding: '8px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>
                                            Tip: If the new groomer is already booked, you'll get a warning but can override.
                                        </div>
                                    </div>
                                ) : selectedAppt.staff_members ? (
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
                                            <div className="appt-detail-groomer-hint">Click ✏️ Change above to assign a groomer</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* MULTI-PET: Pets in Appointment (each with own service, price, health) */}
                            {selectedAppt.appointment_pets && selectedAppt.appointment_pets.length > 0 ? (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">
                                        🐕 {selectedAppt.appointment_pets.length === 1 ? 'Pet' : 'Pets (' + selectedAppt.appointment_pets.length + ')'}
                                    </div>
                                    {selectedAppt.appointment_pets.map(function (ap) {
                                        return (
                                            <div key={ap.id} className="appt-detail-pet-card" style={{ marginBottom: '12px', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
                                                {/* Pet header with remove button */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                    <div className="appt-detail-pet" style={{ flex: 1 }}>
                                                        <div className="appt-detail-pet-avatar" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                                                            {ap.pets?.name ? ap.pets.name.charAt(0).toUpperCase() : '?'}
                                                        </div>
                                                        <div>
                                                            <div className="appt-detail-pet-name">{ap.pets?.name || 'Unknown pet'}</div>
                                                            <div className="appt-detail-pet-info">
                                                                {ap.pets?.breed || 'Unknown breed'}
                                                                {ap.pets?.weight ? ' · ' + ap.pets.weight + ' lbs' : ''}
                                                                {ap.pets?.age ? ' · ' + ap.pets.age : ''}
                                                                {ap.pets?.sex ? ' · ' + ap.pets.sex : ''}
                                                            </div>
                                                            <div className="appt-detail-pet-tags">
                                                                {ap.pets?.is_spayed_neutered && <span className="appt-tag appt-tag-green">Spayed/Neutered</span>}
                                                                {ap.pets && !ap.pets.is_spayed_neutered && <span className="appt-tag appt-tag-yellow">Intact</span>}
                                                                {ap.pets?.is_senior && <span className="appt-tag appt-tag-blue">Senior</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* × Remove button (auto-shrinks appointment) */}
                                                    <button
                                                        onClick={function () { handleRemovePetFromAppointment(ap.id, ap.pets?.name || 'this pet') }}
                                                        title="Remove pet from appointment (auto-shrinks end time)"
                                                        style={{
                                                            background: '#fee2e2',
                                                            border: '1px solid #fecaca',
                                                            color: '#dc2626',
                                                            borderRadius: '6px',
                                                            padding: '2px 10px',
                                                            cursor: 'pointer',
                                                            fontWeight: 700,
                                                            fontSize: '18px',
                                                            lineHeight: '1.2',
                                                        }}
                                                    >×</button>
                                                </div>

                                                {/* Service for this pet — click ✏️ Change to swap (owner changed mind at drop-off, etc.) */}
                                                {editingServiceApptPetId === ap.id ? (
                                                    <div className="appt-detail-service-card" style={{ marginBottom: '8px' }}>
                                                        <select
                                                            value={pendingServiceId}
                                                            onChange={function (e) { setPendingServiceId(e.target.value) }}
                                                            style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '8px', background: '#fff' }}
                                                        >
                                                            <option value="">— Pick a service —</option>
                                                            {(services || []).map(function (s) {
                                                                return (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.service_name} — ${parseFloat(s.price || 0).toFixed(2)} · {s.time_block_minutes || 0} min
                                                                    </option>
                                                                )
                                                            })}
                                                        </select>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button
                                                                onClick={function () { handleChangePetService(ap.id) }}
                                                                disabled={!pendingServiceId}
                                                                style={{ flex: 1, padding: '8px 12px', background: pendingServiceId ? '#10b981' : '#d1d5db', color: 'white', border: 'none', borderRadius: '6px', cursor: pendingServiceId ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: '13px' }}
                                                            >✓ Save service</button>
                                                            <button
                                                                onClick={function () { setEditingServiceApptPetId(null); setPendingServiceId('') }}
                                                                style={{ flex: 1, padding: '8px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                                                            >Cancel</button>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', lineHeight: '1.4' }}>
                                                            💡 End time will auto-adjust. Price stays at ${parseFloat(ap.quoted_price || 0).toFixed(2)} — update manually if needed.
                                                        </div>
                                                    </div>
                                                ) : ap.services ? (
                                                    <div className="appt-detail-service-card" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div className="appt-detail-service-name">✂️ {ap.services.service_name}</div>
                                                            <div className="appt-detail-service-meta">
                                                                ${parseFloat(ap.quoted_price || ap.services.price || 0).toFixed(2)} · {ap.services.time_block_minutes} mins
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={function () { setEditingServiceApptPetId(ap.id); setPendingServiceId(ap.service_id || '') }}
                                                            title="Change service for this pet (auto-adjusts end time)"
                                                            style={{ background: '#fff', border: '1px solid #c4b5fd', color: '#6d28d9', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}
                                                        >✏️ Change</button>
                                                    </div>
                                                ) : (
                                                    <div className="appt-detail-service-card" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ flex: 1, color: '#9ca3af', fontStyle: 'italic' }}>No service picked</div>
                                                        <button
                                                            onClick={function () { setEditingServiceApptPetId(ap.id); setPendingServiceId('') }}
                                                            title="Pick a service for this pet"
                                                            style={{ background: '#fff', border: '1px solid #c4b5fd', color: '#6d28d9', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}
                                                        >+ Pick service</button>
                                                    </div>
                                                )}

                                                {/* Per-pet Health Alerts */}
                                                {ap.pets?.allergies && (
                                                    <div className="appt-alert appt-alert-red">
                                                        <strong>⚠️ ALLERGIES:</strong> {ap.pets.allergies}
                                                    </div>
                                                )}
                                                {ap.pets?.medications && (
                                                    <div className="appt-alert appt-alert-blue">
                                                        <strong>💊 MEDICATIONS:</strong> {ap.pets.medications}
                                                    </div>
                                                )}

                                                {/* Per-pet Vaccination */}
                                                {ap.pets?.vaccination_status && (
                                                    <div className="appt-detail-vax">
                                                        <span className={'appt-tag ' + (
                                                            ap.pets.vaccination_status === 'current' ? 'appt-tag-green' :
                                                            ap.pets.vaccination_status === 'expired' ? 'appt-tag-red' : 'appt-tag-yellow'
                                                        )}>
                                                            💉 {ap.pets.vaccination_status.replace('_', ' ').toUpperCase()}
                                                        </span>
                                                        {ap.pets.vaccination_expiry && (
                                                            <span className="appt-detail-vax-date">
                                                                Exp: {ap.pets.vaccination_expiry}
                                                                {new Date(ap.pets.vaccination_expiry) < new Date() && <span style={{ color: '#dc2626', fontWeight: 700 }}> — EXPIRED</span>}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Pet's pinned grooming notes (from pet profile) */}
                                                {ap.pets?.grooming_notes && (
                                                    <div className="appt-groom-note appt-groom-note-pinned" style={{ marginTop: '8px' }}>
                                                        <span className="appt-groom-note-badge">📌 Pet Profile</span>
                                                        {ap.pets.grooming_notes}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {/* + Add Pet button — for client adding 2nd dog later or surprise extra dog */}
                                    <button
                                        onClick={function () { setShowAddPetToApptModal(true) }}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            background: '#f3f4f6',
                                            border: '2px dashed #9ca3af',
                                            borderRadius: '8px',
                                            color: '#6b7280',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                        }}
                                    >+ Add Pet to this Appointment</button>
                                </div>
                            ) : (
                                /* LEGACY FALLBACK — old appointments without appointment_pets rows */
                                <>
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
                                                </div>
                                            </div>
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
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Grooming Notes — historical (per-pet pinned notes are now shown inside each pet card) */}
                            {selectedAppt.groomingNotes && selectedAppt.groomingNotes.length > 0 && (
                                <div className="appt-detail-section">
                                    <div className="appt-detail-section-title">✂️ Past Grooming Notes</div>
                                    {selectedAppt.groomingNotes.map(note => (
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
                                        <div className="appt-detail-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>💳 Payment History</span>
                                            <button
                                                type="button"
                                                onClick={openAddPayment}
                                                className="appt-payment-add-btn"
                                                title="Add an additional payment (tip later, second partial, etc.)"
                                            >
                                                ➕ Add Payment
                                            </button>
                                        </div>
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
                                                            {/* Edit + Delete — for tip-added-later or typo corrections */}
                                                            <div className="appt-payment-actions">
                                                                <button
                                                                    type="button"
                                                                    className="appt-payment-edit-btn"
                                                                    onClick={function () { openEditPayment(p) }}
                                                                    title="Edit this payment"
                                                                >
                                                                    ✏️ Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="appt-payment-delete-btn"
                                                                    onClick={function () { handleDeletePayment(p) }}
                                                                    title="Delete this payment"
                                                                >
                                                                    🗑️ Delete
                                                                </button>
                                                            </div>
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

                            {/* 💬 Send Message — quick compose to the pet's owner without leaving the calendar */}
                            <div className="appt-detail-section">
                                <div className="appt-detail-section-title">💬 Send Message</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                                    Text the owner directly — goes to their client portal inbox and phone.
                                </div>
                                <textarea
                                    value={newMessageText}
                                    onChange={(e) => setNewMessageText(e.target.value)}
                                    placeholder="e.g. Hi! Just letting you know Lilly will be ready in 10 minutes 🐾"
                                    rows={3}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        fontSize: '14px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        fontFamily: 'inherit',
                                        resize: 'vertical',
                                        boxSizing: 'border-box',
                                    }}
                                    disabled={sendingMessage}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '13px', minHeight: '18px' }}>
                                        {sendMessageStatus === 'success' && (
                                            <span style={{ color: '#047857' }}>✓ Message sent</span>
                                        )}
                                        {sendMessageStatus === 'error' && (
                                            <span style={{ color: '#b91c1c' }}>✗ Couldn't send — try again</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Link
                                            to={'/messages'}
                                            style={{ fontSize: '13px', color: '#2563eb', textDecoration: 'underline', alignSelf: 'center' }}
                                            onClick={() => setSelectedAppt(null)}
                                        >
                                            View full conversation
                                        </Link>
                                        <button
                                            type="button"
                                            className="appt-notes-add-btn"
                                            onClick={handleSendMessageFromPopup}
                                            disabled={!newMessageText.trim() || sendingMessage}
                                            style={{ opacity: (!newMessageText.trim() || sendingMessage) ? 0.5 : 1 }}
                                        >
                                            {sendingMessage ? 'Sending…' : '💬 Send Message'}
                                        </button>
                                    </div>
                                </div>
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

            {/* + Add Pet to existing appointment modal (multi-pet — for client adding 2nd dog later) */}
            {showAddPetToApptModal && selectedAppt && (
                <AddPetToBookingModal
                    filteredPets={pets.filter(function (p) { return p.client_id === selectedAppt.client_id })}
                    services={services}
                    petsAlreadyAdded={(selectedAppt.appointment_pets || []).map(function (ap) { return { pet_id: ap.pet_id } })}
                    onClose={function () { setShowAddPetToApptModal(false) }}
                    onAdd={handleAddPetToExistingAppointment}
                />
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

            {/* Edit Payment Modal — fix typo, add tip that came in later, change method */}
            {editingPayment && (
                <div className="modal-overlay" onClick={function () { if (!savingEditPayment) setEditingPayment(null) }} style={{ zIndex: 2100 }}>
                    <div className="add-note-popup" onClick={function (e) { e.stopPropagation() }} style={{ maxWidth: '420px' }}>
                        <div className="add-note-popup-header">
                            <h3>✏️ Edit Payment</h3>
                            <button className="modal-close" onClick={function () { if (!savingEditPayment) setEditingPayment(null) }}>×</button>
                        </div>
                        <div style={{ padding: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Amount</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontWeight: 600 }}>$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editPayAmount}
                                            onChange={function (e) { setEditPayAmount(e.target.value) }}
                                            disabled={savingEditPayment}
                                            style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Tip</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontWeight: 600 }}>$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editPayTip}
                                            onChange={function (e) { setEditPayTip(e.target.value) }}
                                            disabled={savingEditPayment}
                                            style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Payment Method</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'cash', label: '💵 Cash' },
                                        { id: 'zelle', label: '⚡ Zelle' },
                                        { id: 'venmo', label: '🔵 Venmo' },
                                        { id: 'card', label: '💳 Card' },
                                        { id: 'check', label: '📝 Check' },
                                    ].map(function (m) {
                                        var active = editPayMethod === m.id
                                        return (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={function () { setEditPayMethod(m.id) }}
                                                disabled={savingEditPayment}
                                                style={{ flex: '1 0 auto', minWidth: '72px', padding: '8px 10px', border: '1px solid ' + (active ? '#7c3aed' : '#d1d5db'), background: active ? '#ede9fe' : '#fff', color: active ? '#6d28d9' : '#374151', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                                            >
                                                {m.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Notes (optional)</label>
                                <input
                                    type="text"
                                    value={editPayNotes}
                                    onChange={function (e) { setEditPayNotes(e.target.value) }}
                                    placeholder='e.g. "Tip added next day"'
                                    disabled={savingEditPayment}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handleUpdatePayment}
                                    disabled={savingEditPayment}
                                    style={{ flex: 1, padding: '10px 12px', background: savingEditPayment ? '#a7f3d0' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: savingEditPayment ? 'wait' : 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    {savingEditPayment ? 'Saving…' : '✓ Save Changes'}
                                </button>
                                <button
                                    onClick={function () { setEditingPayment(null) }}
                                    disabled={savingEditPayment}
                                    style={{ flex: 1, padding: '10px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Payment Modal — for post-checkout additions (late tip, second partial, etc.) */}
            {showAddPayment && selectedAppt && (
                <div className="modal-overlay" onClick={function () { if (!savingAddPayment) setShowAddPayment(false) }} style={{ zIndex: 2100 }}>
                    <div className="add-note-popup" onClick={function (e) { e.stopPropagation() }} style={{ maxWidth: '420px' }}>
                        <div className="add-note-popup-header">
                            <h3>➕ Add Payment</h3>
                            <button className="modal-close" onClick={function () { if (!savingAddPayment) setShowAddPayment(false) }}>×</button>
                        </div>
                        <div style={{ padding: '16px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', fontStyle: 'italic' }}>
                                Adds a new payment row — use this for a tip that came in later, a second partial payment, etc.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Amount</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontWeight: 600 }}>$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={addPayAmount}
                                            onChange={function (e) { setAddPayAmount(e.target.value) }}
                                            placeholder="0.00"
                                            disabled={savingAddPayment}
                                            style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Tip</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontWeight: 600 }}>$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={addPayTip}
                                            onChange={function (e) { setAddPayTip(e.target.value) }}
                                            placeholder="0.00"
                                            disabled={savingAddPayment}
                                            style={{ width: '100%', padding: '8px 10px 8px 22px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Payment Method</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'cash', label: '💵 Cash' },
                                        { id: 'zelle', label: '⚡ Zelle' },
                                        { id: 'venmo', label: '🔵 Venmo' },
                                        { id: 'card', label: '💳 Card' },
                                        { id: 'check', label: '📝 Check' },
                                    ].map(function (m) {
                                        var active = addPayMethod === m.id
                                        return (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={function () { setAddPayMethod(m.id) }}
                                                disabled={savingAddPayment}
                                                style={{ flex: '1 0 auto', minWidth: '72px', padding: '8px 10px', border: '1px solid ' + (active ? '#7c3aed' : '#d1d5db'), background: active ? '#ede9fe' : '#fff', color: active ? '#6d28d9' : '#374151', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                                            >
                                                {m.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Notes (optional)</label>
                                <input
                                    type="text"
                                    value={addPayNotes}
                                    onChange={function (e) { setAddPayNotes(e.target.value) }}
                                    placeholder='e.g. "Tip dropped off next day"'
                                    disabled={savingAddPayment}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handleAddAdditionalPayment}
                                    disabled={savingAddPayment}
                                    style={{ flex: 1, padding: '10px 12px', background: savingAddPayment ? '#a7f3d0' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: savingAddPayment ? 'wait' : 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    {savingAddPayment ? 'Saving…' : '✓ Add Payment'}
                                </button>
                                <button
                                    onClick={function () { setShowAddPayment(false) }}
                                    disabled={savingAddPayment}
                                    style={{ flex: 1, padding: '10px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
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
                // MULTI-PET: sum appointment_pets prices if present; otherwise use parent appt price (legacy)
                var isMultiPet = paymentAppt.appointment_pets && paymentAppt.appointment_pets.length > 0
                var servicePrice
                if (isMultiPet) {
                    servicePrice = paymentAppt.appointment_pets.reduce(function (sum, ap) {
                        return sum + parseFloat(ap.quoted_price || 0)
                    }, 0)
                } else {
                    servicePrice = parseFloat(paymentAppt.final_price || paymentAppt.quoted_price || 0)
                }
                const discount = parseFloat(discountAmount || 0)
                const totalPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
                const amountDue = Math.max(0, servicePrice - discount)
                const balance = Math.max(0, amountDue - totalPaid)
                const thisPayment = parseFloat(paymentAmount || 0)
                const thisTip = parseFloat(tipAmount || 0)
                const thisTotal = thisPayment + thisTip
                const isPaidInFull = balance < 0.01

                // Pet name display: "Bella, Max" for multi-pet; single name for legacy
                var petNameDisplay
                if (isMultiPet) {
                    petNameDisplay = paymentAppt.appointment_pets
                        .map(function (ap) { return ap.pets && ap.pets.name })
                        .filter(Boolean)
                        .join(', ')
                } else {
                    petNameDisplay = (paymentAppt.pets && paymentAppt.pets.name) || 'Unknown pet'
                }

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
                                    <span className="payment-popup-pet">{petNameDisplay}</span>
                                    <span className="payment-popup-dot">·</span>
                                    <span className="payment-popup-client">{paymentAppt.clients?.first_name} {paymentAppt.clients?.last_name}</span>
                                </div>

                                {/* Receipt Breakdown */}
                                <div className="payment-receipt">
                                    {isMultiPet ? (
                                        <>
                                            {/* Per-pet line items */}
                                            {paymentAppt.appointment_pets.map(function (ap) {
                                                var petName = (ap.pets && ap.pets.name) || 'Pet'
                                                var svcName = ''
                                                // Try to resolve service name from services list if loaded
                                                var svc = services && services.find ? services.find(function (s) { return s.id === ap.service_id }) : null
                                                if (svc) svcName = svc.service_name
                                                return (
                                                    <div key={ap.id} className="payment-receipt-row">
                                                        <span>{petName}{svcName ? ' · ' + svcName : ''}</span>
                                                        <span>${parseFloat(ap.quoted_price || 0).toFixed(2)}</span>
                                                    </div>
                                                )
                                            })}
                                            <div className="payment-receipt-row payment-receipt-sub" style={{ fontWeight: 600, borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '4px' }}>
                                                <span>Subtotal</span>
                                                <span>${servicePrice.toFixed(2)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="payment-receipt-row">
                                            <span>Service</span>
                                            <span>${servicePrice.toFixed(2)}</span>
                                        </div>
                                    )}

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
                                            <button
                                                type="button"
                                                className={'payment-method-btn' + (paymentMethod === 'card' ? ' payment-method-btn-active' : '')}
                                                onClick={() => setPaymentMethod('card')}
                                                disabled={recordingPayment}
                                            >
                                                💳 Credit Card
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

function TimeGridView({ view, currentDate, appointments, blockedTimes, staff, onSlotClick, onApptClick, onBlockClick, onCheckIn, onCheckOut, checkingIn, checkingOut, onApptDragStart, onApptDragEnd, onSlotDrop, draggedApptId }) {
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
                                // Task #38 — gather blocked_times for this slot+column
                                const slotBlocks = (blockedTimes || []).filter((b) => {
                                    if (b.block_date !== dateStr) return false
                                    const startH = parseInt(b.start_time.split(':')[0])
                                    if (startH !== hour) return false
                                    return (b.staff_id || null) === (col.id || null)
                                })
                                return (
                                    <div
                                        key={col.id || 'unassigned'}
                                        className={'time-cell' + (draggedApptId ? ' time-cell-drop-target' : '')}
                                        style={{ position: 'relative' }}
                                        onClick={() => onSlotClick(currentDate, hour, col.id)}
                                        onDragOver={(e) => { if (draggedApptId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                                        onDrop={(e) => { e.preventDefault(); if (onSlotDrop) onSlotDrop(currentDate, hour, col.id || null) }}
                                    >
                                        {renderApptBlocks(slotAppts, onApptClick, onCheckIn, onCheckOut, checkingIn, checkingOut, hour, onApptDragStart, onApptDragEnd, draggedApptId)}
                                        {renderBlockedTimes(slotBlocks, onBlockClick, hour)}
                                    </div>
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
                            // Task #38 — gather blocked_times for this date+hour
                            const slotBlocks = (blockedTimes || []).filter((b) => {
                                if (b.block_date !== dateStr) return false
                                const startH = parseInt(b.start_time.split(':')[0])
                                return startH === hour
                            })
                            return (
                                <div
                                    key={i}
                                    className={'time-cell' + (draggedApptId ? ' time-cell-drop-target' : '')}
                                    style={{ position: 'relative' }}
                                    onClick={() => onSlotClick(date, hour)}
                                    onDragOver={(e) => { if (draggedApptId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                                    onDrop={(e) => { e.preventDefault(); if (onSlotDrop) onSlotDrop(date, hour, undefined) }}
                                >
                                    {slotAppts.map((appt) => {
                                        // Task #72 fix — size the block by ACTUAL minutes, not whole hours.
                                        // Old bug: span = endH - startH ignored minutes → 30-min appt rendered as 60-min block,
                                        // 90-min appt rendered as 60-min block, 9:30 appt rendered starting at 9:00, etc.
                                        const [sh, smRaw] = appt.start_time.split(':').map(Number)
                                        const [eh, emRaw] = appt.end_time.split(':').map(Number)
                                        const sm = smRaw || 0
                                        const em = emRaw || 0
                                        const startTotalMin = sh * 60 + sm
                                        const endTotalMin = eh * 60 + em
                                        const durationMin = Math.max(15, endTotalMin - startTotalMin)
                                        const startOffsetMin = startTotalMin - (hour * 60) // where inside the hour cell this appt starts
                                        const topPct = (startOffsetMin / 60) * 100
                                        const heightPct = (durationMin / 60) * 100
                                        const groomerColor = appt.staff_members?.color_code || '#9ca3af'
                                        const groomerName = appt.staff_members ? appt.staff_members.first_name : 'Unassigned'
                                        const isRecurring = !!appt.recurring_series_id
                                        const hasConflict = !!appt.recurring_conflict
                                        // Status-based styling (Task: status colors/badges)
                                        const apptStatus = appt.status || 'confirmed'
                                        const isPending = apptStatus === 'pending'
                                        const isCancelled = apptStatus === 'cancelled'
                                        // Phase 6 — booking-rule flag pending (AI held it for groomer approval)
                                        const isFlaggedPending = appt.flag_status === 'pending'
                                        const blockBg = isPending ? '#fbbf24' : (isCancelled ? '#d1d5db' : groomerColor)
                                        const blockBorder = isPending ? '#d97706' : (isCancelled ? '#9ca3af' : groomerColor)
                                        // Badge label + colors (only shown pre-check-in, except DONE handled below)
                                        let statusBadge = null
                                        if (!appt.checked_in_at && !appt.checked_out_at) {
                                            if (isPending || isFlaggedPending) statusBadge = { label: '⏳ PENDING', bg: '#78350f', fg: '#fef3c7' }
                                            else if (isCancelled) statusBadge = { label: '❌ CANCELLED', bg: '#991b1b', fg: '#fee2e2' }
                                            else if (apptStatus === 'confirmed') statusBadge = { label: '✓ CONFIRMED', bg: '#065f46', fg: '#d1fae5' }
                                            else if (apptStatus === 'unconfirmed') statusBadge = { label: '❓ UNCONFIRMED', bg: '#92400e', fg: '#fef3c7' }
                                        }
                                        const isDraggable = !isCancelled && apptStatus !== 'completed' && !appt.checked_out_at
                                        const isBeingDragged = draggedApptId === appt.id
                                        return (
                                            <div
                                                key={appt.id}
                                                className={
                                                    'appt-block' +
                                                    (!appt.staff_members ? ' appt-unassigned' : '') +
                                                    (appt.checked_in_at && !appt.checked_out_at ? ' appt-checked-in' : '') +
                                                    (appt.checked_out_at ? ' appt-checked-out' : '') +
                                                    (hasConflict ? ' appt-recurring-conflict' : '') +
                                                    (isCancelled ? ' appt-cancelled' : '') +
                                                    (isPending ? ' appt-pending' : '') +
                                                    (isBeingDragged ? ' appt-dragging' : '')
                                                }
                                                draggable={isDraggable}
                                                onDragStart={(e) => {
                                                    if (!isDraggable) { e.preventDefault(); return }
                                                    e.dataTransfer.effectAllowed = 'move'
                                                    e.dataTransfer.setData('text/plain', appt.id)
                                                    if (onApptDragStart) onApptDragStart(appt)
                                                }}
                                                onDragEnd={() => { if (onApptDragEnd) onApptDragEnd() }}
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(' + topPct + '% + 2px)',
                                                    left: '2px',
                                                    right: '2px',
                                                    height: 'calc(' + heightPct + '% - 4px)',
                                                    minHeight: '26px',
                                                    zIndex: 5,
                                                    backgroundColor: blockBg,
                                                    borderLeft: '4px solid ' + blockBorder,
                                                    cursor: isDraggable ? 'grab' : 'pointer',
                                                    opacity: isBeingDragged ? 0.4 : (isCancelled ? 0.6 : 1),
                                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                                }}
                                                onClick={(e) => onApptClick(appt, e)}
                                                title={'Groomer: ' + groomerName + ' · Status: ' + apptStatus + (isRecurring ? ' · Recurring appointment' : '') + (hasConflict ? ' · ⚠️ Conflict' : '') + (isDraggable ? ' · Drag to reschedule' : '')}
                                            >
                                                <span className="appt-time">{formatTime(appt.start_time)}</span>
                                                <span className="appt-pet">{(appt.appointment_pets && appt.appointment_pets.length > 0) ? appt.appointment_pets.map(function(ap){ return ap.pets?.name }).filter(Boolean).join(', ') : appt.pets?.name}</span>
                                                <span className="appt-client">{appt.clients?.first_name} {appt.clients?.last_name}</span>
                                                <span className="appt-groomer-tag">{groomerName}</span>
                                                {statusBadge && (
                                                    <span
                                                        style={{
                                                            display: 'inline-block',
                                                            marginTop: '4px',
                                                            padding: '2px 8px',
                                                            fontSize: '10px',
                                                            fontWeight: 700,
                                                            borderRadius: '4px',
                                                            background: statusBadge.bg,
                                                            color: statusBadge.fg,
                                                            letterSpacing: '0.3px',
                                                            alignSelf: 'flex-start',
                                                        }}
                                                    >
                                                        {statusBadge.label}
                                                    </span>
                                                )}
                                                {appt.appointment_pets && appt.appointment_pets.length > 1 && <span className="appt-multi-pet-badge" title={appt.appointment_pets.length + ' pets'}>×{appt.appointment_pets.length}</span>}
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
                                    {renderBlockedTimes(slotBlocks, onBlockClick, hour)}
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

// Task #38 — render gray "BLOCKED" tiles for staff lunch/errand time
// Task #72 fix — size tiles by actual minutes, not whole hours
function renderBlockedTimes(slotBlocks, onBlockClick, hour) {
    return (slotBlocks || []).map((blk) => {
        const [sh, smRaw] = blk.start_time.split(':').map(Number)
        const [eh, emRaw] = blk.end_time.split(':').map(Number)
        const sm = smRaw || 0
        const em = emRaw || 0
        const startTotalMin = sh * 60 + sm
        const endTotalMin = eh * 60 + em
        const durationMin = Math.max(15, endTotalMin - startTotalMin)
        const startOffsetMin = startTotalMin - ((hour || sh) * 60)
        const topPct = (startOffsetMin / 60) * 100
        const heightPct = (durationMin / 60) * 100
        const staffName = blk.staff_members ? blk.staff_members.first_name : 'Blocked'
        return (
            <div
                key={blk.id}
                className="appt-block appt-blocked"
                style={{
                    position: 'absolute',
                    top: 'calc(' + topPct + '% + 2px)',
                    left: '2px',
                    right: '2px',
                    height: 'calc(' + heightPct + '% - 4px)',
                    minHeight: '26px',
                    zIndex: 4,
                    backgroundColor: '#9ca3af',
                    borderLeft: '4px solid #6b7280',
                    cursor: 'pointer',
                    color: '#fff',
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
                onClick={(e) => { e.stopPropagation(); if (onBlockClick) onBlockClick(blk) }}
                title={'BLOCKED — ' + staffName + (blk.note ? ' (' + blk.note + ')' : '') + ' — click to edit'}
            >
                <span className="appt-time">{formatTime(blk.start_time)}</span>
                <span className="appt-pet">🚫 BLOCKED</span>
                {blk.note && <span className="appt-client">{blk.note}</span>}
                <span className="appt-groomer-tag">{staffName}</span>
            </div>
        )
    })
}

function renderApptBlocks(slotAppts, onApptClick, onCheckIn, onCheckOut, checkingIn, checkingOut, hour, onApptDragStart, onApptDragEnd, draggedApptId) {
    return slotAppts.map((appt) => {
        // Task #72 fix — size blocks by actual minutes, not whole hours
        const [sh, smRaw] = appt.start_time.split(':').map(Number)
        const [eh, emRaw] = appt.end_time.split(':').map(Number)
        const sm = smRaw || 0
        const em = emRaw || 0
        const startTotalMin = sh * 60 + sm
        const endTotalMin = eh * 60 + em
        const durationMin = Math.max(15, endTotalMin - startTotalMin)
        const startOffsetMin = startTotalMin - ((hour || sh) * 60)
        const topPct = (startOffsetMin / 60) * 100
        const heightPct = (durationMin / 60) * 100
        const groomerColor = appt.staff_members?.color_code || '#9ca3af'
        const groomerName = appt.staff_members ? appt.staff_members.first_name : 'Unassigned'
        const isRecurring = !!appt.recurring_series_id
        const hasConflict = !!appt.recurring_conflict
        // Phase 6 — booking-rule flag pending (AI held it for groomer approval)
        const isFlaggedPending = appt.flag_status === 'pending'
        const apptStatus = appt.status || 'confirmed'
        const isCancelled = apptStatus === 'cancelled'
        const isDraggable = !isCancelled && apptStatus !== 'completed' && !appt.checked_out_at
        const isBeingDragged = draggedApptId === appt.id
        return (
            <div
                key={appt.id}
                className={
                    'appt-block' +
                    (!appt.staff_members ? ' appt-unassigned' : '') +
                    (appt.checked_in_at && !appt.checked_out_at ? ' appt-checked-in' : '') +
                    (appt.checked_out_at ? ' appt-checked-out' : '') +
                    (hasConflict ? ' appt-recurring-conflict' : '') +
                    (isBeingDragged ? ' appt-dragging' : '')
                }
                draggable={isDraggable}
                onDragStart={(e) => {
                    if (!isDraggable) { e.preventDefault(); return }
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', appt.id)
                    if (onApptDragStart) onApptDragStart(appt)
                }}
                onDragEnd={() => { if (onApptDragEnd) onApptDragEnd() }}
                style={{
                    position: 'absolute',
                    top: 'calc(' + topPct + '% + 2px)',
                    left: '2px',
                    right: '2px',
                    height: 'calc(' + heightPct + '% - 4px)',
                    minHeight: '26px',
                    zIndex: 5,
                    backgroundColor: groomerColor,
                    borderLeft: '4px solid ' + groomerColor,
                    cursor: isDraggable ? 'grab' : 'pointer',
                    opacity: isBeingDragged ? 0.4 : 1,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
                onClick={(e) => onApptClick(appt, e)}
                title={'Groomer: ' + groomerName + (isRecurring ? ' · Recurring appointment' : '') + (hasConflict ? ' · ⚠️ Conflict' : '') + (isFlaggedPending ? ' · ⏳ Needs approval' : '') + (isDraggable ? ' · Drag to reschedule' : '')}
            >
                <span className="appt-time">{formatTime(appt.start_time)}</span>
                <span className="appt-pet">{(appt.appointment_pets && appt.appointment_pets.length > 0) ? appt.appointment_pets.map(function(ap){ return ap.pets?.name }).filter(Boolean).join(', ') : appt.pets?.name}</span>
                <span className="appt-client">{appt.clients?.first_name} {appt.clients?.last_name}</span>
                <span className="appt-groomer-tag">{groomerName}</span>
                {isFlaggedPending && !appt.checked_in_at && !appt.checked_out_at && (
                    <span
                        style={{
                            display: 'inline-block',
                            marginTop: '4px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            background: '#78350f',
                            color: '#fef3c7',
                            letterSpacing: '0.3px',
                            alignSelf: 'flex-start',
                        }}
                    >
                        ⏳ PENDING
                    </span>
                )}
                {appt.appointment_pets && appt.appointment_pets.length > 1 && <span className="appt-multi-pet-badge" title={appt.appointment_pets.length + ' pets'}>×{appt.appointment_pets.length}</span>}
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

// ─────────────────────────────────────────────────────────────────────
// QuickJump — 1 through 14 weeks out from today (matches MoeGo).
// Click a button → calendar jumps to that date and switches to day view.
// Clients constantly ask "book me in 4 weeks" / "book me in 8 weeks" —
// this saves clicking week-by-week through the mini calendar.
// ─────────────────────────────────────────────────────────────────────
function QuickJump({ onJump }) {
    const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

    function jumpToWeeksOut(n) {
        const target = new Date()
        target.setHours(0, 0, 0, 0)
        target.setDate(target.getDate() + (n * 7))
        onJump(target)
    }

    return (
        <div className="quick-jump">
            <div className="quick-jump-title">Quick jump</div>
            <div className="quick-jump-grid">
                {WEEKS.map(function (n) {
                    return (
                        <button
                            key={n}
                            type="button"
                            className="quick-jump-btn"
                            onClick={function () { jumpToWeeksOut(n) }}
                        >
                            {n === 1 ? '1 week out' : n + ' weeks out'}
                        </button>
                    )
                })}
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
    // Multi-pet booking: pets are now stored in a list, each with their own service + price
    const [form, setForm] = useState({
        client_id: preFillClientId || '',
        staff_id: preFillStaffId || '',
        appointment_date: date || '',
        start_time: time || '09:00',
        end_time: '',
        service_notes: '',
        status: 'unconfirmed',
    })
    // Multi-pet: array of { pet_id, pet_name, service_id, service_name, quoted_price, time_block_minutes }
    const [petsInBooking, setPetsInBooking] = useState([])
    const [showAddPetModal, setShowAddPetModal] = useState(false)

    // Client search (replaces the old dropdown)
    const [clientSearch, setClientSearch] = useState('')
    const [showClientResults, setShowClientResults] = useState(false)
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

    // When client changes, clear pets list (they belonged to old client)
    useEffect(() => {
        setPetsInBooking([])
    }, [form.client_id])

    // Pre-fill first pet if preFillPetId provided (Book Again / Quick Book flows)
    useEffect(() => {
        if (preFillPetId && pets.length > 0 && services.length > 0 && petsInBooking.length === 0) {
            var pet = pets.find(function (p) { return p.id === preFillPetId })
            var service = preFillServiceId ? services.find(function (s) { return s.id === preFillServiceId }) : null
            if (pet) {
                setPetsInBooking([{
                    pet_id: pet.id,
                    pet_name: pet.name,
                    service_id: service ? service.id : '',
                    service_name: service ? service.service_name : '',
                    quoted_price: service ? service.price : '',
                    time_block_minutes: service ? service.time_block_minutes : 60,
                }])
            }
        }
    }, [preFillPetId, preFillServiceId, pets, services])

    // Auto-calc end_time based on total time of all pets combined
    useEffect(() => {
        if (petsInBooking.length > 0 && form.start_time) {
            var totalMinutes = petsInBooking.reduce(function (sum, p) {
                return sum + (p.time_block_minutes || 60)
            }, 0)
            setForm(function (prev) {
                return { ...prev, end_time: calculateEndTime(prev.start_time, totalMinutes) }
            })
        }
    }, [petsInBooking, form.start_time])

    // Total price = sum of all pets' quoted prices
    var totalPrice = petsInBooking.reduce(function (sum, p) {
        return sum + (parseFloat(p.quoted_price) || 0)
    }, 0)

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

    // Run PetPro AI safety check (checks first pet for now; multi-pet safety check is a future enhancement)
    const runSafetyCheck = async () => {
        if (petsInBooking.length === 0) {
            setError('Add at least one pet first so PetPro AI can check their profile.')
            return
        }
        setChecking(true)
        setError(null)
        setSafetyCheck(null)

        var firstPet = petsInBooking[0]
        const result = await checkBookingSafety({
            pet_id: firstPet.pet_id,
            service_id: firstPet.service_id || null,
            appointment_date: form.appointment_date,
            start_time: form.start_time,
            end_time: form.end_time || calculateEndTime(form.start_time, 60),
            staff_id: form.staff_id || null, // Task #38 — needed to match per-staff blocked_times
        })

        setSafetyCheck(result)
        setChecking(false)
    }

    // Remove a pet from the booking list
    var removePetFromBooking = function (index) {
        setPetsInBooking(function (prev) {
            return prev.filter(function (_, i) { return i !== index })
        })
    }

    // Add a pet to the booking (called from AddPetToBookingModal)
    var addPetToBooking = function (petData) {
        setPetsInBooking(function (prev) { return [...prev, petData] })
        setShowAddPetModal(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)

        // Multi-pet validation: must have at least one pet
        if (petsInBooking.length === 0) {
            setError('Add at least one pet to the booking.')
            setSaving(false)
            return
        }

        const { data: { user } } = await supabase.auth.getUser()

        // First pet is used for backward-compat fields on appointments table
        var firstPet = petsInBooking[0]

        // Build flag data from safety check
        const hasFlags = safetyCheck && safetyCheck.flags && safetyCheck.flags.length > 0
        const flagDetails = hasFlags ? JSON.stringify(safetyCheck.flags) : null
        const flagStatus = hasFlags
            ? (safetyCheck.approved ? 'approved' : 'pending')
            : 'none'

        const endTime = form.end_time || calculateEndTime(form.start_time, 60)

        // ═══════════ Task #38 — Block off time conflict check ═══════════
        // Refuse to save if the requested slot overlaps a blocked_times row
        // for the same staff member (or for "any staff" / null) on this date.
        // Time overlap rule: appt_start < block_end AND appt_end > block_start
        try {
            var staffFilter = form.staff_id || null
            var blockQuery = supabase
                .from('blocked_times')
                .select('id, start_time, end_time, note, staff_id, staff_members(first_name, last_name)')
                .eq('groomer_id', user.id)
                .eq('block_date', form.appointment_date)

            // Match blocks for THIS staff member, OR shop-wide blocks (staff_id is null)
            if (staffFilter) {
                blockQuery = blockQuery.or('staff_id.eq.' + staffFilter + ',staff_id.is.null')
            } else {
                blockQuery = blockQuery.is('staff_id', null)
            }

            var { data: dayBlocks, error: blockErr } = await blockQuery
            if (blockErr) throw new Error('Could not check blocked times: ' + blockErr.message)

            var conflict = (dayBlocks || []).find(function (b) {
                // overlap if appt starts before block ends AND appt ends after block starts
                return form.start_time < b.end_time && endTime > b.start_time
            })

            if (conflict) {
                var who = conflict.staff_members
                    ? (conflict.staff_members.first_name + (conflict.staff_members.last_name ? ' ' + conflict.staff_members.last_name : ''))
                    : 'this time'
                var noteBit = conflict.note ? ' (' + conflict.note + ')' : ''
                setError(
                    "🚫 That time isn't available — " + who + ' has it blocked off' + noteBit +
                    ' from ' + formatTime(conflict.start_time) + ' to ' + formatTime(conflict.end_time) +
                    '. Please pick a different time.'
                )
                setSaving(false)
                return
            }
        } catch (err) {
            setError(err.message || 'Could not verify availability — please try again.')
            setSaving(false)
            return
        }
        // ═══════════ End block conflict check ═══════════

        // Helper: insert one row per pet into appointment_pets for a given appointment_id
        async function insertAppointmentPets(appointmentId) {
            var rows = petsInBooking.map(function (p) {
                return {
                    appointment_id: appointmentId,
                    pet_id: p.pet_id,
                    service_id: p.service_id || null,
                    quoted_price: p.quoted_price ? parseFloat(p.quoted_price) : null,
                    groomer_id: user.id,
                }
            })
            var { error: petsErr } = await supabase.from('appointment_pets').insert(rows)
            if (petsErr) throw new Error('Failed to save pets on appointment: ' + petsErr.message)
        }

        // ═══════════ Task #19 — Recurring series path ═══════════
        if (isRecurring) {
            try {
                // 1. Create the recurring_series row (uses first pet for backward compat)
                const { data: seriesRow, error: seriesErr } = await supabase
                    .from('recurring_series')
                    .insert({
                        groomer_id: user.id,
                        client_id: form.client_id,
                        pet_id: firstPet.pet_id,
                        service_id: firstPet.service_id || null,
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
                        pet_id: firstPet.pet_id,
                        service_id: firstPet.service_id || null,
                        staff_id: form.staff_id || null,
                        appointment_date: g.date_str,
                        start_time: form.start_time,
                        end_time: endTime,
                        quoted_price: totalPrice ? totalPrice : null,
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

                // 5. Bulk insert all appointments (select back so we have IDs for appointment_pets)
                const { data: insertedAppts, error: bulkErr } = await supabase
                    .from('appointments')
                    .insert(rowsToInsert)
                    .select('id')

                if (bulkErr) throw new Error('Failed to create appointments: ' + bulkErr.message)

                // 6. For each inserted appointment, insert appointment_pets rows
                if (insertedAppts && insertedAppts.length > 0) {
                    var allPetRows = []
                    insertedAppts.forEach(function (appt) {
                        petsInBooking.forEach(function (p) {
                            allPetRows.push({
                                appointment_id: appt.id,
                                pet_id: p.pet_id,
                                service_id: p.service_id || null,
                                quoted_price: p.quoted_price ? parseFloat(p.quoted_price) : null,
                                groomer_id: user.id,
                            })
                        })
                    })
                    var { error: petsErr } = await supabase.from('appointment_pets').insert(allPetRows)
                    if (petsErr) throw new Error('Failed to save pets on recurring appointments: ' + petsErr.message)
                }

                // 7. Build summary for user
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
                pet_id: firstPet.pet_id,
                service_id: firstPet.service_id || null,
                staff_id: form.staff_id || null,
                appointment_date: form.appointment_date,
                start_time: form.start_time,
                end_time: endTime,
                quoted_price: totalPrice ? totalPrice : null,
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

        // Insert pets into appointment_pets
        try {
            await insertAppointmentPets(newAppt.id)
        } catch (petsErr) {
            setError(petsErr.message)
            setSaving(false)
            return
        }

        // If notes were entered at booking, also save to notes table for paper trail (one per pet)
        if (form.service_notes && form.service_notes.trim() && newAppt) {
            var noteRows = petsInBooking.map(function (p) {
                return {
                    pet_id: p.pet_id,
                    client_id: form.client_id,
                    appointment_id: newAppt.id,
                    groomer_id: user.id,
                    note_type: 'booking',
                    content: form.service_notes.trim()
                }
            })
            await supabase.from('notes').insert(noteRows)
        }

        // Send email notification if booking has pending flags
        if (hasFlags && flagStatus === 'pending') {
            try {
                const selectedPet = filteredPets.find(p => p.id === firstPet.pet_id)
                const selectedClient = clients.find(c => c.id === form.client_id)
                const selectedService = services.find(s => s.id === firstPet.service_id)

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
                const selectedPetSms = filteredPets.find(p => p.id === firstPet.pet_id)
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
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label>Client *</label>
                        {(function () {
                            var selectedClient = clients.find(function (c) { return c.id === form.client_id })
                            if (selectedClient) {
                                return (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '10px 12px', background: '#f0f9ff',
                                        border: '1px solid #90cdf4', borderRadius: '6px',
                                    }}>
                                        <span style={{ flex: 1, fontWeight: 600, color: '#1e3a8a' }}>
                                            👤 {selectedClient.first_name} {selectedClient.last_name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={function () {
                                                setForm(function (f) { return { ...f, client_id: '' } })
                                                setPetsInBooking([])
                                                setClientSearch('')
                                            }}
                                            style={{
                                                background: '#fff', border: '1px solid #90cdf4',
                                                borderRadius: '4px', padding: '4px 12px',
                                                cursor: 'pointer', fontSize: '13px', color: '#1e3a8a',
                                            }}
                                        >
                                            Change
                                        </button>
                                    </div>
                                )
                            }

                            var q = clientSearch.trim().toLowerCase()
                            // Build unified matches: search BOTH client names AND pet names.
                            // Each entry: { client_id, client, pet (optional if matched via pet) }
                            var matches = []
                            if (q) {
                                var seen = {}
                                // Pass 1: client name matches
                                clients.forEach(function (c) {
                                    var full = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase()
                                    if (full.indexOf(q) !== -1) {
                                        matches.push({ key: 'c-' + c.id, client: c, pet: null })
                                        seen[c.id] = true
                                    }
                                })
                                // Pass 2: pet name matches (include client via pet.client_id)
                                pets.forEach(function (p) {
                                    if (!p.name) return
                                    if (p.name.toLowerCase().indexOf(q) === -1) return
                                    var owner = clients.find(function (c) { return c.id === p.client_id })
                                    if (!owner) return
                                    matches.push({ key: 'p-' + p.id, client: owner, pet: p })
                                })
                                matches = matches.slice(0, 12)
                            }

                            return (
                                <>
                                    <input
                                        type="text"
                                        placeholder="🔍 Search by client OR pet name..."
                                        value={clientSearch}
                                        onChange={function (e) {
                                            setClientSearch(e.target.value)
                                            setShowClientResults(true)
                                        }}
                                        onFocus={function () { setShowClientResults(true) }}
                                        onBlur={function () {
                                            // Small delay so click on result still fires
                                            setTimeout(function () { setShowClientResults(false) }, 150)
                                        }}
                                        autoComplete="off"
                                        style={{ width: '100%' }}
                                    />
                                    {showClientResults && q && matches.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: '#fff', border: '1px solid #dee2e6',
                                            borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                                            maxHeight: '260px', overflowY: 'auto', zIndex: 100,
                                            marginTop: '4px',
                                        }}>
                                            {matches.map(function (m) {
                                                var c = m.client
                                                var p = m.pet
                                                return (
                                                    <div
                                                        key={m.key}
                                                        onMouseDown={function () {
                                                            setForm(function (f) { return { ...f, client_id: c.id } })
                                                            // If matched via pet, auto-add that pet to the booking
                                                            setPetsInBooking(p ? [{ pet_id: p.id }] : [])
                                                            setClientSearch('')
                                                            setShowClientResults(false)
                                                        }}
                                                        style={{
                                                            padding: '10px 14px', cursor: 'pointer',
                                                            borderBottom: '1px solid #f1f3f5', fontSize: '14px',
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                                                        }}
                                                        onMouseEnter={function (e) { e.currentTarget.style.background = '#f8f9fa' }}
                                                        onMouseLeave={function (e) { e.currentTarget.style.background = '#fff' }}
                                                    >
                                                        <span>
                                                            {p ? (
                                                                <>
                                                                    <strong>🐾 {p.name}</strong>
                                                                    <span style={{ color: '#6c757d', marginLeft: '6px' }}>({c.first_name} {c.last_name})</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <strong>{c.first_name} {c.last_name}</strong>
                                                                    <span style={{ color: '#6c757d', marginLeft: '6px' }}>(client)</span>
                                                                </>
                                                            )}
                                                        </span>
                                                        {p && <span style={{ fontSize: '10px', color: '#7c3aed', fontWeight: '700' }}>+ PET PRE-ADDED</span>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {showClientResults && q && matches.length === 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: '#fff', border: '1px solid #dee2e6',
                                            borderRadius: '6px', padding: '10px 14px',
                                            color: '#6c757d', fontSize: '13px', zIndex: 100,
                                            marginTop: '4px',
                                        }}>
                                            No clients or pets match "{clientSearch}"
                                        </div>
                                    )}
                                </>
                            )
                        })()}
                    </div>

                    <div className="form-group">
                        <label>Pets * {petsInBooking.length > 0 && <span style={{ color: '#666', fontWeight: 'normal' }}>({petsInBooking.length} added)</span>}</label>
                        {petsInBooking.length === 0 && (
                            <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#888' }}>
                                {form.client_id ? 'Click + Add Pet to add the first pet' : 'Select a client first'}
                            </p>
                        )}
                        {petsInBooking.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                {petsInBooking.map(function (p, i) {
                                    return (
                                        <div key={i} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            background: '#f6f6f8',
                                            borderRadius: '8px',
                                            border: '1px solid #e5e5ea',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.pet_name}</div>
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                                    {p.service_name || 'No service'} · ${parseFloat(p.quoted_price || 0).toFixed(2)} · {p.time_block_minutes || 60} min
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={function () { removePetFromBooking(i) }}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#c0392b',
                                                    cursor: 'pointer',
                                                    fontSize: '18px',
                                                    padding: '0 4px',
                                                }}
                                                title="Remove pet"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={function () { setShowAddPetModal(true) }}
                            disabled={!form.client_id}
                            style={{
                                padding: '10px 14px',
                                background: form.client_id ? '#0057ff' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '14px',
                                cursor: form.client_id ? 'pointer' : 'not-allowed',
                                width: '100%',
                            }}
                        >
                            + Add Pet
                        </button>
                        {petsInBooking.length > 0 && (
                            <div style={{
                                marginTop: '8px',
                                padding: '10px 12px',
                                background: '#eefaf0',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                            }}>
                                <span>Total:</span>
                                <span>${totalPrice.toFixed(2)}</span>
                            </div>
                        )}
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
                                {/* Task #77 — live date preview with holiday warnings */}
                                {form.appointment_date && (() => {
                                    var dates = computeRecurringDates(form.appointment_date, intervalWeeks, totalCount)
                                    if (dates.length === 0) return null
                                    var holidayHits = dates.filter(function (d) { return isUSHoliday(d.date) }).length
                                    return (
                                        <div className="recurring-preview-list-wrap">
                                            <div className="recurring-preview-list-header">
                                                <span className="recurring-preview-list-title">📅 Preview — all {dates.length} dates</span>
                                                {holidayHits > 0 && (
                                                    <span className="recurring-preview-list-warn">
                                                        ⚠️ {holidayHits} {holidayHits === 1 ? 'date lands' : 'dates land'} on a holiday
                                                    </span>
                                                )}
                                            </div>
                                            <ul className="recurring-preview-list">
                                                {dates.map(function (d) {
                                                    var holiday = isUSHoliday(d.date)
                                                    var cls = 'recurring-preview-item' + (holiday ? ' recurring-preview-item-holiday' : '')
                                                    return (
                                                        <li key={d.sequence} className={cls}>
                                                            <span className="recurring-preview-seq">#{d.sequence}</span>
                                                            <span className="recurring-preview-label">{d.label}</span>
                                                            {holiday && (
                                                                <span className="recurring-preview-holiday-tag">🎉 {holiday}</span>
                                                            )}
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                            {holidayHits > 0 && (
                                                <p className="recurring-preview-tip">
                                                    💡 You can adjust the start date above, or book as-is and move individual dates later from the appointment popup.
                                                </p>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>
                        )}
                    </div>

                    {/* PetPro AI Safety Check Section */}
                    <div className="safety-check-section">
                        <button
                            type="button"
                            className="btn-claude"
                            onClick={runSafetyCheck}
                            disabled={checking || petsInBooking.length === 0}
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
                        {/* Task #38 — "Book Anyway (Override)" hidden for blocked_time conflicts (hard reject) */}
                        {safetyCheck && !safetyCheck.approved && !safetyCheck.blocked_time && (
                            <button type="submit" className="btn-warning" disabled={saving}>
                                {saving ? 'Booking...' : 'Book Anyway (Override)'}
                            </button>
                        )}
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={saving || petsInBooking.length === 0 || (safetyCheck && safetyCheck.blocked_time)}
                            title={safetyCheck && safetyCheck.blocked_time ? 'This time is blocked off — remove the block first' : ''}
                        >
                            {saving
                                ? (isRecurring ? `Booking ${totalCount} appointments...` : 'Booking...')
                                : safetyCheck && safetyCheck.blocked_time
                                    ? '🚫 Remove Block to Book'
                                    : isRecurring
                                        ? `🔄 Book ${totalCount} Appointments`
                                        : safetyCheck && safetyCheck.approved ? 'Book Appointment \u2705' : 'Book Appointment'}
                        </button>
                    </div>
                </form>
            </div>

            {showAddPetModal && (
                <AddPetToBookingModal
                    filteredPets={filteredPets}
                    services={services}
                    petsAlreadyAdded={petsInBooking}
                    onClose={function () { setShowAddPetModal(false) }}
                    onAdd={addPetToBooking}
                />
            )}
        </div>
    )
}

// ══════════ AddPetToBookingModal — Multi-pet support ══════════
// Mini-modal that opens from AddAppointmentModal when user clicks "+ Add Pet".
// Picks one pet + their service + price (auto-fills from service).
function AddPetToBookingModal({ filteredPets, services, petsAlreadyAdded, onClose, onAdd }) {
    const [petId, setPetId] = useState('')
    const [serviceId, setServiceId] = useState('')
    const [price, setPrice] = useState('')
    const [error, setError] = useState(null)

    // Pets that haven't been added yet
    var availablePets = filteredPets.filter(function (p) {
        return !petsAlreadyAdded.some(function (added) { return added.pet_id === p.id })
    })

    // When service changes, auto-fill price
    useEffect(function () {
        if (serviceId) {
            var service = services.find(function (s) { return s.id === serviceId })
            if (service) {
                setPrice(service.price || '')
            }
        }
    }, [serviceId])

    var handleAdd = function () {
        if (!petId) {
            setError('Select a pet.')
            return
        }
        var pet = filteredPets.find(function (p) { return p.id === petId })
        var service = serviceId ? services.find(function (s) { return s.id === serviceId }) : null
        onAdd({
            pet_id: pet.id,
            pet_name: pet.name,
            service_id: service ? service.id : '',
            service_name: service ? service.service_name : '',
            quoted_price: price || (service ? service.price : ''),
            time_block_minutes: service ? service.time_block_minutes : 60,
        })
    }

    return (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
            <div className="modal" style={{ maxWidth: '450px' }} onClick={function (e) { e.stopPropagation() }}>
                <div className="modal-header">
                    <h2>Add Pet to Booking</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div style={{ padding: '0 20px 20px' }}>
                    {availablePets.length === 0 && (
                        <p style={{ color: '#c0392b', marginBottom: '12px' }}>
                            All of this client's pets are already added to the booking.
                        </p>
                    )}

                    <div className="form-group">
                        <label>Pet *</label>
                        <select value={petId} onChange={function (e) { setPetId(e.target.value) }} required>
                            <option value="">Select pet...</option>
                            {availablePets.map(function (p) {
                                return <option key={p.id} value={p.id}>{p.name} ({p.breed})</option>
                            })}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Service</label>
                        <select value={serviceId} onChange={function (e) { setServiceId(e.target.value) }}>
                            <option value="">Select service...</option>
                            {services.map(function (s) {
                                return <option key={s.id} value={s.id}>{s.service_name} - ${s.price}</option>
                            })}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Price ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={function (e) { setPrice(e.target.value) }}
                            placeholder="Auto-fills when you pick a service"
                        />
                    </div>

                    {error && <p className="error">{error}</p>}

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn-primary" onClick={handleAdd} disabled={availablePets.length === 0}>
                            Add Pet
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ══════════ RescheduleModal — Task #26 + #19 (recurring) ══════════
// Non-recurring appointments: simple date/time swap.
// Recurring: 3-option picker — this one / this + following / all client recurring.
// ─────────────────────────────────────────────────────────────────────
// DragDropConfirmModal — "Are you sure you want to move this?"
// Item #6: shown after a drag-and-drop reschedule, so a stray drag
// doesn't silently move an appointment. Staff change is shown too if
// the drop crossed groomer columns.
// ─────────────────────────────────────────────────────────────────────
function DragDropConfirmModal({ dragConfirm, staffMembers, onConfirm, onCancel }) {
    if (!dragConfirm) return null
    const { appt, newDate, newTime, newStaffId, staffIdPassed } = dragConfirm
    const petName = (appt.appointment_pets && appt.appointment_pets.length > 0)
        ? appt.appointment_pets.map(function (ap) { return ap.pets?.name }).filter(Boolean).join(', ')
        : (appt.pets?.name || 'Unknown')
    const clientName = (appt.clients?.first_name || '') + ' ' + (appt.clients?.last_name || '')
    const formatTimeStr = function (t) {
        if (!t) return ''
        const [h, m] = t.split(':').map(Number)
        const period = h >= 12 ? 'pm' : 'am'
        const h12 = h % 12 || 12
        return h12 + ':' + String(m).padStart(2, '0') + ' ' + period
    }
    const oldDate = appt.appointment_date
    const oldTime = appt.start_time ? appt.start_time.slice(0, 5) : ''
    const oldStaffId = appt.staff_id || null
    const oldStaff = (staffMembers || []).find(function (s) { return s.id === oldStaffId })
    const newStaff = (staffMembers || []).find(function (s) { return s.id === newStaffId })
    const oldStaffName = oldStaff ? (oldStaff.first_name + ' ' + (oldStaff.last_name || '')).trim() : 'Unassigned'
    const newStaffName = newStaff ? (newStaff.first_name + ' ' + (newStaff.last_name || '')).trim() : 'Unassigned'
    const isRecurring = !!appt.recurring_series_id
    const staffChanged = staffIdPassed && oldStaffId !== newStaffId
    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: '440px' }} onClick={function (e) { e.stopPropagation() }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Move this appointment?</h3>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', lineHeight: '1.6' }}>
                    <div style={{ fontWeight: '700', marginBottom: '6px' }}>{clientName.trim()} — {petName}</div>
                    <div style={{ color: '#64748b', marginBottom: '10px' }}>Service: {appt.services?.service_name || 'N/A'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 12px' }}>
                        <span style={{ color: '#64748b' }}>From:</span>
                        <span>{oldDate} at {formatTimeStr(oldTime)}{staffChanged ? ' · ' + oldStaffName : ''}</span>
                        <span style={{ color: '#64748b' }}>To:</span>
                        <span style={{ fontWeight: '700', color: '#7c3aed' }}>{newDate} at {formatTimeStr(newTime)}{staffChanged ? ' · ' + newStaffName : ''}</span>
                    </div>
                </div>
                {isRecurring && (
                    <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px' }}>
                        ⚠️ This is a recurring appointment. Only <strong>this one</strong> will be moved — future appointments in the series stay on their original schedule. Use the appointment popup if you need to reschedule the whole series.
                    </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{ padding: '10px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
                    >
                        Yes, move it
                    </button>
                </div>
            </div>
        </div>
    )
}

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

            // Tell parent which scope was used so it can decide whether to
            // fire waitlist auto-notify. Non-recurring or scope='one' counts
            // as a single slot opening; bulk cancels skip waitlist.
            var reportedScope = (!isRecurringAppt || scope === 'one') ? 'one' : scope
            onSaved && onSaved(reportedScope, appt.id)
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

// =====================================================================
// Task #38 — SlotChooserModal
// Tiny popup that appears when Nicole clicks an empty time slot.
// Two big buttons: "📅 Book Appointment" or "🚫 Block Time"
// =====================================================================
function SlotChooserModal({ slot, staff, onBook, onBlock, onClose }) {
    if (!slot) return null
    const { date, hour, staffId } = slot
    const hourLabel = formatHour(hour) + ' ' + formatAmPm(hour)
    const dateLabel = date instanceof Date
        ? `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
        : ''
    const staffMember = staffId ? (staff || []).find(s => s.id === staffId) : null
    const staffLabel = staffMember ? (staffMember.first_name + (staffMember.last_name ? ' ' + staffMember.last_name.charAt(0) + '.' : '')) : 'Any staff'

    var overlay = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }
    var card = {
        background: '#fff', borderRadius: '12px', padding: '28px',
        width: '100%', maxWidth: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    }
    var title = { margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: '#1f2937' }
    var sub = { margin: '0 0 20px', fontSize: '13px', color: '#6b7280' }
    var row = { display: 'flex', gap: '12px' }
    var btnBase = {
        flex: 1, padding: '20px 12px', border: 'none', borderRadius: '10px',
        fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex',
        flexDirection: 'column', alignItems: 'center', gap: '6px',
    }
    var bookBtn = { ...btnBase, background: '#7c3aed', color: '#fff' }
    var blockBtn = { ...btnBase, background: '#9ca3af', color: '#fff' }
    var closeBtn = {
        marginTop: '16px', width: '100%', padding: '10px', border: '1px solid #e5e7eb',
        borderRadius: '8px', background: '#fff', color: '#6b7280', cursor: 'pointer',
        fontSize: '14px',
    }

    return (
        <div style={overlay} onClick={onClose}>
            <div style={card} onClick={(e) => e.stopPropagation()}>
                <h3 style={title}>What would you like to do?</h3>
                <p style={sub}>{dateLabel} · {hourLabel} · {staffLabel}</p>
                <div style={row}>
                    <button style={bookBtn} onClick={onBook}>
                        <span style={{ fontSize: '28px' }}>📅</span>
                        <span>Book Appointment</span>
                    </button>
                    <button style={blockBtn} onClick={onBlock}>
                        <span style={{ fontSize: '28px' }}>🚫</span>
                        <span>Block Time</span>
                    </button>
                </div>
                <button style={closeBtn} onClick={onClose}>Cancel</button>
            </div>
        </div>
    )
}

// =====================================================================
// Task #38 — BlockTimeModal
// Create or edit a gray BLOCKED slot. Fields: staff, date, start, end, note.
// Edit mode also shows a Delete button.
// =====================================================================
function BlockTimeModal({ modal, staff, saving, onSave, onDelete, onClose }) {
    const isEdit = modal && modal.mode === 'edit'
    const existing = (modal && modal.block) || null

    // Initial values — use existing block in edit mode, or slot values in create mode
    var initStaff = isEdit
        ? (existing.staff_id || '')
        : (modal.staffId || '')
    var initDate = isEdit ? existing.block_date : modal.date
    var initStart = isEdit
        ? existing.start_time.slice(0, 5)
        : `${String(modal.hour).padStart(2, '0')}:00`
    var initEnd = isEdit
        ? existing.end_time.slice(0, 5)
        : `${String(modal.hour + 1).padStart(2, '0')}:00`
    var initNote = isEdit ? (existing.note || '') : ''

    var [staffId, setStaffId] = useState(initStaff)
    var [blockDate, setBlockDate] = useState(initDate)
    var [startTime, setStartTime] = useState(initStart)
    var [endTime, setEndTime] = useState(initEnd)
    var [note, setNote] = useState(initNote)
    var [err, setErr] = useState('')

    var handleSubmit = function (e) {
        e.preventDefault()
        setErr('')
        if (!blockDate) { setErr('Pick a date'); return }
        if (!startTime || !endTime) { setErr('Set a start and end time'); return }
        if (endTime <= startTime) { setErr('End time must be after start time'); return }
        onSave({
            staff_id: staffId || null,
            block_date: blockDate,
            start_time: startTime,
            end_time: endTime,
            note: note.trim(),
        })
    }

    // Styles
    var overlay = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }
    var card = {
        background: '#fff', borderRadius: '12px', padding: '28px',
        width: '100%', maxWidth: '460px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
    }
    var title = { margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#1f2937' }
    var sub = { margin: '0 0 20px', fontSize: '13px', color: '#6b7280' }
    var label = {
        display: 'block', fontSize: '13px', fontWeight: 600,
        color: '#374151', marginBottom: '6px', marginTop: '14px',
    }
    var input = {
        width: '100%', padding: '10px 12px', fontSize: '14px',
        border: '1px solid #d1d5db', borderRadius: '8px',
        background: '#fff', color: '#1f2937', boxSizing: 'border-box',
    }
    var errBox = {
        marginTop: '12px', padding: '10px 12px', background: '#fef2f2',
        border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px',
    }
    var btnRow = { display: 'flex', gap: '10px', marginTop: '22px' }
    var saveBtn = {
        flex: 1, padding: '12px', background: '#7c3aed', color: '#fff',
        border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
    }
    var cancelBtn = {
        padding: '12px 16px', background: '#fff', color: '#374151',
        border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px',
        fontWeight: 600, cursor: 'pointer',
    }
    var deleteBtn = {
        marginTop: '10px', width: '100%', padding: '12px', background: '#fff',
        color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px',
        fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
    }

    return (
        <div style={overlay} onClick={onClose}>
            <div style={card} onClick={(e) => e.stopPropagation()}>
                <h3 style={title}>{isEdit ? '🚫 Edit Blocked Time' : '🚫 Block Time'}</h3>
                <p style={sub}>
                    Blocked time stays on your calendar and prevents PetPro AI from auto-booking over it.
                </p>

                <form onSubmit={handleSubmit}>
                    <label style={label}>Staff member</label>
                    <select
                        style={input}
                        value={staffId}
                        onChange={function (e) { setStaffId(e.target.value) }}
                    >
                        <option value="">— My time (owner) —</option>
                        {(staff || []).map(function (s) {
                            return (
                                <option key={s.id} value={s.id}>
                                    {s.first_name} {s.last_name || ''}
                                </option>
                            )
                        })}
                    </select>

                    <label style={label}>Date</label>
                    <input
                        type="date"
                        style={input}
                        value={blockDate}
                        onChange={function (e) { setBlockDate(e.target.value) }}
                    />

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={label}>Start</label>
                            <input
                                type="time"
                                style={input}
                                value={startTime}
                                onChange={function (e) { setStartTime(e.target.value) }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={label}>End</label>
                            <input
                                type="time"
                                style={input}
                                value={endTime}
                                onChange={function (e) { setEndTime(e.target.value) }}
                            />
                        </div>
                    </div>

                    <label style={label}>Note (optional)</label>
                    <input
                        type="text"
                        style={input}
                        value={note}
                        onChange={function (e) { setNote(e.target.value) }}
                        placeholder="e.g. Lunch, Vet appt, School pickup"
                        maxLength={200}
                    />

                    {err && <div style={errBox}>{err}</div>}

                    <div style={btnRow}>
                        <button type="button" style={cancelBtn} onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" style={saveBtn} disabled={saving}>
                            {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Block This Time')}
                        </button>
                    </div>

                    {isEdit && (
                        <button
                            type="button"
                            style={deleteBtn}
                            onClick={onDelete}
                            disabled={saving}
                        >
                            🗑 Remove Block
                        </button>
                    )}
                </form>
            </div>
        </div>
    )
}
