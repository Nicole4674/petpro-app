import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BehaviorTagsRow } from '../components/BehaviorTags'
import { printDailySheet } from '../lib/printDailySheet'
import ReportCardModal from '../components/ReportCardModal'
import { formatPhone } from '../lib/phone'
import { mapsUrl, telUrl } from '../lib/maps'
import '../boarding-styles.css'

export default function BoardingCalendar() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [kennels, setKennels] = useState([])
  const [reservations, setReservations] = useState([])
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [viewMode, setViewMode] = useState('week') // week or day
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [showFilters, setShowFilters] = useState('all') // all, vacant, occupied
  const [showNewReservation, setShowNewReservation] = useState(null) // { kennelId, date } or null
  const [clients, setClients] = useState([])
  const [pets, setPets] = useState([])
  const [selectedReservation, setSelectedReservation] = useState(null) // for kennel card popup
  // Report card modal state — { mode, petId, clientId, petName, petBreed, boardingReservationId, reportCard? }
  const [reportCardModal, setReportCardModal] = useState(null)
  // Map { petId: existingReportCard } for the currently selected reservation
  const [resReportCards, setResReportCards] = useState({})
  const [kennelCardLoading, setKennelCardLoading] = useState(false)
  // ─── Boarding payment state ────────────────────────────────────────────
  // Mirrors the grooming payment flow but linked via boarding_reservation_id.
  // resPayments: array of payment rows for the open kennel card
  // payingRes: when set, opens the "Take Payment" modal
  const [resPayments, setResPayments] = useState([])
  const [payingRes, setPayingRes] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payTip, setPayTip] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  // ─── Saved-card-on-file Stripe charging ─────────────────────────────────
  // When method=card we load the client's saved cards and charge the default
  // through stripe-groomer-charge-boarding. If the client has no card on file,
  // we fall back to manual logging (notes-only) like cash/Zelle/Venmo.
  const [groomerSavedCards, setGroomerSavedCards] = useState([])
  const [selectedSavedCardId, setSelectedSavedCardId] = useState(null)
  const [loadingSavedCards, setLoadingSavedCards] = useState(false)

  // ─── Departure service add-ons ─────────────────────────────────────────
  // Tracks extra services added during a stay (e.g. bath/nail trim before pickup).
  // Each addon bumps the reservation's total_price and is logged separately
  // so it can be removed if added by mistake.
  const [resAddons, setResAddons] = useState([])
  const [services, setServices] = useState([])
  const [showAddAddon, setShowAddAddon] = useState(false)
  const [pendingAddonServiceId, setPendingAddonServiceId] = useState('')
  const [savingAddon, setSavingAddon] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false) // click-to-change status pill

  // ─── Edit Booking modal ────────────────────────────────────────────────
  // Lets you fix dates/times/kennel/price/notes on an existing reservation.
  // Mirrors grooming's reschedule flow but covers more fields since boarding
  // mistakes (wrong day, wrong kennel) are common.
  const [editingReservation, setEditingReservation] = useState(null) // null when closed
  const [editForm, setEditForm] = useState({
    start_date: '', start_time: '', end_date: '', end_time: '',
    kennel_id: '', total_price: '', notes: ''
  })
  const [savingEdit, setSavingEdit] = useState(false)

  const [shopSettings, setShopSettings] = useState(null) // Task #42 — for printed forms
  const [showIntakePicker, setShowIntakePicker] = useState(false) // Task #42
  const [hasLastStay, setHasLastStay] = useState(false) // Task #42
  const [showTopBarPrint, setShowTopBarPrint] = useState(false) // Task #42

  // New reservation form
  const [newRes, setNewRes] = useState({
    client_id: '',
    pet_ids: [],
    start_date: '',
    end_date: '',
    start_time: '08:00',
    end_time: '12:00',
    notes: '',
    // Owner is creating this directly → default to confirmed.
    // Client portal requests should set 'unconfirmed' / 'pending' explicitly.
    status: 'confirmed',
    // Feeding & Care
    feeding_schedule: '',
    special_diet: '',
    medications_notes: '',
    walk_schedule: '',
    playtime_notes: '',
    crate_trained: false,
    // Behavior
    behaviors_with_dogs: '',
    // Contacts & Emergency
    pickup_person: '',
    vet_emergency_contact: '',
    // Extras
    grooming_at_end: false,
    // If grooming_at_end is checked, this holds the picked service id so we
    // can auto-add it as a boarding addon when the reservation saves. Saves
    // the groomer from having to reopen the kennel card to add the service.
    grooming_at_end_service_id: '',
    items_brought: '',
    // Per-night rate — when set, total_price auto-calculates as rate × nights.
    // Groomer thinks in per-night rates ("$50/night"), not totals, so this
    // matches their mental model and updates instantly when dates change.
    per_night_rate: '',
    // Total price for the stay — drives the kennel card balance + payment flow
    total_price: ''
  })
  const [savingRes, setSavingRes] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)

  function getMonday(d) {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(date.setDate(diff))
  }

  function formatDate(d) {
    // Use LOCAL date parts, not UTC. Previously this used toISOString() which
    // shifted dates by 1 day for users in negative-offset timezones (e.g. CST)
    // when viewed in the evening — calendar bars appeared a day early.
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatDateShort(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate()
  }

  function formatDateHeader(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate()
  }

  function getWeekDays() {
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }

  function isToday(d) {
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }

  function goToToday() {
    setWeekStart(getMonday(new Date()))
    setSelectedDay(new Date())
  }

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  function getWeekLabel() {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    if (weekStart.getMonth() === end.getMonth()) {
      return months[weekStart.getMonth()] + ' ' + weekStart.getDate() + ' - ' + end.getDate() + ', ' + weekStart.getFullYear()
    }
    return months[weekStart.getMonth()] + ' ' + weekStart.getDate() + ' - ' + months[end.getMonth()] + ' ' + end.getDate() + ', ' + end.getFullYear()
  }

  useEffect(() => {
    loadData()
  }, [weekStart])

  // Close the status dropdown whenever the kennel card closes or switches reservations
  useEffect(() => {
    if (!selectedReservation) setStatusDropdownOpen(false)
  }, [selectedReservation?.id])

  // Load services list once on mount — used by the Add Departure Service picker
  useEffect(function () {
    let cancelled = false
    ;(async function () {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      var { data } = await supabase
        .from('services')
        .select('id, service_name, price, category')
        .eq('groomer_id', user.id)
        .order('service_name')
      if (!cancelled) setServices(data || [])
    })()
    return function () { cancelled = true }
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load shop settings for printed forms (Task #42)
      const { data: shopData } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('groomer_id', user.id)
        .maybeSingle()
      setShopSettings(shopData || null)

      // Load categories
      const { data: cats } = await supabase
        .from('kennel_categories')
        .select('*')
        .eq('groomer_id', user.id)
        .order('display_order')

      // Load active kennels
      const { data: kens } = await supabase
        .from('kennels')
        .select('*')
        .eq('groomer_id', user.id)
        .eq('is_active', true)
        .order('position')

      // Load reservations for this week range (with buffer)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const { data: res } = await supabase
        .from('boarding_reservations')
        .select(`
          *,
          boarding_reservation_pets (
            pet_id,
            pets:pet_id ( name, breed )
          ),
          clients:client_id ( first_name, last_name, phone )
        `)
        .eq('groomer_id', user.id)
        .neq('status', 'cancelled')
        .lte('start_date', formatDate(weekEnd))
        .gte('end_date', formatDate(weekStart))

      // Load clients for booking form
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone')
        .eq('groomer_id', user.id)
        .order('first_name')

      // Load pets for booking form
      const { data: petData } = await supabase
        .from('pets')
        .select('id, name, breed, weight, client_id')
        .eq('groomer_id', user.id)

      setCategories(cats || [])
      setKennels(kens || [])
      setReservations(res || [])
      setClients(clientData || [])
      setPets(petData || [])
    } catch (err) {
      console.error('Error loading calendar data:', err)
    } finally {
      setLoading(false)
    }
  }

  function getReservationForCell(kennelId, date) {
    const dateStr = formatDate(date)
    return reservations.find(r =>
      r.kennel_id === kennelId &&
      r.start_date <= dateStr &&
      r.end_date >= dateStr
    )
  }

  function isStartDate(res, date) {
    return res.start_date === formatDate(date)
  }

  function isEndDate(res, date) {
    return res.end_date === formatDate(date)
  }

  function getVacancyCount(date) {
    const dateStr = formatDate(date)
    const occupiedKennels = reservations.filter(r =>
      r.start_date <= dateStr && r.end_date >= dateStr
    ).map(r => r.kennel_id)
    const activeKennels = kennels.filter(k => !k.is_under_maintenance)
    const vacant = activeKennels.filter(k => !occupiedKennels.includes(k.id))
    return { vacant: vacant.length, total: activeKennels.length }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'confirmed':   return '#7c3aed'
      case 'checked_in':  return '#16a34a'
      case 'pending':     return '#f59e0b'
      case 'unconfirmed': return '#92400e'
      case 'checked_out': return '#94a3b8'
      case 'cancelled':   return '#dc2626'
      default:            return '#7c3aed'
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'confirmed':   return 'Confirmed'
      case 'checked_in':  return 'Checked In'
      case 'pending':     return 'Pending'
      case 'unconfirmed': return 'Unconfirmed'
      case 'checked_out': return 'Checked Out'
      case 'cancelled':   return 'Cancelled'
      default:            return status
    }
  }

  function getPetNames(res) {
    if (res.boarding_reservation_pets && res.boarding_reservation_pets.length > 0) {
      return res.boarding_reservation_pets
        .map(p => p.pets ? p.pets.name : 'Unknown')
        .join(', ')
    }
    return 'No pet assigned'
  }

  function getClientName(res) {
    if (res.clients) {
      return (res.clients.first_name || '') + ' ' + (res.clients.last_name || '')
    }
    return ''
  }

  function openNewReservation(kennelId, date) {
    setShowNewReservation({ kennelId, date: formatDate(date) })
    setNewRes({
      client_id: '',
      pet_ids: [],
      start_date: formatDate(date),
      end_date: formatDate(date),
      start_time: '08:00',
      end_time: '12:00',
      notes: '',
      status: 'confirmed'
    })
    setClientSearch('')
  }

  function getFilteredClients() {
    if (!clientSearch.trim()) return clients.slice(0, 10).map(c => ({ client: c, matchedPet: null }))
    const search = clientSearch.toLowerCase()
    const results = []
    const seen = {}
    // Match by client name OR phone (phone search is dash-tolerant)
    const searchDigits = search.replace(/[^0-9]/g, '')
    clients.forEach(c => {
      const phoneDigits = (c.phone || '').replace(/[^0-9]/g, '')
      const hit = (c.first_name + ' ' + c.last_name).toLowerCase().includes(search) ||
                  (c.phone || '').includes(search) ||
                  (searchDigits.length >= 3 && phoneDigits.includes(searchDigits))
      if (hit) {
        results.push({ client: c, matchedPet: null })
        seen[c.id] = true
      }
    })
    // Match by pet name — include owner with a badge
    pets.forEach(p => {
      if (!p.name) return
      if (!p.name.toLowerCase().includes(search)) return
      const owner = clients.find(c => c.id === p.client_id)
      if (!owner) return
      results.push({ client: owner, matchedPet: p })
    })
    return results.slice(0, 12)
  }

  function getPetsForClient(clientId) {
    // Active pets only — memorial + archived pets filtered out of booking dropdowns
    return pets.filter(p => p.client_id === clientId && !p.is_memorial && !p.is_archived)
  }

  async function saveReservation() {
    if (!newRes.client_id) { alert('Please select a client'); return }
    if (newRes.pet_ids.length === 0) { alert('Please select at least one pet'); return }
    if (!newRes.start_date || !newRes.end_date) { alert('Please set start and end dates'); return }
    if (newRes.end_date < newRes.start_date) { alert('End date must be after start date'); return }

    setSavingRes(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check for conflicts
      const { data: conflicts } = await supabase
        .from('boarding_reservations')
        .select('id')
        .eq('kennel_id', showNewReservation.kennelId)
        .neq('status', 'cancelled')
        .lte('start_date', newRes.end_date)
        .gte('end_date', newRes.start_date)

      if (conflicts && conflicts.length > 0) {
        alert('This kennel is already booked for some of those dates. Please choose different dates or a different kennel.')
        setSavingRes(false)
        return
      }

      // Create reservation
      const { data: resData, error: resError } = await supabase
        .from('boarding_reservations')
        .insert({
          groomer_id: user.id,
          client_id: newRes.client_id,
          kennel_id: showNewReservation.kennelId,
          start_date: newRes.start_date,
          start_time: newRes.start_time,
          end_date: newRes.end_date,
          end_time: newRes.end_time,
          status: newRes.status,
          notes: newRes.notes,
          // New intake fields (Task #40)
          feeding_schedule: newRes.feeding_schedule || null,
          special_diet: newRes.special_diet || null,
          medications_notes: newRes.medications_notes || null,
          walk_schedule: newRes.walk_schedule || null,
          playtime_notes: newRes.playtime_notes || null,
          crate_trained: newRes.crate_trained,
          behaviors_with_dogs: newRes.behaviors_with_dogs || null,
          pickup_person: newRes.pickup_person || null,
          vet_emergency_contact: newRes.vet_emergency_contact || null,
          grooming_at_end: newRes.grooming_at_end,
          items_brought: newRes.items_brought || null,
          // Total price — manually entered for now. Stored as the source of truth
          // for the kennel card "balance" math.
          total_price: parseFloat(newRes.total_price) || 0,
          created_by: user.id
        })
        .select()
        .single()

      if (resError) throw resError

      // Add pets to reservation
      const petInserts = newRes.pet_ids.map(petId => ({
        reservation_id: resData.id,
        pet_id: petId
      }))

      const { error: petError } = await supabase
        .from('boarding_reservation_pets')
        .insert(petInserts)

      if (petError) throw petError

      // ─── Auto-add the "grooming at end of stay" service as a boarding addon ─
      // If the groomer checked the box AND picked a service, insert the addon
      // row + bump the reservation's total_price so the kennel card shows it
      // immediately. This saves them from having to reopen the kennel card and
      // add the service manually.
      if (newRes.grooming_at_end && newRes.grooming_at_end_service_id) {
        const picked = services.find(s => s.id === newRes.grooming_at_end_service_id)
        if (picked) {
          const price = parseFloat(picked.price || 0)
          const { error: addonErr } = await supabase
            .from('boarding_addons')
            .insert({
              boarding_reservation_id: resData.id,
              service_id: picked.id,
              service_name: picked.service_name,
              quoted_price: price,
              groomer_id: user.id,
            })
          if (addonErr) {
            console.error('Could not add departure service addon:', addonErr)
            alert('Reservation saved, but we could not auto-add the grooming service. You can add it manually from the kennel card.')
          } else if (price > 0) {
            // Bump total_price on the reservation
            const newTotal = parseFloat(newRes.total_price || 0) + price
            await supabase
              .from('boarding_reservations')
              .update({ total_price: newTotal, updated_at: new Date().toISOString() })
              .eq('id', resData.id)
          }
        }
      }

      setShowNewReservation(null)
      await loadData() // Refresh
    } catch (err) {
      console.error('Error saving reservation:', err)
      alert('Error: ' + err.message)
    } finally {
      setSavingRes(false)
    }
  }

  async function openKennelCard(reservation) {
    setKennelCardLoading(true)
    try {
      // Load full reservation details with pet info, client info, welfare logs
      const { data: fullRes } = await supabase
        .from('boarding_reservations')
        .select(`
          *,
          boarding_reservation_pets (
            pet_id,
            pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered, behavior_tags )
          ),
          clients:client_id ( id, first_name, last_name, phone, email, address, preferred_contact, notes ),
          kennels:kennel_id ( name )
        `)
        .eq('id', reservation.id)
        .single()

      // Load welfare logs for this reservation
      const { data: welfareLogs } = await supabase
        .from('welfare_logs')
        .select('*')
        .eq('reservation_id', reservation.id)
        .order('log_date', { ascending: false })

      // Load medication logs
      const { data: medLogs } = await supabase
        .from('medication_logs')
        .select('*')
        .eq('reservation_id', reservation.id)
        .order('given_at', { ascending: false })

      // Load vaccinations for all pets in this reservation
      const petIds = (fullRes?.boarding_reservation_pets || []).map(rp => rp.pet_id)
      let vaccinations = []
      if (petIds.length > 0) {
        const { data: vaxData } = await supabase
          .from('pet_vaccinations')
          .select('*')
          .in('pet_id', petIds)
          .order('expiration_date', { ascending: true })
        vaccinations = vaxData || []
      }

      setSelectedReservation({
        ...fullRes,
        welfare_logs: welfareLogs || [],
        medication_logs: medLogs || [],
        vaccinations: vaccinations
      })

      // Load existing report cards for this reservation (one per pet possible)
      const { data: reportCardsData } = await supabase
        .from('report_cards')
        .select('*')
        .eq('boarding_reservation_id', reservation.id)
      const cardsByPet = {}
      ;(reportCardsData || []).forEach(rc => { cardsByPet[rc.pet_id] = rc })
      setResReportCards(cardsByPet)

      // Load existing payments for this reservation — drives the "paid / balance"
      // display + the payment history list on the kennel card.
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('id, amount, tip_amount, method, notes, created_at')
        .eq('boarding_reservation_id', reservation.id)
        .order('created_at', { ascending: false })
      setResPayments(paymentsData || [])

      // Load departure add-on services (extras added during stay — bath at pickup, nails, etc.)
      const { data: addonsData } = await supabase
        .from('boarding_addons')
        .select('id, service_id, service_name, quoted_price, created_at')
        .eq('boarding_reservation_id', reservation.id)
        .order('created_at', { ascending: false })
      setResAddons(addonsData || [])
    } catch (err) {
      console.error('Error loading kennel card:', err)
    } finally {
      setKennelCardLoading(false)
    }
  }

  // ─── Open the Edit Booking modal pre-filled with current values ──────
  // Also closes the kennel card behind it so only the edit modal shows.
  // Computes the per-night rate from current total/nights so we can
  // auto-bump the total when dates change.
  function openEditReservation(reservation) {
    if (!reservation) return
    const origNights = getNightsBetween(reservation.start_date, reservation.end_date) || 0
    const origTotal = parseFloat(reservation.total_price || 0)
    const perNight = origNights > 0 && origTotal > 0 ? (origTotal / origNights) : 0
    setEditForm({
      start_date: reservation.start_date || '',
      start_time: reservation.start_time || '08:00',
      end_date: reservation.end_date || '',
      end_time: reservation.end_time || '12:00',
      kennel_id: reservation.kennel_id || '',
      total_price: reservation.total_price != null ? String(reservation.total_price) : '',
      notes: reservation.notes || '',
      per_night_rate: perNight // remembered so date changes can auto-bump the total
    })
    setSelectedReservation(null) // close the kennel card popup behind it
    setEditingReservation(reservation)
  }

  // ─── Recalculate total when dates change ─────────────────────────────
  // Uses the per_night_rate. If the groomer manually edits the total,
  // that override sticks until they change dates or the rate.
  function handleEditDateChange(field, value) {
    setEditForm(prev => {
      const next = { ...prev, [field]: value }
      const nights = getNightsBetween(next.start_date, next.end_date)
      if (nights >= 0 && prev.per_night_rate > 0) {
        next.total_price = (prev.per_night_rate * nights).toFixed(2)
      }
      return next
    })
  }

  // ─── User edits the per-night rate directly ──────────────────────────
  // Auto-bumps the total to (rate × current nights). This is what
  // groomers actually want — they think in per-night rates, not totals.
  function handlePerNightRateChange(value) {
    const rate = parseFloat(value) || 0
    setEditForm(prev => {
      const nights = getNightsBetween(prev.start_date, prev.end_date)
      return {
        ...prev,
        per_night_rate: rate,
        total_price: nights >= 0 && rate > 0 ? (rate * nights).toFixed(2) : prev.total_price
      }
    })
  }

  // ─── Close edit modal + reopen the kennel card with the latest data ──
  // Used by both Cancel and Save so the user always lands back on the card.
  async function closeEditAndReopenCard() {
    const id = editingReservation?.id
    setEditingReservation(null)
    if (id) await openKennelCard({ id })
  }

  // ─── Save edits ──────────────────────────────────────────────────────
  // Validates dates, checks for kennel conflicts (excluding the current res),
  // updates the row, then refreshes the kennel card + calendar.
  async function handleSaveEdit() {
    if (!editingReservation) return
    if (!editForm.start_date || !editForm.end_date) {
      alert('Please set both check-in and check-out dates.')
      return
    }
    if (editForm.end_date < editForm.start_date) {
      alert('Check-out date must be on or after check-in date.')
      return
    }
    if (!editForm.kennel_id) {
      alert('Please pick a kennel.')
      return
    }
    setSavingEdit(true)
    try {
      // Conflict check — any other reservation overlapping the new dates
      // in the chosen kennel? (Exclude this reservation's own id.)
      const { data: conflicts } = await supabase
        .from('boarding_reservations')
        .select('id')
        .eq('kennel_id', editForm.kennel_id)
        .neq('status', 'cancelled')
        .neq('id', editingReservation.id)
        .lte('start_date', editForm.end_date)
        .gte('end_date', editForm.start_date)

      if (conflicts && conflicts.length > 0) {
        alert('That kennel is already booked for some of those dates. Pick different dates or a different kennel.')
        setSavingEdit(false)
        return
      }

      const { error } = await supabase
        .from('boarding_reservations')
        .update({
          start_date: editForm.start_date,
          start_time: editForm.start_time || null,
          end_date: editForm.end_date,
          end_time: editForm.end_time || null,
          kennel_id: editForm.kennel_id,
          total_price: parseFloat(editForm.total_price) || 0,
          notes: editForm.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingReservation.id)

      if (error) throw error

      // Close the edit modal and reopen the kennel card with fresh data,
      // then refresh the calendar grid so the move shows up.
      await closeEditAndReopenCard()
      await loadData()
    } catch (err) {
      console.error('Error saving edit:', err)
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  async function updateReservationStatus(resId, newStatus) {
    try {
      const { error } = await supabase
        .from('boarding_reservations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', resId)

      if (error) throw error

      setSelectedReservation(prev => ({ ...prev, status: newStatus }))
      await loadData()
    } catch (err) {
      console.error('Error updating status:', err)
      alert('Error: ' + err.message)
    }
  }

  // ─── Load saved cards on file for this reservation's client ────────────
  // Called when the groomer picks "Card" as the payment method. Uses the
  // existing stripe-list-cards function with body.client_id so the groomer
  // can see THAT client's cards.
  async function loadGroomerSavedCardsForBoarding(res) {
    if (!res || !res.client_id) return
    setLoadingSavedCards(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('stripe-list-cards', {
        body: { client_id: res.client_id }
      })
      if (invokeError) {
        console.warn('Could not load saved cards:', invokeError)
        setGroomerSavedCards([])
        return
      }
      const cards = (data && data.cards) || []
      setGroomerSavedCards(cards)
      const def = cards.find(c => c.is_default) || cards[0]
      if (def) setSelectedSavedCardId(def.id)
    } catch (err) {
      console.warn('Saved cards load error:', err)
      setGroomerSavedCards([])
    } finally {
      setLoadingSavedCards(false)
    }
  }

  // ─── Record a boarding payment ─────────────────────────────────────────
  // Two paths now:
  //   • Stripe path: method = card AND client has a saved card on file →
  //     route through stripe-groomer-charge-boarding to actually charge,
  //     which writes the payment row + fires receipt email.
  //   • Manual path: any other method (cash/zelle/venmo/other) OR card
  //     when client has no saved card → just insert a payments row directly.
  async function handleRecordBoardingPayment() {
    if (!payingRes) return
    if (!payMethod) {
      alert('Pick a payment method (Cash, Zelle, Venmo, Card, or Other).')
      return
    }
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a payment amount greater than 0.')
      return
    }
    const tip = parseFloat(payTip) || 0

    setRecordingPayment(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Debug log so we can see exactly what state is at click time
      console.log('[BoardingPayment]', {
        payMethod,
        selectedSavedCardId,
        groomerSavedCardsCount: groomerSavedCards.length,
        loadingSavedCards,
      })

      // If user picked Card method, we MUST go through Stripe — don't silently
      // fall back to manual logging. If there's no card on file or selection,
      // surface a hard error so the bug isn't hidden.
      if (payMethod === 'card') {
        if (loadingSavedCards) {
          throw new Error('Saved cards are still loading. Please wait a moment and try again.')
        }
        if (!selectedSavedCardId) {
          throw new Error(
            'No card on file for this client. To record card payment as cash/Zelle/Venmo, click a different method. To charge a saved card, the client must first add one in their portal.'
          )
        }
        // ─── STRIPE PATH ───
        const { data, error: invokeError } = await supabase.functions.invoke('stripe-groomer-charge-boarding', {
          body: {
            boarding_reservation_id: payingRes.id,
            payment_method_id: selectedSavedCardId,
            tip_amount: tip,
          }
        })
        // Surface real error message from non-2xx responses
        if (invokeError) {
          let realMsg = invokeError.message || 'Charge failed'
          try {
            if (invokeError.context && typeof invokeError.context.json === 'function') {
              const ebody = await invokeError.context.json()
              if (ebody && ebody.error) realMsg = ebody.error
            }
          } catch { /* ignore */ }
          throw new Error(realMsg)
        }
        if (data && data.error) throw new Error(data.error)
        if (!data || !data.success) throw new Error('Charge did not succeed')
        // stripe-groomer-charge-boarding already wrote the payment row + sent receipt.
      } else {
        // ─── MANUAL PATH ───
        // Cash/Zelle/Venmo/Other only.
        const { error } = await supabase.from('payments').insert({
          boarding_reservation_id: payingRes.id,
          client_id: payingRes.client_id,
          groomer_id: user.id,
          amount: amt,
          tip_amount: tip,
          method: payMethod,
          notes: payNotes || null,
        })
        if (error) throw error
      }

      // Refresh the kennel card so the new payment shows in history + balance updates
      await openKennelCard(selectedReservation)
      // Reset modal state
      setPayingRes(null)
      setPayAmount('')
      setPayMethod('')
      setPayTip('')
      setPayNotes('')
      setGroomerSavedCards([])
      setSelectedSavedCardId(null)
    } catch (err) {
      alert('Error recording payment: ' + (err.message || err))
    } finally {
      setRecordingPayment(false)
    }
  }

  // ─── Add a departure service to the boarding stay ──────────────────────
  // Inserts a row in boarding_addons + bumps the reservation's total_price.
  async function handleAddBoardingAddon() {
    if (!selectedReservation || !pendingAddonServiceId) return
    const service = services.find(s => s.id === pendingAddonServiceId)
    if (!service) return

    setSavingAddon(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const price = parseFloat(service.price || 0)

      // 1. Insert the addon row
      const { error: insErr } = await supabase
        .from('boarding_addons')
        .insert({
          boarding_reservation_id: selectedReservation.id,
          service_id: service.id,
          service_name: service.service_name,
          quoted_price: price,
          groomer_id: user.id,
        })
      if (insErr) throw insErr

      // 2. Bump the reservation's total_price by the addon price
      const newTotal = parseFloat(selectedReservation.total_price || 0) + price
      const { error: updErr } = await supabase
        .from('boarding_reservations')
        .update({ total_price: newTotal, updated_at: new Date().toISOString() })
        .eq('id', selectedReservation.id)
      if (updErr) throw updErr

      // 3. Refresh the kennel card so addon list + total + balance all update
      await openKennelCard({ ...selectedReservation, total_price: newTotal })
      setShowAddAddon(false)
      setPendingAddonServiceId('')
    } catch (err) {
      alert('Error adding service: ' + (err.message || err))
    } finally {
      setSavingAddon(false)
    }
  }

  // ─── Remove an addon (mistake / wrong service) ────────────────────────
  // Deletes the boarding_addons row + decrements total_price.
  async function handleRemoveBoardingAddon(addon) {
    if (!selectedReservation || !addon) return
    if (!window.confirm(`Remove "${addon.service_name}" from this stay?`)) return

    try {
      const { error: delErr } = await supabase
        .from('boarding_addons')
        .delete()
        .eq('id', addon.id)
      if (delErr) throw delErr

      // Subtract from total_price (don't go negative)
      const price = parseFloat(addon.quoted_price || 0)
      const newTotal = Math.max(0, parseFloat(selectedReservation.total_price || 0) - price)
      await supabase
        .from('boarding_reservations')
        .update({ total_price: newTotal, updated_at: new Date().toISOString() })
        .eq('id', selectedReservation.id)

      await openKennelCard({ ...selectedReservation, total_price: newTotal })
    } catch (err) {
      alert('Error removing service: ' + (err.message || err))
    }
  }

  // getDaysBetween — INCLUSIVE day count (24th–27th = 4 days).
  // Used for rendering how many calendar cells a reservation spans.
  function getDaysBetween(start, end) {
    const s = new Date(start)
    const e = new Date(end)
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24))
    return diff + 1
  }

  // getNightsBetween — NIGHTS count for billing (24th–27th = 3 nights).
  // Boarding facilities charge per overnight stay, not per day in the building.
  // Use this anywhere we display "Nights" or compute price.
  function getNightsBetween(start, end) {
    if (!start || !end) return 0
    const s = new Date(start)
    const e = new Date(end)
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  function togglePetSelection(petId) {
    setNewRes(prev => ({
      ...prev,
      pet_ids: prev.pet_ids.includes(petId)
        ? prev.pet_ids.filter(id => id !== petId)
        : [...prev.pet_ids, petId]
    }))
  }

  // ===== WELFARE LOG FORM =====
  const [showWelfareForm, setShowWelfareForm] = useState(false)
  const [savingWelfare, setSavingWelfare] = useState(false)
  const defaultWelfare = {
    log_date: new Date().toISOString().split('T')[0],
    ate_breakfast: null,
    ate_lunch: null,
    ate_dinner: null,
    food_notes: '',
    drank_water: null,
    bowel_movement: '',
    urination: '',
    vomited: false,
    vomit_notes: '',
    behavior: '',
    observations: ''
  }
  const [welfareForm, setWelfareForm] = useState({ ...defaultWelfare })

  function openWelfareForm(petId) {
    setWelfareForm({ ...defaultWelfare, pet_id: petId })
    setShowWelfareForm(true)
  }

  function updateWelfare(field, value) {
    setWelfareForm(prev => ({ ...prev, [field]: value }))
  }

  // Manually change reservation status from the kennel card popup
  async function handleResStatusChange(newStatus) {
    if (!selectedReservation) return
    if (selectedReservation.status === newStatus) {
      setStatusDropdownOpen(false)
      return
    }
    const { error } = await supabase
      .from('boarding_reservations')
      .update({ status: newStatus })
      .eq('id', selectedReservation.id)
    if (error) {
      alert('Error updating status: ' + error.message)
      return
    }
    setSelectedReservation({ ...selectedReservation, status: newStatus })
    setStatusDropdownOpen(false)
    await loadData()
  }

  async function saveWelfareLog() {
    if (!selectedReservation) return
    setSavingWelfare(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('welfare_logs')
        .insert({
          reservation_id: selectedReservation.id,
          pet_id: welfareForm.pet_id,
          log_date: welfareForm.log_date,
          ate_breakfast: welfareForm.ate_breakfast,
          ate_lunch: welfareForm.ate_lunch,
          ate_dinner: welfareForm.ate_dinner,
          food_notes: welfareForm.food_notes || null,
          drank_water: welfareForm.drank_water,
          bowel_movement: welfareForm.bowel_movement || null,
          urination: welfareForm.urination || null,
          vomited: welfareForm.vomited,
          vomit_notes: welfareForm.vomit_notes || null,
          behavior: welfareForm.behavior || null,
          observations: welfareForm.observations || null,
          recorded_by: user.id
        })

      if (error) throw error

      // Refresh the kennel card data so the new log shows up
      await openKennelCard(selectedReservation)
      setShowWelfareForm(false)
    } catch (err) {
      console.error('Error saving welfare log:', err)
      alert('Error: ' + err.message)
    } finally {
      setSavingWelfare(false)
    }
  }

  // ===== VACCINATION FORM =====
  const [showVaxForm, setShowVaxForm] = useState(false)
  const [savingVax, setSavingVax] = useState(false)
  const defaultVax = {
    pet_id: '',
    vaccine_type: '',
    vaccine_name: '',
    administered_date: new Date().toISOString().split('T')[0],
    expiration_date: '',
    vet_clinic: '',
    notes: ''
  }
  const [vaxForm, setVaxForm] = useState({ ...defaultVax })

  function openVaxForm(petId) {
    setVaxForm({ ...defaultVax, pet_id: petId })
    setShowVaxForm(true)
  }

  function updateVax(field, value) {
    setVaxForm(prev => ({ ...prev, [field]: value }))
  }

  function getVaxStatus(expirationDate) {
    if (!expirationDate) return 'unknown'
    const now = new Date()
    const exp = new Date(expirationDate)
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    if (exp < now) return 'expired'
    if (exp - now < thirtyDays) return 'due_soon'
    return 'current'
  }

  function getVaxTypeLabel(type) {
    const labels = {
      rabies: '🏥 Rabies',
      dhpp: '💉 DHPP',
      bordetella: '🫁 Bordetella',
      leptospirosis: '💧 Leptospirosis',
      lyme: '🦠 Lyme',
      canine_influenza: '🤧 Canine Influenza',
      other: '📋 Other'
    }
    return labels[type] || type
  }

  async function saveVaccination() {
    if (!vaxForm.pet_id) { alert('No pet selected'); return }
    if (!vaxForm.vaccine_type) { alert('Please select a vaccine type'); return }
    if (!vaxForm.administered_date) { alert('Please enter administered date'); return }
    if (!vaxForm.expiration_date) { alert('Please enter expiration date'); return }

    setSavingVax(true)
    try {
      const { error } = await supabase
        .from('pet_vaccinations')
        .insert({
          pet_id: vaxForm.pet_id,
          vaccine_type: vaxForm.vaccine_type,
          vaccine_name: vaxForm.vaccine_name || null,
          administered_date: vaxForm.administered_date,
          expiration_date: vaxForm.expiration_date,
          vet_clinic: vaxForm.vet_clinic || null,
          notes: vaxForm.notes || null
        })

      if (error) throw error

      // Refresh kennel card to show new vaccine
      await openKennelCard(selectedReservation)
      setShowVaxForm(false)
    } catch (err) {
      console.error('Error saving vaccination:', err)
      alert('Error: ' + err.message)
    } finally {
      setSavingVax(false)
    }
  }

  async function deleteVaccination(vaxId) {
    if (!confirm('Delete this vaccination record?')) return
    try {
      const { error } = await supabase
        .from('pet_vaccinations')
        .delete()
        .eq('id', vaxId)

      if (error) throw error
      await openKennelCard(selectedReservation)
    } catch (err) {
      console.error('Error deleting vaccination:', err)
      alert('Error: ' + err.message)
    }
  }

  // ===== PRINT KENNEL CARD =====
  const [showPrintPicker, setShowPrintPicker] = useState(false)

  function printKennelCard(size) {
    if (!selectedReservation) return
    const res = selectedReservation
    const pets = (res.boarding_reservation_pets || []).map(rp => rp.pets).filter(Boolean)
    const client = res.clients || {}
    const petVax = res.vaccinations || []
    const welfareLogs = res.welfare_logs || []
    const isClipboard = size === 'clipboard'

    const petSections = pets.map(pet => {
      const thisVax = petVax.filter(v => v.pet_id === pet.id)
      const vaxRows = thisVax.map(v => {
        const exp = new Date(v.expiration_date)
        const now = new Date()
        const status = exp < now ? 'EXPIRED' : (exp - now < 30*24*60*60*1000) ? 'DUE SOON' : 'Current'
        const color = status === 'EXPIRED' ? '#dc2626' : status === 'DUE SOON' ? '#d97706' : '#16a34a'
        return '<tr><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">' + (v.vaccine_type || '').replace('_',' ').toUpperCase() + (v.vaccine_name ? ' (' + v.vaccine_name + ')' : '') + '</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">' + v.administered_date + '</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">' + v.expiration_date + '</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;color:' + color + ';font-weight:700;">' + status + '</td></tr>'
      }).join('')

      return `
        <div style="margin-bottom:16px;${isClipboard ? '' : 'font-size:11px;'}">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div style="width:${isClipboard ? '48' : '36'}px;height:${isClipboard ? '48' : '36'}px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;display:flex;align-items:center;justify-content:center;font-size:${isClipboard ? '22' : '16'}px;font-weight:700;">${pet.name ? pet.name.charAt(0).toUpperCase() : '?'}</div>
            <div>
              <div style="font-size:${isClipboard ? '22' : '16'}px;font-weight:800;color:#1e293b;">${pet.name || 'Unknown'}</div>
              <div style="font-size:${isClipboard ? '14' : '11'}px;color:#64748b;">${pet.breed || ''} ${pet.weight ? '· ' + pet.weight + ' lbs' : ''} ${pet.age ? '· ' + pet.age : ''} ${pet.sex ? '· ' + pet.sex : ''}</div>
              <div style="margin-top:4px;">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:${pet.is_spayed_neutered ? '#dcfce7;color:#16a34a' : '#fef3c7;color:#d97706'}">${pet.is_spayed_neutered ? 'Spayed/Neutered' : 'Intact'}</span>
              </div>
            </div>
          </div>
          ${pet.allergies ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;margin-bottom:8px;"><strong style="color:#dc2626;">⚠️ ALLERGIES:</strong> <span style="color:#374151;">' + pet.allergies + '</span></div>' : ''}
          ${pet.medications ? '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin-bottom:8px;"><strong style="color:#1d4ed8;">💊 MEDICATIONS:</strong> <span style="color:#374151;">' + pet.medications + '</span></div>' : ''}
          ${thisVax.length > 0 ? '<div style="margin-top:8px;"><div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:4px;">💉 VACCINATIONS</div><table style="width:100%;border-collapse:collapse;font-size:' + (isClipboard ? '12' : '10') + 'px;"><tr style="background:#f1f5f9;"><th style="padding:4px 8px;text-align:left;">Vaccine</th><th style="padding:4px 8px;text-align:left;">Given</th><th style="padding:4px 8px;text-align:left;">Expires</th><th style="padding:4px 8px;text-align:left;">Status</th></tr>' + vaxRows + '</table></div>' : '<div style="color:#94a3b8;font-size:12px;margin-top:6px;">No vaccination records on file.</div>'}
        </div>
      `
    }).join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;">')

    const welfareSection = isClipboard ? (welfareLogs.length > 0 ?
      '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;">📋 WELFARE LOG HISTORY</div>' +
      welfareLogs.map(log => `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:12px;">
          <strong style="color:#7c3aed;">${log.log_date}</strong><br>
          Bkfst: ${log.ate_breakfast ? '✅' : log.ate_breakfast === false ? '❌' : '—'}
          Lunch: ${log.ate_lunch ? '✅' : log.ate_lunch === false ? '❌' : '—'}
          Dinner: ${log.ate_dinner ? '✅' : log.ate_dinner === false ? '❌' : '—'}
          Water: ${log.drank_water ? '✅' : log.drank_water === false ? '❌' : '—'}
          BM: ${log.bowel_movement || '—'}
          Pee: ${log.urination || '—'}
          Vomit: ${log.vomited ? '🟡 Yes' : '✅ No'}
          ${log.behavior ? '| Behavior: <strong>' + log.behavior + '</strong>' : ''}
          ${log.observations ? '<br><em style="color:#64748b;">' + log.observations + '</em>' : ''}
        </div>
      `).join('') + '</div>'
    : '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;">📋 DAILY WELFARE CHECKS</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;"><th style="padding:4px;border:1px solid #d1d5db;">Date</th><th style="padding:4px;border:1px solid #d1d5db;">Bkfst</th><th style="padding:4px;border:1px solid #d1d5db;">Lunch</th><th style="padding:4px;border:1px solid #d1d5db;">Dinner</th><th style="padding:4px;border:1px solid #d1d5db;">Water</th><th style="padding:4px;border:1px solid #d1d5db;">BM</th><th style="padding:4px;border:1px solid #d1d5db;">Pee</th><th style="padding:4px;border:1px solid #d1d5db;">Vomit</th><th style="padding:4px;border:1px solid #d1d5db;">Notes</th></tr>' +
      Array.from({ length: getDaysBetween(res.start_date, res.end_date) }, (_, i) => {
        const d = new Date(res.start_date); d.setDate(d.getDate() + i)
        return '<tr><td style="padding:4px;border:1px solid #d1d5db;">' + formatDate(d) + '</td>' + '<td style="padding:4px;border:1px solid #d1d5db;"></td>'.repeat(7) + '<td style="padding:4px;border:1px solid #d1d5db;"></td></tr>'
      }).join('') +
      '</table></div>')
    : ''

    const blankWelfareTable =
      '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;">✍️ DAILY WELFARE CHECKS (Handwritten)</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:' + (isClipboard ? '12' : '11') + 'px;"><tr style="background:#f1f5f9;"><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Date</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Bkfst</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Lunch</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Dinner</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Water</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">BM</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Pee</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Vomit</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Behavior / Notes</th></tr>' +
      Array.from({ length: Math.max(getDaysBetween(res.start_date, res.end_date), 3) }, (_, i) => {
        const d = new Date(res.start_date); d.setDate(d.getDate() + i)
        return '<tr><td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;font-size:' + (isClipboard ? '11' : '10') + 'px;">' + formatDate(d) + '</td>' + ('<td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;height:' + (isClipboard ? '28' : '20') + 'px;"></td>').repeat(7) + '<td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;min-width:80px;"></td></tr>'
      }).join('') +
      '</table></div>'

    const html = `<!DOCTYPE html>
<html><head><title>Kennel Card - ${pets.map(p => p.name).join(', ')}</title>
<style>
  @media print { body { margin: 0; } @page { size: ${isClipboard ? 'letter' : 'letter'}; margin: ${isClipboard ? '0.5in' : '0.3in'}; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; max-width: ${isClipboard ? '8in' : '8in'}; margin: 0 auto; padding: ${isClipboard ? '20px' : '12px'}; ${!isClipboard ? 'font-size:11px;' : ''} }
  .header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: linear-gradient(135deg, #7c3aed, #6d28d9); border-radius: 10px; color: white; margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: ${isClipboard ? '22px' : '16px'}; }
  .header .badge { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .stay-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; text-align: center; }
  .stay-label { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
  .stay-value { font-size: ${isClipboard ? '14px' : '12px'}; font-weight: 700; color: #1e293b; }
  .section-title { font-size: 12px; font-weight: 700; color: #7c3aed; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
  .owner-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .owner-name { font-size: ${isClipboard ? '16px' : '13px'}; font-weight: 700; margin-bottom: 4px; }
  .owner-detail { font-size: ${isClipboard ? '14px' : '11px'}; color: #475569; margin-bottom: 2px; }
  .notes-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
  .paw-footer { text-align: center; margin-top: 20px; color: #c4b5fd; font-size: 24px; }
</style></head><body>
  <div class="header">
    <h1>🐾 Kennel Card</h1>
    <span class="badge">${res.kennels?.name || 'Unknown'}</span>
  </div>
  <div class="stay-grid">
    <div><div class="stay-label">📍 Kennel</div><div class="stay-value">${res.kennels?.name || ''}</div></div>
    <div><div class="stay-label">📅 Check-In</div><div class="stay-value">${res.start_date} ${res.start_time || ''}</div></div>
    <div><div class="stay-label">📅 Check-Out</div><div class="stay-value">${res.end_date} ${res.end_time || ''}</div></div>
    <div><div class="stay-label">🌙 Nights</div><div class="stay-value">${getNightsBetween(res.start_date, res.end_date)}</div></div>
  </div>
  ${petSections}
  <div style="margin-top:16px;">
    <div class="section-title">👤 Owner Contact</div>
    <div class="owner-box">
      <div class="owner-name">${client.first_name || ''} ${client.last_name || ''}</div>
      ${client.phone ? '<div class="owner-detail">📱 ' + formatPhone(client.phone) + '</div>' : ''}
      ${client.email ? '<div class="owner-detail">📧 ' + client.email + '</div>' : ''}
      ${client.address ? '<div class="owner-detail">📍 ' + client.address + '</div>' : ''}
      ${client.preferred_contact ? '<div class="owner-detail">Prefers: <strong>' + client.preferred_contact + '</strong></div>' : ''}
      ${client.notes ? '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">' + client.notes + '</div>' : ''}
    </div>
  </div>
  ${res.notes ? '<div class="notes-box"><strong>📝 Stay Notes:</strong> ' + res.notes + '</div>' : ''}
  ${isClipboard ? welfareSection + blankWelfareTable : blankWelfareTable}
  <div class="paw-footer">🐾 🐾 🐾 PetPro 🐾 🐾 🐾</div>
</body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 500)
    setShowPrintPicker(false)
  }

  // ═══════════════════════════════════════════════════════════════
  // Task #42 — Smart Printable Check-In Form
  // ═══════════════════════════════════════════════════════════════
  async function printCheckInForm(mode) {
    // mode: 'filled' | 'blank' | 'last_stay'
    const shop = shopSettings || {}
    const brandColor = shop.primary_color || '#7c3aed'

    // Source reservation (what to fill fields from)
    var sourceRes = null
    var pets = []
    var client = {}
    var headerDates = { start: '', end: '' }

    if (selectedReservation) {
      headerDates.start = selectedReservation.start_date || ''
      headerDates.end = selectedReservation.end_date || ''
      pets = (selectedReservation.boarding_reservation_pets || []).map(rp => rp.pets).filter(Boolean)
      client = selectedReservation.clients || {}

      if (mode === 'filled') {
        sourceRes = selectedReservation
      } else if (mode === 'last_stay') {
        // Fetch previous reservation for this client (before current one)
        try {
          const { data: prev } = await supabase
            .from('boarding_reservations')
            .select('*')
            .eq('client_id', selectedReservation.client_id)
            .neq('id', selectedReservation.id)
            .lt('start_date', selectedReservation.start_date)
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle()
          sourceRes = prev || null
        } catch (err) {
          console.error('Fetch last stay failed:', err)
        }
      }
      // mode === 'blank' — leave sourceRes null
    }

    const petNames = pets.length > 0 ? pets.map(p => p.name).join(', ') : ''
    const ownerName = client.first_name ? (client.first_name + ' ' + (client.last_name || '')) : ''
    const field = (val) => (val ? val : '')
    const blank = (val) => (val && sourceRes ? val : '')

    // Logo HTML
    const logoHtml = shop.logo_url
      ? `<img src="${shop.logo_url}" alt="Logo" style="max-height:60px;max-width:140px;object-fit:contain;" />`
      : `<div style="font-size:42px;">🏪</div>`

    const shopHeaderHtml = `
      <div style="display:flex;align-items:center;gap:16px;padding:14px 18px;border-bottom:3px solid ${brandColor};margin-bottom:16px;">
        ${logoHtml}
        <div style="flex:1;">
          <div style="font-size:22px;font-weight:800;color:${brandColor};">${field(shop.shop_name) || 'Your Shop Name'}</div>
          ${shop.tagline ? `<div style="font-size:11px;color:#64748b;font-style:italic;">${shop.tagline}</div>` : ''}
          <div style="font-size:10px;color:#475569;margin-top:4px;">
            ${shop.phone ? '📱 ' + formatPhone(shop.phone) : ''}
            ${shop.email ? ' &nbsp; ✉️ ' + shop.email : ''}
            ${shop.website ? ' &nbsp; 🌐 ' + shop.website : ''}
          </div>
          ${shop.address ? `<div style="font-size:10px;color:#475569;">📍 ${shop.address}</div>` : ''}
        </div>
      </div>
    `

    // Blank-line style for unfilled fields
    const line = (val) => val ? `<span style="border-bottom:1px solid #cbd5e1;padding:2px 4px;min-width:200px;display:inline-block;">${val}</span>` : `<span style="border-bottom:1px solid #cbd5e1;padding:2px 4px;min-width:200px;display:inline-block;">&nbsp;</span>`
    const longLine = (val) => val ? `<div style="border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;min-height:34px;font-size:12px;">${val}</div>` : `<div style="border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;min-height:34px;"></div>`
    const cb = (checked) => checked ? '☑' : '☐'

    // Field values — pull from sourceRes if available
    const vFeeding = sourceRes ? sourceRes.feeding_schedule : ''
    const vDiet = sourceRes ? sourceRes.special_diet : ''
    const vMeds = sourceRes ? sourceRes.medications_notes : ''
    const vWalk = sourceRes ? sourceRes.walk_schedule : ''
    const vPlay = sourceRes ? sourceRes.playtime_notes : ''
    const vCrate = sourceRes ? sourceRes.crate_trained : false
    const vBehavior = sourceRes ? sourceRes.behaviors_with_dogs : ''
    const vPickup = sourceRes ? sourceRes.pickup_person : ''
    const vVet = sourceRes ? sourceRes.vet_emergency_contact : ''
    const vGroom = sourceRes ? sourceRes.grooming_at_end : false
    const vItems = sourceRes ? sourceRes.items_brought : ''

    const modeBanner = {
      filled: '<div style="background:#d1fae5;border:1px solid #10b981;border-radius:6px;padding:6px 10px;margin-bottom:12px;font-size:11px;color:#065f46;font-weight:600;">📋 This is a copy of the filled intake form on file.</div>',
      blank: '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:6px 10px;margin-bottom:12px;font-size:11px;color:#92400e;font-weight:600;">✍️ Please fill out this form completely.</div>',
      last_stay: sourceRes
        ? '<div style="background:#dbeafe;border:1px solid #3b82f6;border-radius:6px;padding:6px 10px;margin-bottom:12px;font-size:11px;color:#1e40af;font-weight:600;">🔄 Pre-filled from last stay. Please review & update anything that changed.</div>'
        : '<div style="background:#fee2e2;border:1px solid #ef4444;border-radius:6px;padding:6px 10px;margin-bottom:12px;font-size:11px;color:#991b1b;font-weight:600;">⚠️ No previous stay found — please fill out fully.</div>'
    }[mode] || ''

    const html = `<!DOCTYPE html>
<html><head><title>Check-In Form${petNames ? ' - ' + petNames : ''}</title>
<style>
  @media print { body { margin: 0; } @page { size: letter; margin: 0.4in; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; max-width: 8in; margin: 0 auto; padding: 12px; font-size: 12px; }
  h2 { color: ${brandColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .row { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .field { flex: 1; min-width: 200px; }
  .field-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
  .checkbox-row { font-size: 13px; margin: 6px 0; }
  .sig-line { border-top: 1px solid #333; width: 280px; padding-top: 4px; font-size: 10px; color: #64748b; margin-top: 32px; }
</style></head><body>

  ${shopHeaderHtml}

  <div style="text-align:center;margin-bottom:12px;">
    <div style="font-size:20px;font-weight:800;color:#0f172a;">🐾 Boarding Check-In Form</div>
  </div>

  ${modeBanner}

  <!-- Pet & Owner Info -->
  <h2>Pet & Owner</h2>
  <div class="row">
    <div class="field">
      <div class="field-label">Pet Name(s)</div>
      ${line(petNames)}
    </div>
    <div class="field">
      <div class="field-label">Owner Name</div>
      ${line(ownerName)}
    </div>
  </div>
  <div class="row">
    <div class="field">
      <div class="field-label">Owner Phone</div>
      ${line(field(formatPhone(client.phone)))}
    </div>
    <div class="field">
      <div class="field-label">Owner Email</div>
      ${line(field(client.email))}
    </div>
  </div>
  <div class="row">
    <div class="field">
      <div class="field-label">Check-In Date</div>
      ${line(headerDates.start)}
    </div>
    <div class="field">
      <div class="field-label">Check-Out Date</div>
      ${line(headerDates.end)}
    </div>
  </div>

  <!-- Feeding & Care -->
  <h2>🥣 Feeding & Care</h2>
  <div class="field-label">Feeding Schedule (brand, portion, times)</div>
  ${longLine(vFeeding)}
  <div class="field-label" style="margin-top:8px;">Special Diet / Allergies</div>
  ${longLine(vDiet)}
  <div class="field-label" style="margin-top:8px;">Medications (name, dose, time — leave blank if none)</div>
  ${longLine(vMeds)}
  <div class="field-label" style="margin-top:8px;">Walk Schedule</div>
  ${longLine(vWalk)}
  <div class="field-label" style="margin-top:8px;">Playtime Preferences</div>
  ${longLine(vPlay)}
  <div class="checkbox-row">${cb(vCrate)} Crate trained</div>

  <!-- Behavior -->
  <h2>🐕 Behavior</h2>
  <div class="field-label">Behavior with Other Dogs</div>
  ${longLine(vBehavior)}

  <!-- Contacts & Emergency -->
  <h2>📞 Contacts & Emergency</h2>
  <div class="row">
    <div class="field">
      <div class="field-label">Authorized Pickup Person</div>
      ${line(vPickup)}
    </div>
    <div class="field">
      <div class="field-label">Vet / Emergency Contact</div>
      ${line(vVet)}
    </div>
  </div>

  <!-- Extras -->
  <h2>✨ Extras</h2>
  <div class="checkbox-row">${cb(vGroom)} ✂️ Wants grooming at end of stay</div>
  <div class="field-label" style="margin-top:8px;">Items Brought by Owner (leash, bed, toys, food, etc.)</div>
  ${longLine(vItems)}

  <!-- Signature -->
  <div style="margin-top:28px;">
    <div class="sig-line">Owner Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date: ______________</div>
  </div>

  <div style="text-align:center;margin-top:20px;color:${brandColor};font-size:20px;">🐾</div>
  <div style="text-align:center;font-size:9px;color:#94a3b8;margin-top:4px;">Generated by PetPro</div>

</body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 500)
    setShowIntakePicker(false)
    setShowTopBarPrint(false)
  }

  // Check if current client has a previous stay (for "Print from Last Stay" button visibility)
  useEffect(() => {
    if (!selectedReservation) { setHasLastStay(false); return }
    supabase
      .from('boarding_reservations')
      .select('id')
      .eq('client_id', selectedReservation.client_id)
      .neq('id', selectedReservation.id)
      .lt('start_date', selectedReservation.start_date)
      .limit(1)
      .then(({ data }) => setHasLastStay(Array.isArray(data) && data.length > 0))
  }, [selectedReservation])

  if (loading) {
    return (
      <div className="cal-page">
        <div className="boarding-loading">Loading boarding calendar...</div>
      </div>
    )
  }

  if (kennels.length === 0) {
    return (
      <div className="cal-page">
        <div className="kennels-empty">
          <div className="kennels-empty-icon">📅</div>
          <h2>No Kennels Set Up Yet</h2>
          <p>Add kennels first, then you can start booking boarding stays.</p>
          <button className="boarding-btn boarding-btn-primary" onClick={() => window.location.href = '/boarding/kennels'}>
            Set Up Kennels →
          </button>
        </div>
      </div>
    )
  }

  const weekDays = getWeekDays()

  return (
    <div className="cal-page">
      {/* Header */}
      <div className="cal-header">
        <div>
          <h1>📅 Boarding Calendar</h1>
          <p className="cal-header-sub">{getWeekLabel()}</p>
        </div>
        <div className="cal-header-actions">
          <div className="cal-filter-group">
            <button className={'cal-filter-btn' + (showFilters === 'all' ? ' cal-filter-active' : '')}
              onClick={() => setShowFilters('all')}>All</button>
            <button className={'cal-filter-btn' + (showFilters === 'vacant' ? ' cal-filter-active' : '')}
              onClick={() => setShowFilters('vacant')}>Vacant</button>
            <button className={'cal-filter-btn' + (showFilters === 'occupied' ? ' cal-filter-active' : '')}
              onClick={() => setShowFilters('occupied')}>Occupied</button>
          </div>
          {/* Print today's combined daily sheet (grooming + check-ins/outs) */}
          <button
            className="cal-filter-btn"
            style={{ marginLeft: '12px', background: '#fff', color: '#7c3aed', borderColor: '#c4b5fd', fontWeight: '600' }}
            onClick={() => {
              var todayStr = new Date().getFullYear() + '-' +
                String(new Date().getMonth() + 1).padStart(2, '0') + '-' +
                String(new Date().getDate()).padStart(2, '0')
              printDailySheet(todayStr)
            }}
            title="Print today's grooming + boarding schedule for the front desk"
          >
            🖨️ Print Today
          </button>
          {/* Task #42 — Top-bar Print Blank Form button */}
          <button
            className="cal-filter-btn"
            style={{ marginLeft: '12px', background: '#7c3aed', color: '#fff', borderColor: '#7c3aed', fontWeight: '600' }}
            onClick={() => { setSelectedReservation(null); printCheckInForm('blank') }}
            title="Print a fully blank check-in form for a new client or phone booking"
          >
            🖨️ Print Blank Intake
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevWeek}>← Prev</button>
        <button className="cal-nav-btn cal-nav-today" onClick={goToToday}>Today</button>
        <button className="cal-nav-btn" onClick={nextWeek}>Next →</button>
      </div>

      {/* Vacancy Bar */}
      <div className="cal-vacancy-bar">
        <div className="cal-vacancy-label">Vacancy</div>
        {weekDays.map(day => {
          const v = getVacancyCount(day)
          const pct = v.total > 0 ? Math.round((v.vacant / v.total) * 100) : 0
          return (
            <div key={formatDate(day)} className={'cal-vacancy-cell' + (isToday(day) ? ' cal-vacancy-today' : '')}>
              <div className="cal-vacancy-num">{v.vacant}/{v.total}</div>
              <div className="cal-vacancy-pct">{pct}% open</div>
            </div>
          )
        })}
      </div>

      {/* Calendar Grid */}
      <div className="cal-grid">
        {/* Day Headers */}
        <div className="cal-grid-header">
          <div className="cal-grid-corner">Kennel</div>
          {weekDays.map(day => (
            <div key={formatDate(day)} className={'cal-day-header' + (isToday(day) ? ' cal-day-today' : '')}>
              {formatDateHeader(day)}
            </div>
          ))}
        </div>

        {/* Kennel Rows grouped by Category */}
        {categories.map(category => {
          const catKennels = kennels.filter(k => k.category_id === category.id && !k.is_under_maintenance)
          if (catKennels.length === 0) return null

          return (
            <div key={category.id}>
              {/* Category Header Row */}
              <div className="cal-category-row">
                <div className="cal-category-label">
                  {category.name}
                  <span className="cal-category-count">{catKennels.length}</span>
                </div>
                {weekDays.map(day => (
                  <div key={formatDate(day)} className="cal-category-cell"></div>
                ))}
              </div>

              {/* Individual Kennel Rows */}
              {catKennels.map(kennel => {
                // Check filter
                const hasAnyReservation = weekDays.some(d => getReservationForCell(kennel.id, d))
                if (showFilters === 'vacant' && hasAnyReservation) return null
                if (showFilters === 'occupied' && !hasAnyReservation) return null

                return (
                  <div key={kennel.id} className="cal-kennel-row">
                    <div className="cal-kennel-label">
                      <span className="cal-kennel-name">{kennel.name}</span>
                    </div>
                    {weekDays.map(day => {
                      const res = getReservationForCell(kennel.id, day)
                      const isStart = res && isStartDate(res, day)
                      const isEnd = res && isEndDate(res, day)

                      if (res) {
                        // Phase 6 — booking-rule flag pending (AI held it for groomer approval).
                        // Once the dog is actually checked in / out / cancelled, the pre-arrival
                        // AI warning is considered resolved — hide it so the tile isn't cluttered.
                        const isFlaggedPending = res.flag_status === 'pending'
                          && res.status !== 'checked_in'
                          && res.status !== 'checked_out'
                          && res.status !== 'cancelled'
                        return (
                          <div
                            key={formatDate(day)}
                            className={'cal-cell cal-cell-occupied' + (isToday(day) ? ' cal-cell-today' : '')}
                            style={{ borderLeftColor: isStart ? getStatusColor(res.status) : 'transparent', cursor: 'pointer' }}
                            title={getPetNames(res) + ' — ' + getClientName(res) + ' (' + getStatusLabel(res.status) + ')' + (isFlaggedPending ? ' · ⏳ Needs approval' : '') + ' · Click for details'}
                            onClick={() => openKennelCard(res)}
                          >
                            <div className="cal-cell-bar" style={{ background: getStatusColor(res.status) }}>
                              {isStart && (
                                <span className="cal-cell-pet">
                                  {isFlaggedPending && (
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        marginRight: '4px',
                                        padding: '1px 5px',
                                        fontSize: '9px',
                                        fontWeight: 700,
                                        borderRadius: '3px',
                                        background: '#fef3c7',
                                        color: '#78350f',
                                        letterSpacing: '0.3px',
                                        verticalAlign: 'middle',
                                      }}
                                      title="Pending groomer approval"
                                    >
                                      ⏳ PENDING
                                    </span>
                                  )}
                                  {getPetNames(res)}
                                </span>
                              )}
                              {!isStart && isEnd && (
                                <span className="cal-cell-end">◀ out</span>
                              )}
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={formatDate(day)}
                          className={'cal-cell cal-cell-vacant' + (isToday(day) ? ' cal-cell-today' : '')}
                          onClick={() => openNewReservation(kennel.id, day)}
                          title="Click to book"
                        >
                          <span className="cal-cell-plus">+</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <div className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: '#7c3aed' }}></span> Confirmed
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: '#16a34a' }}></span> Checked In
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: '#f59e0b' }}></span> Pending
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: '#94a3b8' }}></span> Checked Out
        </div>
        <div className="cal-legend-item">
          <span className="cal-legend-dot" style={{ background: 'white', border: '1px solid #d1d5db' }}></span> Vacant (click to book)
        </div>
      </div>

      {/* Kennel Card Popup */}
      {/* Report Card modal — created from kennel card */}
      {reportCardModal && (
        <ReportCardModal
          mode={reportCardModal.mode}
          serviceType={reportCardModal.serviceType}
          petId={reportCardModal.petId}
          clientId={reportCardModal.clientId}
          petName={reportCardModal.petName}
          petBreed={reportCardModal.petBreed}
          appointmentId={reportCardModal.appointmentId}
          boardingReservationId={reportCardModal.boardingReservationId}
          reportCard={reportCardModal.reportCard}
          onClose={() => setReportCardModal(null)}
          onSaved={async () => {
            // Refresh kennel card so the button flips to "View Report Card"
            if (selectedReservation) await openKennelCard(selectedReservation)
          }}
        />
      )}

      {selectedReservation && (
        <div className="cal-modal-overlay" onClick={() => setSelectedReservation(null)}>
          <div className="kc-modal" onClick={e => e.stopPropagation()}>
            {/* Header with status badge */}
            <div className="kc-header">
              <div className="kc-header-left">
                <h2>🐾 Kennel Card</h2>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span
                    className="kc-status-badge"
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    style={{
                      background: getStatusColor(selectedReservation.status),
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    title="Click to change status"
                  >
                    {getStatusLabel(selectedReservation.status)} ▾
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
                        minWidth: '180px',
                        overflow: 'hidden',
                      }}
                    >
                      {['unconfirmed', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map((s, idx, arr) => {
                        const isSelected = selectedReservation.status === s
                        return (
                          <div
                            key={s}
                            onClick={() => handleResStatusChange(s)}
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
                              background: getStatusColor(s),
                              flexShrink: 0,
                            }} />
                            <span style={{ flex: 1 }}>{getStatusLabel(s)}</span>
                            {isSelected && <span style={{ color: '#6b7280' }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <button className="cal-modal-close" onClick={() => setSelectedReservation(null)}>✕</button>
            </div>

            {/* PROMINENT QUICK ACTION BAR — Check In / Check Out always visible at top */}
            {selectedReservation.status !== 'cancelled' && selectedReservation.status !== 'checked_out' && (
              <div style={{
                padding: '14px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                {/* Check In — works from ANY pre-arrival state (unconfirmed/pending/confirmed) */}
                {selectedReservation.status !== 'checked_in' && (
                  <button
                    onClick={() => updateReservationStatus(selectedReservation.id, 'checked_in')}
                    style={{
                      flex: '1 1 auto',
                      padding: '14px 18px',
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                      minWidth: '180px',
                    }}
                  >✅ Check In</button>
                )}
                {/* Check Out — only when checked_in */}
                {selectedReservation.status === 'checked_in' && (
                  <button
                    onClick={() => updateReservationStatus(selectedReservation.id, 'checked_out')}
                    style={{
                      flex: '1 1 auto',
                      padding: '14px 18px',
                      background: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '15px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                      minWidth: '180px',
                    }}
                  >🏁 Check Out</button>
                )}
                {/* Confirm — secondary action when still unconfirmed/pending */}
                {(selectedReservation.status === 'unconfirmed' || selectedReservation.status === 'pending') && (
                  <button
                    onClick={() => updateReservationStatus(selectedReservation.id, 'confirmed')}
                    style={{
                      padding: '14px 18px',
                      background: '#fff',
                      color: '#7c3aed',
                      border: '1px solid #c4b5fd',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >✔️ Just Confirm (no check-in yet)</button>
                )}
                {/* Edit Booking — fix dates, times, kennel, total, notes */}
                <button
                  onClick={() => openEditReservation(selectedReservation)}
                  style={{
                    padding: '14px 18px',
                    background: '#fff',
                    color: '#1f2937',
                    border: '1px solid #d1d5db',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                  title="Move dates, change kennel, fix total"
                >✏️ Edit Booking</button>
              </div>
            )}

            <div className="kc-body">
              {/* Kennel & Stay Info Bar */}
              <div className="kc-stay-bar">
                <div className="kc-stay-item">
                  <span className="kc-stay-label">📍 Kennel</span>
                  <span className="kc-stay-value">{selectedReservation.kennels?.name || 'Unknown'}</span>
                </div>
                <div className="kc-stay-item">
                  <span className="kc-stay-label">📅 Check-In</span>
                  <span className="kc-stay-value">{selectedReservation.start_date} {selectedReservation.start_time || ''}</span>
                </div>
                <div className="kc-stay-item">
                  <span className="kc-stay-label">📅 Check-Out</span>
                  <span className="kc-stay-value">{selectedReservation.end_date} {selectedReservation.end_time || ''}</span>
                </div>
                <div className="kc-stay-item">
                  <span className="kc-stay-label">🌙 Nights</span>
                  <span className="kc-stay-value">{getNightsBetween(selectedReservation.start_date, selectedReservation.end_date)}</span>
                </div>
                {/* Money breakdown — total, paid, balance — calculated live from
                    the payments rows linked to this boarding_reservation_id. */}
                {(() => {
                  const total = parseFloat(selectedReservation.total_price || 0)
                  const paid = (resPayments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
                  const balance = total - paid
                  const balanceColor = balance <= 0 ? '#16a34a' : '#dc2626'
                  // If the booking has no total set (e.g. nights = 0 or price not entered),
                  // we hide the misleading "Paid in full" badge and show a neutral
                  // "No price set" pill instead. Prevents the "$0 paid in full" confusion.
                  const hasNoPrice = total <= 0
                  return (
                    <>
                      <div className="kc-stay-item" style={{ background: '#f9fafb' }}>
                        <span className="kc-stay-label">💰 Total</span>
                        <span className="kc-stay-value" style={{ fontWeight: 700 }}>${total.toFixed(2)}</span>
                      </div>
                      <div className="kc-stay-item" style={{ background: '#f0fdf4' }}>
                        <span className="kc-stay-label" style={{ color: '#166534' }}>✓ Paid</span>
                        <span className="kc-stay-value" style={{ color: '#16a34a', fontWeight: 700 }}>${paid.toFixed(2)}</span>
                      </div>
                      {hasNoPrice ? (
                        <div className="kc-stay-item" style={{ background: '#fef9c3', borderLeft: '3px solid #ca8a04' }}>
                          <span className="kc-stay-label" style={{ color: '#854d0e' }}>💡 No price set</span>
                          <span className="kc-stay-value" style={{ color: '#854d0e', fontWeight: 600, fontSize: '12px' }}>
                            Click Edit Booking to add total
                          </span>
                        </div>
                      ) : (
                        <div className="kc-stay-item" style={{ background: balance <= 0 ? '#dcfce7' : '#fef2f2', borderLeft: '3px solid ' + balanceColor }}>
                          <span className="kc-stay-label" style={{ color: balance <= 0 ? '#166534' : '#991b1b' }}>
                            {balance <= 0 ? '🎉 Paid in full' : '⚠️ Balance Due'}
                          </span>
                          <span className="kc-stay-value" style={{ color: balanceColor, fontWeight: 800, fontSize: '15px' }}>
                            ${Math.max(0, balance).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Take Payment button — opens the boarding payment modal */}
              {(() => {
                const total = parseFloat(selectedReservation.total_price || 0)
                const paid = (resPayments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
                const balance = total - paid
                if (balance <= 0) return null
                return (
                  <div style={{ marginTop: '12px', marginBottom: '4px' }}>
                    <button
                      onClick={() => {
                        setPayingRes(selectedReservation)
                        setPayAmount(balance.toFixed(2))
                        setPayMethod('')
                        setPayTip('')
                        setPayNotes('')
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: '#7c3aed',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      💰 Take Payment (${balance.toFixed(2)})
                    </button>
                  </div>
                )
              })()}

              {/* ═══════════════════════════════════════════════════
                  DEPARTURE SERVICES — extras added during/before pickup
                  Each addon increases the total_price of the stay.
                  ═══════════════════════════════════════════════════ */}
              <div className="kc-section" style={{ marginTop: '12px' }}>
                <div className="kc-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>✂️ Departure Services {resAddons.length > 0 ? '(' + resAddons.length + ')' : ''}</span>
                  {!showAddAddon && (
                    <button
                      onClick={() => { setShowAddAddon(true); setPendingAddonServiceId('') }}
                      style={{
                        background: 'transparent',
                        border: '1px dashed #c4b5fd',
                        color: '#6d28d9',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}>
                      + Add Service
                    </button>
                  )}
                </div>

                {/* Inline picker — shows when Add Service is clicked */}
                {showAddAddon && (
                  <div style={{
                    padding: '10px',
                    background: '#faf5ff',
                    border: '1px dashed #c4b5fd',
                    borderRadius: '8px',
                    marginBottom: resAddons.length > 0 ? '8px' : 0,
                  }}>
                    <select
                      value={pendingAddonServiceId}
                      onChange={e => setPendingAddonServiceId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '8px', background: '#fff' }}
                    >
                      <option value="">— Pick a service to add —</option>
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.service_name} — ${parseFloat(s.price || 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={handleAddBoardingAddon}
                        disabled={!pendingAddonServiceId || savingAddon}
                        style={{
                          flex: 1, padding: '8px 12px',
                          background: pendingAddonServiceId && !savingAddon ? '#10b981' : '#d1d5db',
                          color: '#fff', border: 'none', borderRadius: '6px',
                          fontWeight: 600, fontSize: '13px',
                          cursor: pendingAddonServiceId && !savingAddon ? 'pointer' : 'not-allowed',
                        }}>
                        {savingAddon ? 'Adding...' : '✓ Add to stay'}
                      </button>
                      <button
                        onClick={() => { setShowAddAddon(false); setPendingAddonServiceId('') }}
                        disabled={savingAddon}
                        style={{
                          flex: 1, padding: '8px 12px', background: '#fff',
                          color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px',
                          cursor: 'pointer', fontSize: '13px',
                        }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* List of added services */}
                {resAddons.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {resAddons.map(addon => (
                      <div key={addon.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '8px',
                        fontSize: '13px',
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#111827' }}>{addon.service_name}</span>
                          <span style={{ color: '#16a34a', fontWeight: 700, marginLeft: 8 }}>
                            +${parseFloat(addon.quoted_price).toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveBoardingAddon(addon)}
                          title="Remove this service"
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', lineHeight: 1 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (!showAddAddon && (
                  <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', padding: '6px 0' }}>
                    Nothing added yet. Use "+ Add Service" to add a bath, nail trim, or other extra at pickup.
                  </div>
                ))}
              </div>

              {/* Payment history — shows all payments recorded for this stay */}
              {resPayments && resPayments.length > 0 && (
                <div className="kc-section" style={{ marginTop: '12px' }}>
                  <div className="kc-section-title">💳 Payment History ({resPayments.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {resPayments.map(p => (
                      <div key={p.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        fontSize: '13px',
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827' }}>
                            ${parseFloat(p.amount).toFixed(2)}
                            {p.tip_amount && parseFloat(p.tip_amount) > 0 && (
                              <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>
                                + ${parseFloat(p.tip_amount).toFixed(2)} tip
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {p.method}
                          </div>
                          {p.notes && (
                            <div style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic', marginTop: '2px' }}>📝 {p.notes}</div>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pet Section */}
              {selectedReservation.boarding_reservation_pets && selectedReservation.boarding_reservation_pets.map((rp, idx) => {
                const pet = rp.pets
                if (!pet) return null
                return (
                  <div key={idx} className="kc-section kc-pet-section">
                    <div className="kc-section-title">🐕 Pet Profile</div>
                    <div className="kc-pet-identity">
                      <div className="kc-pet-avatar">{pet.name ? pet.name.charAt(0).toUpperCase() : '?'}</div>
                      <div>
                        <div className="kc-pet-name">{pet.name}</div>
                        <div className="kc-pet-details">
                          {pet.breed || 'Unknown breed'}
                          {pet.weight ? ' · ' + pet.weight + ' lbs' : ''}
                          {pet.age ? ' · ' + pet.age : ''}
                          {pet.sex ? ' · ' + pet.sex : ''}
                        </div>
                        <div className="kc-pet-tags">
                          {pet.is_spayed_neutered && <span className="kc-tag kc-tag-green">Spayed/Neutered</span>}
                          {!pet.is_spayed_neutered && <span className="kc-tag kc-tag-yellow">Intact</span>}
                        </div>
                        {/* Behavior warning pills — bites, kennel aggressive, etc. */}
                        {pet.behavior_tags && pet.behavior_tags.length > 0 && (
                          <BehaviorTagsRow tags={pet.behavior_tags} />
                        )}
                      </div>
                    </div>

                    {/* Report Card — visible always; only fully usable after check-out */}
                    {(function () {
                      var existing = resReportCards[pet.id]
                      var canCreate = selectedReservation.status === 'checked_out'
                      return (
                        <div style={{ marginTop: '10px' }}>
                          {existing ? (
                            <button
                              onClick={() => setReportCardModal({
                                mode: 'view',
                                serviceType: 'boarding',
                                petId: pet.id,
                                clientId: selectedReservation.client_id,
                                petName: pet.name,
                                petBreed: pet.breed,
                                boardingReservationId: selectedReservation.id,
                                reportCard: existing,
                              })}
                              style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', width: '100%' }}
                            >📋 View Report Card</button>
                          ) : canCreate ? (
                            <button
                              onClick={() => setReportCardModal({
                                mode: 'new',
                                serviceType: 'boarding',
                                petId: pet.id,
                                clientId: selectedReservation.client_id,
                                petName: pet.name,
                                petBreed: pet.breed,
                                boardingReservationId: selectedReservation.id,
                              })}
                              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', width: '100%' }}
                            >📋 Create Report Card</button>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center' }}>
                              📋 Report card available after check-out
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Health Alerts */}
                    {(pet.allergies || pet.medications) && (
                      <div className="kc-health-alerts">
                        {pet.allergies && (
                          <div className="kc-alert kc-alert-red">
                            <span className="kc-alert-icon">⚠️</span>
                            <div>
                              <div className="kc-alert-title">Allergies</div>
                              <div className="kc-alert-text">{pet.allergies}</div>
                            </div>
                          </div>
                        )}
                        {pet.medications && (
                          <div className="kc-alert kc-alert-blue">
                            <span className="kc-alert-icon">💊</span>
                            <div>
                              <div className="kc-alert-title">Medications</div>
                              <div className="kc-alert-text">{pet.medications}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Vaccination Records */}
                    <div className="kc-vaccines">
                      <div className="kc-section-title-row">
                        <div className="kc-mini-label">💉 Vaccinations</div>
                        <button className="vax-add-btn" onClick={() => openVaxForm(pet.id)}>
                          + Add Vaccine
                        </button>
                      </div>

                      {/* Vaccine Add Form */}
                      {showVaxForm && vaxForm.pet_id === pet.id && (
                        <div className="vax-form">
                          <div className="vax-form-header">
                            <h4>💉 Add Vaccination Record</h4>
                            <button className="wf-form-close" onClick={() => setShowVaxForm(false)}>✕</button>
                          </div>
                          <div className="vax-form-body">
                            <div className="wf-row-2">
                              <div className="wf-field">
                                <label className="wf-label-sm">Vaccine Type *</label>
                                <select className="wf-select" value={vaxForm.vaccine_type}
                                  onChange={e => updateVax('vaccine_type', e.target.value)}>
                                  <option value="">-- Select Type --</option>
                                  <option value="rabies">🏥 Rabies</option>
                                  <option value="dhpp">💉 DHPP (Distemper)</option>
                                  <option value="bordetella">🫁 Bordetella (Kennel Cough)</option>
                                  <option value="leptospirosis">💧 Leptospirosis</option>
                                  <option value="lyme">🦠 Lyme Disease</option>
                                  <option value="canine_influenza">🤧 Canine Influenza</option>
                                  <option value="other">📋 Other</option>
                                </select>
                              </div>
                              <div className="wf-field">
                                <label className="wf-label-sm">Vaccine Name</label>
                                <input type="text" className="wf-input" placeholder="Brand name (optional)"
                                  value={vaxForm.vaccine_name}
                                  onChange={e => updateVax('vaccine_name', e.target.value)} />
                              </div>
                            </div>
                            <div className="wf-row-2">
                              <div className="wf-field">
                                <label className="wf-label-sm">Date Administered *</label>
                                <input type="date" className="wf-input" value={vaxForm.administered_date}
                                  onChange={e => updateVax('administered_date', e.target.value)} />
                              </div>
                              <div className="wf-field">
                                <label className="wf-label-sm">Expiration Date *</label>
                                <input type="date" className="wf-input" value={vaxForm.expiration_date}
                                  onChange={e => updateVax('expiration_date', e.target.value)} />
                              </div>
                            </div>
                            <div className="wf-field">
                              <label className="wf-label-sm">Vet Clinic</label>
                              <input type="text" className="wf-input" placeholder="Name of vet clinic"
                                value={vaxForm.vet_clinic}
                                onChange={e => updateVax('vet_clinic', e.target.value)} />
                            </div>
                            <div className="wf-field">
                              <label className="wf-label-sm">Notes</label>
                              <input type="text" className="wf-input" placeholder="Any notes about this vaccine"
                                value={vaxForm.notes}
                                onChange={e => updateVax('notes', e.target.value)} />
                            </div>
                            <div className="vax-form-actions">
                              <button className="boarding-btn boarding-btn-secondary" onClick={() => setShowVaxForm(false)}>
                                Cancel
                              </button>
                              <button className="boarding-btn boarding-btn-primary" onClick={saveVaccination} disabled={savingVax}>
                                {savingVax ? '💉 Saving...' : '💉 Save Vaccine'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Vaccine List */}
                      {(() => {
                        const petVax = (selectedReservation.vaccinations || []).filter(v => v.pet_id === pet.id)
                        const hasExpired = petVax.some(v => getVaxStatus(v.expiration_date) === 'expired')
                        const hasDueSoon = petVax.some(v => getVaxStatus(v.expiration_date) === 'due_soon')

                        return (
                          <>
                            {/* Overall Status Banner */}
                            {hasExpired && (
                              <div className="vax-banner vax-banner-expired">
                                🚨 <strong>EXPIRED VACCINES</strong> — This pet has one or more expired vaccinations!
                              </div>
                            )}
                            {!hasExpired && hasDueSoon && (
                              <div className="vax-banner vax-banner-warn">
                                ⚠️ <strong>VACCINES DUE SOON</strong> — Expiring within 30 days
                              </div>
                            )}
                            {petVax.length === 0 && (
                              <div className="vax-empty">No vaccination records on file. Click "+ Add Vaccine" to add one.</div>
                            )}

                            {petVax.length > 0 && (
                              <div className="vax-list">
                                {petVax.map(vax => {
                                  const status = getVaxStatus(vax.expiration_date)
                                  return (
                                    <div key={vax.id} className={'vax-card vax-card-' + status}>
                                      <div className="vax-card-top">
                                        <div className="vax-card-type">{getVaxTypeLabel(vax.vaccine_type)}</div>
                                        <span className={'vax-status-badge vax-status-' + status}>
                                          {status === 'current' ? '✅ Current' : status === 'due_soon' ? '⚠️ Due Soon' : status === 'expired' ? '🚨 Expired' : '❓ Unknown'}
                                        </span>
                                      </div>
                                      {vax.vaccine_name && (
                                        <div className="vax-card-name">{vax.vaccine_name}</div>
                                      )}
                                      <div className="vax-card-dates">
                                        <span>Given: {vax.administered_date}</span>
                                        <span className={status === 'expired' ? 'vax-date-expired' : ''}>
                                          Expires: {vax.expiration_date}
                                          {status === 'expired' && ' ❌'}
                                        </span>
                                      </div>
                                      {vax.vet_clinic && (
                                        <div className="vax-card-clinic">🏥 {vax.vet_clinic}</div>
                                      )}
                                      {vax.notes && (
                                        <div className="vax-card-notes">{vax.notes}</div>
                                      )}
                                      <button className="vax-delete-btn" onClick={() => deleteVaccination(vax.id)} title="Delete vaccine record">
                                        🗑️
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}

              {/* Owner Section */}
              {selectedReservation.clients && (
                <div className="kc-section">
                  <div className="kc-section-title">👤 Owner Contact</div>
                  <div className="kc-owner-info">
                    <div className="kc-owner-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{selectedReservation.clients.first_name} {selectedReservation.clients.last_name}</span>
                      <button
                        className="kc-view-profile-btn"
                        onClick={() => navigate(`/clients/${selectedReservation.client_id}`)}
                      >
                        🐾 View Profile
                      </button>
                    </div>
                    <div className="kc-owner-details">
                      {selectedReservation.clients.phone && (
                        <div className="kc-owner-row">
                          <a
                            href={telUrl(selectedReservation.clients.phone)}
                            style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}
                            title="Tap to call"
                          >
                            📱 {formatPhone(selectedReservation.clients.phone)}
                          </a>
                        </div>
                      )}
                      {selectedReservation.clients.email && (
                        <div className="kc-owner-row">
                          <a
                            href={'mailto:' + selectedReservation.clients.email}
                            style={{ color: '#7c3aed', textDecoration: 'none' }}
                            title="Tap to email"
                          >
                            📧 {selectedReservation.clients.email}
                          </a>
                        </div>
                      )}
                      {selectedReservation.clients.address && (
                        <div className="kc-owner-row">
                          <a
                            href={mapsUrl(selectedReservation.clients.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}
                            title="Tap for directions"
                          >
                            📍 {selectedReservation.clients.address}
                          </a>
                        </div>
                      )}
                      {selectedReservation.clients.preferred_contact && (
                        <div className="kc-owner-row">
                          <span className="kc-tag kc-tag-purple">Prefers: {selectedReservation.clients.preferred_contact}</span>
                        </div>
                      )}
                    </div>
                    {selectedReservation.clients.notes && (
                      <div className="kc-owner-notes">
                        <span className="kc-mini-label">Client Notes:</span> {selectedReservation.clients.notes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reservation Notes */}
              {selectedReservation.notes && (
                <div className="kc-section">
                  <div className="kc-section-title">📝 Stay Notes</div>
                  <div className="kc-notes-text">{selectedReservation.notes}</div>
                </div>
              )}

              {/* Intake Info (Task #41) — only shows if at least one field is filled */}
              {(selectedReservation.feeding_schedule || selectedReservation.special_diet ||
                selectedReservation.medications_notes || selectedReservation.walk_schedule ||
                selectedReservation.playtime_notes || selectedReservation.crate_trained ||
                selectedReservation.behaviors_with_dogs || selectedReservation.pickup_person ||
                selectedReservation.vet_emergency_contact || selectedReservation.grooming_at_end ||
                selectedReservation.items_brought) && (
                <div className="kc-section">
                  <div className="kc-section-title">📋 Intake Info</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>

                    {/* Feeding & Care */}
                    {(selectedReservation.feeding_schedule || selectedReservation.special_diet ||
                      selectedReservation.medications_notes || selectedReservation.walk_schedule ||
                      selectedReservation.playtime_notes || selectedReservation.crate_trained) && (
                      <div style={{ background: '#fef3c7', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#92400e', marginBottom: '6px' }}>🥣 Feeding & Care</div>
                        {selectedReservation.feeding_schedule && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>Feeding:</strong> {selectedReservation.feeding_schedule}</div>
                        )}
                        {selectedReservation.special_diet && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>Diet/Allergies:</strong> {selectedReservation.special_diet}</div>
                        )}
                        {selectedReservation.medications_notes && (
                          <div style={{ fontSize: '13px', marginBottom: '4px', color: '#b91c1c' }}><strong>💊 Meds:</strong> {selectedReservation.medications_notes}</div>
                        )}
                        {selectedReservation.walk_schedule && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>Walks:</strong> {selectedReservation.walk_schedule}</div>
                        )}
                        {selectedReservation.playtime_notes && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>Playtime:</strong> {selectedReservation.playtime_notes}</div>
                        )}
                        {selectedReservation.crate_trained && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}>✅ Crate trained</div>
                        )}
                      </div>
                    )}

                    {/* Behavior */}
                    {selectedReservation.behaviors_with_dogs && (
                      <div style={{ background: '#e0f2fe', padding: '10px 12px', borderRadius: '8px', border: '1px solid #38bdf8' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#075985', marginBottom: '6px' }}>🐕 Behavior with Other Dogs</div>
                        <div style={{ fontSize: '13px' }}>{selectedReservation.behaviors_with_dogs}</div>
                      </div>
                    )}

                    {/* Contacts & Emergency */}
                    {(selectedReservation.pickup_person || selectedReservation.vet_emergency_contact) && (
                      <div style={{ background: '#fee2e2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef4444' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#991b1b', marginBottom: '6px' }}>📞 Contacts & Emergency</div>
                        {selectedReservation.pickup_person && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>Pickup:</strong> {selectedReservation.pickup_person}</div>
                        )}
                        {selectedReservation.vet_emergency_contact && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>🏥 Vet:</strong> {selectedReservation.vet_emergency_contact}</div>
                        )}
                      </div>
                    )}

                    {/* Extras */}
                    {(selectedReservation.grooming_at_end || selectedReservation.items_brought) && (
                      <div style={{ background: '#f3e8ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #a855f7' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', color: '#6b21a8', marginBottom: '6px' }}>✨ Extras</div>
                        {selectedReservation.grooming_at_end && (
                          <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: '600' }}>✂️ Wants grooming at end of stay</div>
                        )}
                        {selectedReservation.items_brought && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}><strong>📦 Items brought:</strong> {selectedReservation.items_brought}</div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* Add-ons */}
              {selectedReservation.boarding_addons && selectedReservation.boarding_addons.length > 0 && (
                <div className="kc-section">
                  <div className="kc-section-title">✨ Add-Ons</div>
                  <div className="kc-addons-list">
                    {selectedReservation.boarding_addons.map(addon => (
                      <div key={addon.id} className={'kc-addon-item' + (addon.completed ? ' kc-addon-done' : '')}>
                        <span>{addon.completed ? '✅' : '⬜'}</span>
                        <span className="kc-addon-type">{addon.addon_type}</span>
                        {addon.description && <span className="kc-addon-desc">— {addon.description}</span>}
                        {addon.price && <span className="kc-addon-price">${parseFloat(addon.price).toFixed(2)}</span>}
                        {addon.scheduled_for && <span className="kc-addon-date">{addon.scheduled_for}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Welfare Logs */}
              <div className="kc-section">
                <div className="kc-section-title-row">
                  <div className="kc-section-title">📋 Daily Welfare Log</div>
                  {selectedReservation.status === 'checked_in' && selectedReservation.boarding_reservation_pets && (
                    <button className="wf-add-btn" onClick={() => {
                      const firstPet = selectedReservation.boarding_reservation_pets[0]
                      if (firstPet) openWelfareForm(firstPet.pet_id)
                    }}>
                      🐾 Add Welfare Log
                    </button>
                  )}
                </div>

                {/* Welfare Form */}
                {showWelfareForm && (
                  <div className="wf-form">
                    <div className="wf-form-header">
                      <h3>🐾 New Welfare Check</h3>
                      <button className="wf-form-close" onClick={() => setShowWelfareForm(false)}>✕</button>
                    </div>

                    {/* Pet selector if multiple pets */}
                    {selectedReservation.boarding_reservation_pets && selectedReservation.boarding_reservation_pets.length > 1 && (
                      <div className="wf-field">
                        <label className="wf-label">Pet</label>
                        <select className="wf-select" value={welfareForm.pet_id || ''}
                          onChange={e => updateWelfare('pet_id', e.target.value)}>
                          {selectedReservation.boarding_reservation_pets.map(rp => (
                            <option key={rp.pet_id} value={rp.pet_id}>
                              {rp.pets ? rp.pets.name : 'Unknown'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Date */}
                    <div className="wf-field">
                      <label className="wf-label">📅 Log Date</label>
                      <input type="date" className="wf-input" value={welfareForm.log_date}
                        onChange={e => updateWelfare('log_date', e.target.value)} />
                    </div>

                    {/* Feeding Section */}
                    <div className="wf-section">
                      <div className="wf-section-label">🍽️ Feeding</div>
                      <div className="wf-row-3">
                        <div className="wf-field">
                          <label className="wf-label-sm">Breakfast</label>
                          <select className="wf-select" value={welfareForm.ate_breakfast === null ? '' : String(welfareForm.ate_breakfast)}
                            onChange={e => updateWelfare('ate_breakfast', e.target.value === '' ? null : e.target.value === 'true')}>
                            <option value="">--</option>
                            <option value="true">✅ Ate</option>
                            <option value="false">❌ Didn't Eat</option>
                          </select>
                        </div>
                        <div className="wf-field">
                          <label className="wf-label-sm">Lunch</label>
                          <select className="wf-select" value={welfareForm.ate_lunch === null ? '' : String(welfareForm.ate_lunch)}
                            onChange={e => updateWelfare('ate_lunch', e.target.value === '' ? null : e.target.value === 'true')}>
                            <option value="">--</option>
                            <option value="true">✅ Ate</option>
                            <option value="false">❌ Didn't Eat</option>
                          </select>
                        </div>
                        <div className="wf-field">
                          <label className="wf-label-sm">Dinner</label>
                          <select className="wf-select" value={welfareForm.ate_dinner === null ? '' : String(welfareForm.ate_dinner)}
                            onChange={e => updateWelfare('ate_dinner', e.target.value === '' ? null : e.target.value === 'true')}>
                            <option value="">--</option>
                            <option value="true">✅ Ate</option>
                            <option value="false">❌ Didn't Eat</option>
                          </select>
                        </div>
                      </div>
                      <div className="wf-field">
                        <label className="wf-label-sm">Drank Water</label>
                        <select className="wf-select" value={welfareForm.drank_water === null ? '' : String(welfareForm.drank_water)}
                          onChange={e => updateWelfare('drank_water', e.target.value === '' ? null : e.target.value === 'true')}>
                          <option value="">--</option>
                          <option value="true">✅ Yes</option>
                          <option value="false">❌ No</option>
                        </select>
                      </div>
                      <div className="wf-field">
                        <label className="wf-label-sm">Food Notes</label>
                        <input type="text" className="wf-input" placeholder="Picky eater, ate half, etc."
                          value={welfareForm.food_notes}
                          onChange={e => updateWelfare('food_notes', e.target.value)} />
                      </div>
                    </div>

                    {/* Bathroom Section */}
                    <div className="wf-section">
                      <div className="wf-section-label">🚽 Bathroom</div>
                      <div className="wf-row-2">
                        <div className="wf-field">
                          <label className="wf-label-sm">Bowel Movement</label>
                          <select className="wf-select" value={welfareForm.bowel_movement}
                            onChange={e => updateWelfare('bowel_movement', e.target.value)}>
                            <option value="">-- Select --</option>
                            <option value="normal">✅ Normal</option>
                            <option value="loose">⚠️ Loose</option>
                            <option value="diarrhea">🔴 Diarrhea</option>
                            <option value="none">❌ None</option>
                          </select>
                        </div>
                        <div className="wf-field">
                          <label className="wf-label-sm">Urination</label>
                          <select className="wf-select" value={welfareForm.urination}
                            onChange={e => updateWelfare('urination', e.target.value)}>
                            <option value="">-- Select --</option>
                            <option value="normal">✅ Normal</option>
                            <option value="frequent">⚠️ Frequent</option>
                            <option value="accident">🔴 Accident</option>
                            <option value="none">❌ None</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Vomit Section */}
                    <div className="wf-section">
                      <div className="wf-section-label">🤢 Vomiting</div>
                      <div className="wf-field">
                        <label className="wf-label-sm">Did they vomit?</label>
                        <select className="wf-select" value={String(welfareForm.vomited)}
                          onChange={e => updateWelfare('vomited', e.target.value === 'true')}>
                          <option value="false">✅ No</option>
                          <option value="true">🟡 Yes</option>
                        </select>
                      </div>
                      {welfareForm.vomited && (
                        <div className="wf-field">
                          <label className="wf-label-sm">Vomit Details</label>
                          <input type="text" className="wf-input" placeholder="Color, frequency, after eating, etc."
                            value={welfareForm.vomit_notes}
                            onChange={e => updateWelfare('vomit_notes', e.target.value)} />
                        </div>
                      )}
                    </div>

                    {/* Behavior Section */}
                    <div className="wf-section">
                      <div className="wf-section-label">🧠 Behavior & Mood</div>
                      <div className="wf-field">
                        <label className="wf-label-sm">Behavior</label>
                        <select className="wf-select" value={welfareForm.behavior}
                          onChange={e => updateWelfare('behavior', e.target.value)}>
                          <option value="">-- Select --</option>
                          <option value="happy">😊 Happy</option>
                          <option value="playful">🎾 Playful</option>
                          <option value="normal">🙂 Normal</option>
                          <option value="anxious">😰 Anxious</option>
                          <option value="lethargic">😴 Lethargic</option>
                          <option value="aggressive">😤 Aggressive</option>
                        </select>
                      </div>
                      <div className="wf-field">
                        <label className="wf-label-sm">Observations / Notes</label>
                        <textarea className="wf-textarea" rows={3}
                          placeholder="Any observations about the pet's day — energy level, socialization, anything unusual..."
                          value={welfareForm.observations}
                          onChange={e => updateWelfare('observations', e.target.value)} />
                      </div>
                    </div>

                    {/* Save */}
                    <div className="wf-form-actions">
                      <button className="boarding-btn boarding-btn-secondary" onClick={() => setShowWelfareForm(false)}>
                        Cancel
                      </button>
                      <button className="boarding-btn boarding-btn-primary" onClick={saveWelfareLog} disabled={savingWelfare}>
                        {savingWelfare ? '🐾 Saving...' : '🐾 Save Welfare Log'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing Welfare Log Entries */}
                {selectedReservation.welfare_logs && selectedReservation.welfare_logs.length > 0 ? (
                  <div className="kc-welfare-list">
                    {selectedReservation.welfare_logs.map((log, i) => (
                      <div key={i} className="kc-welfare-entry">
                        <div className="kc-welfare-date">{log.log_date}</div>
                        <div className="kc-welfare-checks">
                          <span className={'kc-check ' + (log.ate_breakfast ? 'kc-check-yes' : log.ate_breakfast === false ? 'kc-check-no' : 'kc-check-na')}>
                            {log.ate_breakfast ? '✅' : log.ate_breakfast === false ? '❌' : '—'} Bkfst
                          </span>
                          <span className={'kc-check ' + (log.ate_lunch ? 'kc-check-yes' : log.ate_lunch === false ? 'kc-check-no' : 'kc-check-na')}>
                            {log.ate_lunch ? '✅' : log.ate_lunch === false ? '❌' : '—'} Lunch
                          </span>
                          <span className={'kc-check ' + (log.ate_dinner ? 'kc-check-yes' : log.ate_dinner === false ? 'kc-check-no' : 'kc-check-na')}>
                            {log.ate_dinner ? '✅' : log.ate_dinner === false ? '❌' : '—'} Dinner
                          </span>
                          <span className={'kc-check ' + (log.drank_water ? 'kc-check-yes' : log.drank_water === false ? 'kc-check-no' : 'kc-check-na')}>
                            {log.drank_water ? '✅' : log.drank_water === false ? '❌' : '—'} Water
                          </span>
                        </div>
                        <div className="kc-welfare-checks" style={{ marginTop: '4px' }}>
                          <span className={'kc-check ' + (
                            log.bowel_movement === 'normal' ? 'kc-check-yes' :
                            log.bowel_movement === 'none' ? 'kc-check-no' :
                            log.bowel_movement ? 'kc-check-warn' : 'kc-check-na'
                          )}>
                            {log.bowel_movement === 'normal' ? '✅' : log.bowel_movement === 'loose' ? '⚠️' : log.bowel_movement === 'diarrhea' ? '🔴' : log.bowel_movement === 'none' ? '❌' : '—'} BM{log.bowel_movement ? ': ' + log.bowel_movement : ''}
                          </span>
                          <span className={'kc-check ' + (
                            log.urination === 'normal' ? 'kc-check-yes' :
                            log.urination === 'none' ? 'kc-check-no' :
                            log.urination ? 'kc-check-warn' : 'kc-check-na'
                          )}>
                            {log.urination === 'normal' ? '✅' : log.urination === 'frequent' ? '⚠️' : log.urination === 'accident' ? '🔴' : log.urination === 'none' ? '❌' : '—'} Pee{log.urination ? ': ' + log.urination : ''}
                          </span>
                          <span className={'kc-check ' + (!log.vomited ? 'kc-check-yes' : 'kc-check-warn')}>
                            {log.vomited ? '🟡 Vomited' : '✅ No Vomit'}
                          </span>
                        </div>
                        {log.behavior && (
                          <div className="kc-welfare-behavior">
                            🧠 Behavior: <span className="kc-welfare-behavior-val">{log.behavior}</span>
                          </div>
                        )}
                        {log.food_notes && (
                          <div className="kc-welfare-notes">🍽️ {log.food_notes}</div>
                        )}
                        {log.vomit_notes && (
                          <div className="kc-welfare-notes">🤢 {log.vomit_notes}</div>
                        )}
                        {log.observations && (
                          <div className="kc-welfare-notes">💬 {log.observations}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="kc-empty-log">No welfare logs yet for this stay.</div>
                )}
              </div>

              {/* Medication Logs */}
              {selectedReservation.medication_logs && selectedReservation.medication_logs.length > 0 && (
                <div className="kc-section">
                  <div className="kc-section-title">💊 Medication Log</div>
                  <div className="kc-med-list">
                    {selectedReservation.medication_logs.map((med, i) => (
                      <div key={i} className="kc-med-entry">
                        <div className="kc-med-name">{med.medication_name}</div>
                        <div className="kc-med-details">
                          {med.dosage && <span>Dose: {med.dosage}</span>}
                          {med.given_at && <span> · Given: {new Date(med.given_at).toLocaleString()}</span>}
                        </div>
                        {med.given_by && <div className="kc-med-by">By: {med.given_by}</div>}
                        {med.notes && <div className="kc-med-notes">{med.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Status Actions + Print */}
            <div className="kc-footer">
              <div className="kc-status-actions">
                {selectedReservation.status === 'confirmed' && (
                  <button className="kc-action-btn kc-action-checkin"
                    onClick={() => updateReservationStatus(selectedReservation.id, 'checked_in')}>
                    ✅ Check In
                  </button>
                )}
                {selectedReservation.status === 'pending' && (
                  <button className="kc-action-btn kc-action-confirm"
                    onClick={() => updateReservationStatus(selectedReservation.id, 'confirmed')}>
                    ✔️ Confirm
                  </button>
                )}
                {selectedReservation.status === 'checked_in' && (
                  <button className="kc-action-btn kc-action-checkout"
                    onClick={() => updateReservationStatus(selectedReservation.id, 'checked_out')}>
                    🏁 Check Out
                  </button>
                )}
                {selectedReservation.status !== 'cancelled' && selectedReservation.status !== 'checked_out' && (
                  <button className="kc-action-btn kc-action-cancel"
                    onClick={() => {
                      if (confirm('Cancel this reservation? This cannot be undone.')) {
                        updateReservationStatus(selectedReservation.id, 'cancelled')
                        setSelectedReservation(null)
                      }
                    }}>
                    ❌ Cancel Reservation
                  </button>
                )}
              </div>
              <div className="kc-footer-right">
                <div className="kc-print-wrapper">
                  <button className="kc-action-btn kc-action-print" onClick={() => setShowPrintPicker(!showPrintPicker)}>
                    🖨️ Print Card
                  </button>
                  {showPrintPicker && (
                    <div className="kc-print-picker">
                      <button className="kc-print-option" onClick={() => printKennelCard('clipboard')}>
                        📋 Clipboard Size
                        <span className="kc-print-desc">Full page · All details + welfare log</span>
                      </button>
                      <button className="kc-print-option" onClick={() => printKennelCard('pocket')}>
                        🗂️ Pocket Size
                        <span className="kc-print-desc">Compact · Blank welfare checkboxes</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Task #42 — Check-In Form print buttons */}
                <div className="kc-print-wrapper">
                  <button className="kc-action-btn kc-action-print" onClick={() => setShowIntakePicker(!showIntakePicker)}>
                    📝 Intake Form
                  </button>
                  {showIntakePicker && (
                    <div className="kc-print-picker">
                      <button className="kc-print-option" onClick={() => printCheckInForm('filled')}>
                        ✅ Print Filled
                        <span className="kc-print-desc">This reservation's data, all filled in</span>
                      </button>
                      <button className="kc-print-option" onClick={() => printCheckInForm('blank')}>
                        ✍️ Print Blank
                        <span className="kc-print-desc">Same pet & dates, empty intake fields</span>
                      </button>
                      {hasLastStay && (
                        <button className="kc-print-option" onClick={() => printCheckInForm('last_stay')}>
                          🔄 Pre-Fill from Last Stay
                          <span className="kc-print-desc">Client reviews what changed — saves time</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button className="boarding-btn boarding-btn-secondary" onClick={() => setSelectedReservation(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for kennel card */}
      {kennelCardLoading && (
        <div className="cal-modal-overlay">
          <div className="kc-loading">
            <div className="kc-loading-spinner">🐾</div>
            <p>Loading kennel card...</p>
          </div>
        </div>
      )}

      {/* New Reservation Modal */}
      {showNewReservation && (
        <div className="cal-modal-overlay" onClick={() => setShowNewReservation(null)}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-header">
              <h2>New Boarding Reservation</h2>
              <button className="cal-modal-close" onClick={() => setShowNewReservation(null)}>✕</button>
            </div>

            <div className="cal-modal-body">
              {/* Kennel info */}
              <div className="cal-modal-kennel-info">
                📍 {kennels.find(k => k.id === showNewReservation.kennelId)?.name || 'Unknown Kennel'}
              </div>

              {/* Client Search — matches by client name/phone OR pet name */}
              <div className="boarding-field">
                <label className="boarding-label">Client *</label>
                <input
                  className="boarding-input"
                  placeholder="Search by client name, phone, OR pet name..."
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setShowClientDropdown(true)
                    setNewRes(prev => ({ ...prev, client_id: '', pet_ids: [] }))
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                />
                {showClientDropdown && (
                  <div className="cal-dropdown">
                    {getFilteredClients().map((result, idx) => {
                      const client = result.client
                      const pet = result.matchedPet
                      return (
                        <div
                          key={(pet ? 'p-' + pet.id : 'c-' + client.id) + '-' + idx}
                          className="cal-dropdown-item"
                          onClick={() => {
                            setNewRes(prev => ({
                              ...prev,
                              client_id: client.id,
                              // If search matched a pet, pre-select that pet in the booking
                              pet_ids: pet ? [pet.id] : [],
                            }))
                            setClientSearch(client.first_name + ' ' + client.last_name)
                            setShowClientDropdown(false)
                          }}
                        >
                          {pet ? (
                            <>
                              <strong>🐾 {pet.name}</strong>
                              <span className="cal-dropdown-sub"> — {client.first_name} {client.last_name}</span>
                              <span style={{ marginLeft: '8px', fontSize: '10px', color: '#7c3aed', fontWeight: '700' }}>+ PET PRE-ADDED</span>
                            </>
                          ) : (
                            <>
                              <strong>{client.first_name} {client.last_name}</strong>
                              {client.phone && <span className="cal-dropdown-sub"> — {formatPhone(client.phone)}</span>}
                            </>
                          )}
                        </div>
                      )
                    })}
                    {getFilteredClients().length === 0 && (
                      <div className="cal-dropdown-empty">No clients or pets found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Pet Selection */}
              {newRes.client_id && (
                <div className="boarding-field" style={{ marginTop: '12px' }}>
                  <label className="boarding-label">Pet(s) *</label>
                  <div className="cal-pet-list">
                    {getPetsForClient(newRes.client_id).map(pet => (
                      <label key={pet.id} className="cal-pet-option">
                        <input
                          type="checkbox"
                          checked={newRes.pet_ids.includes(pet.id)}
                          onChange={() => togglePetSelection(pet.id)}
                        />
                        <span>{pet.name}</span>
                        <span className="cal-pet-breed">{pet.breed} {pet.weight ? '· ' + pet.weight + 'lbs' : ''}</span>
                      </label>
                    ))}
                    {getPetsForClient(newRes.client_id).length === 0 && (
                      <p className="boarding-form-hint">No pets found for this client.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Dates — when either date changes AND per_night_rate is set,
                  we auto-bump total_price to rate × nights so the groomer
                  doesn't have to re-do math. */}
              <div className="boarding-field-row" style={{ marginTop: '12px' }}>
                <div className="boarding-field">
                  <label className="boarding-label">Check-In Date *</label>
                  <input type="date" className="boarding-input"
                    value={newRes.start_date}
                    onChange={e => setNewRes(prev => {
                      const next = { ...prev, start_date: e.target.value }
                      const rate = parseFloat(prev.per_night_rate || 0)
                      const nights = getNightsBetween(next.start_date, next.end_date)
                      if (rate > 0 && nights >= 0) {
                        next.total_price = (rate * nights).toFixed(2)
                      }
                      return next
                    })} />
                </div>
                <div className="boarding-field">
                  <label className="boarding-label">Check-Out Date *</label>
                  <input type="date" className="boarding-input"
                    value={newRes.end_date}
                    onChange={e => setNewRes(prev => {
                      const next = { ...prev, end_date: e.target.value }
                      const rate = parseFloat(prev.per_night_rate || 0)
                      const nights = getNightsBetween(next.start_date, next.end_date)
                      if (rate > 0 && nights >= 0) {
                        next.total_price = (rate * nights).toFixed(2)
                      }
                      return next
                    })} />
                </div>
              </div>

              <div className="boarding-field-row" style={{ marginTop: '12px' }}>
                <div className="boarding-field">
                  <label className="boarding-label">Check-In Time</label>
                  <input type="time" className="boarding-input"
                    value={newRes.start_time}
                    onChange={e => setNewRes(prev => ({ ...prev, start_time: e.target.value }))} />
                </div>
                <div className="boarding-field">
                  <label className="boarding-label">Check-Out Time</label>
                  <input type="time" className="boarding-input"
                    value={newRes.end_time}
                    onChange={e => setNewRes(prev => ({ ...prev, end_time: e.target.value }))} />
                </div>
              </div>

              {/* Per-Night Rate — what the groomer charges per night. When set,
                  Total Price below auto-fills to rate × nights. Optional —
                  groomers can skip this and just type a flat total below. */}
              <div className="boarding-field-row" style={{ marginTop: '12px' }}>
                <div className="boarding-field">
                  <label className="boarding-label">
                    Per-Night Rate
                    <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>(auto-calcs total)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="boarding-input"
                    value={newRes.per_night_rate}
                    onChange={e => setNewRes(prev => {
                      const rate = parseFloat(e.target.value || 0)
                      const nights = getNightsBetween(prev.start_date, prev.end_date)
                      const next = { ...prev, per_night_rate: e.target.value }
                      // If we have valid dates + rate, auto-fill the total.
                      if (rate > 0 && nights >= 0) {
                        next.total_price = (rate * nights).toFixed(2)
                      }
                      return next
                    })}
                    placeholder="e.g. 50.00"
                  />
                </div>
                <div className="boarding-field">
                  <label className="boarding-label">
                    Total Price *
                    {newRes.start_date && newRes.end_date && newRes.end_date >= newRes.start_date && (
                      <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                        ({getNightsBetween(newRes.start_date, newRes.end_date)} night{getNightsBetween(newRes.start_date, newRes.end_date) === 1 ? '' : 's'})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="boarding-input"
                    value={newRes.total_price}
                    onChange={e => setNewRes(prev => ({ ...prev, total_price: e.target.value }))}
                    placeholder="e.g. 200.00"
                  />
                </div>
              </div>
              {/* Helper text under the row — tells the groomer the math is happening */}
              {parseFloat(newRes.per_night_rate || 0) > 0 && newRes.start_date && newRes.end_date && newRes.end_date >= newRes.start_date && (
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>
                  ✓ ${parseFloat(newRes.per_night_rate).toFixed(2)} × {getNightsBetween(newRes.start_date, newRes.end_date)} night{getNightsBetween(newRes.start_date, newRes.end_date) === 1 ? '' : 's'} = ${(parseFloat(newRes.per_night_rate) * getNightsBetween(newRes.start_date, newRes.end_date)).toFixed(2)} (you can override the total above for deposits or discounts)
                </div>
              )}

              {/* Status */}
              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Status</label>
                <select className="boarding-input"
                  value={newRes.status}
                  onChange={e => setNewRes(prev => ({ ...prev, status: e.target.value }))}>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="wait_list">Wait List</option>
                </select>
              </div>

              {/* Notes */}
              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Notes</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.notes}
                  onChange={e => setNewRes(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="General notes, flags, anything worth remembering..." />
              </div>

              {/* ─── Feeding & Care ─── */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e5e7eb', fontWeight: '700', fontSize: '14px', color: '#374151' }}>
                🥣 Feeding & Care
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Feeding Schedule</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.feeding_schedule}
                  onChange={e => setNewRes(prev => ({ ...prev, feeding_schedule: e.target.value }))}
                  placeholder="e.g. 2 cups kibble at 7am and 5pm" />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Special Diet / Allergies</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.special_diet}
                  onChange={e => setNewRes(prev => ({ ...prev, special_diet: e.target.value }))}
                  placeholder="Allergies, sensitive stomach, raw diet, etc." />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Medications</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.medications_notes}
                  onChange={e => setNewRes(prev => ({ ...prev, medications_notes: e.target.value }))}
                  placeholder="Leave blank if none. Otherwise include med name, dose, and time." />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Walk Schedule</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.walk_schedule}
                  onChange={e => setNewRes(prev => ({ ...prev, walk_schedule: e.target.value }))}
                  placeholder="e.g. 3x daily — morning, noon, evening" />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Playtime Preferences</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.playtime_notes}
                  onChange={e => setNewRes(prev => ({ ...prev, playtime_notes: e.target.value }))}
                  placeholder="Loves fetch, nervous around big dogs, etc." />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}>
                  <input
                    type="checkbox"
                    checked={newRes.crate_trained}
                    onChange={e => setNewRes(prev => ({ ...prev, crate_trained: e.target.checked }))}
                  />
                  <span>Crate trained</span>
                </label>
              </div>

              {/* ─── Behavior ─── */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e5e7eb', fontWeight: '700', fontSize: '14px', color: '#374151' }}>
                🐕 Behavior
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Behavior with Other Dogs</label>
                <textarea className="boarding-textarea" rows={2}
                  value={newRes.behaviors_with_dogs}
                  onChange={e => setNewRes(prev => ({ ...prev, behaviors_with_dogs: e.target.value }))}
                  placeholder="Good with others / reactive / shy / prefers solo, etc." />
              </div>

              {/* ─── Contacts & Emergency ─── */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e5e7eb', fontWeight: '700', fontSize: '14px', color: '#374151' }}>
                📞 Contacts & Emergency
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Authorized Pickup Person</label>
                <input type="text" className="boarding-input"
                  value={newRes.pickup_person}
                  onChange={e => setNewRes(prev => ({ ...prev, pickup_person: e.target.value }))}
                  placeholder="Name + phone (if different from owner)" />
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Vet / Emergency Contact</label>
                <input type="text" className="boarding-input"
                  value={newRes.vet_emergency_contact}
                  onChange={e => setNewRes(prev => ({ ...prev, vet_emergency_contact: e.target.value }))}
                  placeholder="Vet name + phone number" />
              </div>

              {/* ─── Extras ─── */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e5e7eb', fontWeight: '700', fontSize: '14px', color: '#374151' }}>
                ✨ Extras
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}>
                  <input
                    type="checkbox"
                    checked={newRes.grooming_at_end}
                    onChange={e => setNewRes(prev => ({
                      ...prev,
                      grooming_at_end: e.target.checked,
                      // Clear the picked service if they uncheck the box
                      grooming_at_end_service_id: e.target.checked ? prev.grooming_at_end_service_id : ''
                    }))}
                  />
                  <span>✂️ Wants grooming at end of stay</span>
                </label>

                {/* Service picker — only when the checkbox is on. Picks one
                    service that gets auto-added as a boarding addon on save. */}
                {newRes.grooming_at_end && (
                  <div style={{ marginTop: '8px', paddingLeft: '24px' }}>
                    <label className="boarding-label" style={{ fontSize: '12px' }}>
                      Pick the service (you can add more later from the kennel card)
                    </label>
                    <select
                      className="boarding-input"
                      value={newRes.grooming_at_end_service_id}
                      onChange={e => setNewRes(prev => ({ ...prev, grooming_at_end_service_id: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Choose a service —</option>
                      {services.map(svc => (
                        <option key={svc.id} value={svc.id}>
                          {svc.service_name} — ${parseFloat(svc.price || 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    {newRes.grooming_at_end_service_id && (() => {
                      const picked = services.find(s => s.id === newRes.grooming_at_end_service_id)
                      if (!picked) return null
                      return (
                        <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>
                          ✓ ${parseFloat(picked.price || 0).toFixed(2)} will be added to the stay total automatically
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="boarding-field" style={{ marginTop: '12px' }}>
                <label className="boarding-label">Items Brought by Owner</label>
                <textarea className="boarding-textarea" rows={3}
                  value={newRes.items_brought}
                  onChange={e => setNewRes(prev => ({ ...prev, items_brought: e.target.value }))}
                  placeholder="Leash, bed, favorite toy, food container, blanket, etc. — list everything so nothing gets lost!" />
              </div>
            </div>

            <div className="cal-modal-footer">
              <button className="boarding-btn boarding-btn-secondary" onClick={() => setShowNewReservation(null)}>
                Cancel
              </button>
              <button className="boarding-btn boarding-btn-primary" onClick={saveReservation} disabled={savingRes}>
                {savingRes ? 'Saving...' : 'Book Reservation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          BOARDING PAYMENT MODAL
          Mirrors the grooming payment modal — cash/zelle/venmo/card,
          optional tip, optional notes. Amount pre-filled with the balance.
          ═══════════════════════════════════════════════════ */}
      {payingRes && (() => {
        const total = parseFloat(payingRes.total_price || 0)
        const paid = (resPayments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
        const balance = total - paid
        return (
          <div
            onClick={() => { if (!recordingPayment) setPayingRes(null) }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)', zIndex: 2000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
          >
            <div onClick={e => e.stopPropagation()} style={{
              background: '#fff', borderRadius: '14px', padding: '24px',
              width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', color: '#111827', fontWeight: 800 }}>💰 Take Payment</h2>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                    Boarding stay · Balance ${balance.toFixed(2)}
                  </div>
                </div>
                <button onClick={() => setPayingRes(null)} disabled={recordingPayment}
                  style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}>×</button>
              </div>

              {/* Quick stat strip */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '10px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Total</div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>${total.toFixed(2)}</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: '#f0fdf4', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#166534', textTransform: 'uppercase' }}>Paid</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>${paid.toFixed(2)}</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: '#fef2f2', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#991b1b', textTransform: 'uppercase' }}>Balance</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#dc2626' }}>${balance.toFixed(2)}</div>
                </div>
              </div>

              {/* Method buttons */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Method <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {['cash', 'zelle', 'venmo', 'card', 'other'].map(m => (
                    <button key={m} onClick={() => {
                      setPayMethod(m)
                      // When the user picks Card, load their saved cards on file
                      // so we can charge via Stripe. Other methods skip this.
                      if (m === 'card') {
                        loadGroomerSavedCardsForBoarding(payingRes)
                      } else {
                        setGroomerSavedCards([])
                        setSelectedSavedCardId(null)
                      }
                    }}
                      style={{
                        padding: '10px 8px',
                        background: payMethod === m ? '#7c3aed' : '#fff',
                        color: payMethod === m ? '#fff' : '#374151',
                        border: '1px solid ' + (payMethod === m ? '#7c3aed' : '#d1d5db'),
                        borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saved cards list — shown only when method=card. Either lists
                  cards on file (and pre-selects the default) or shows a
                  fallback message if the client has no card saved. */}
              {payMethod === 'card' && (
                <div style={{ marginBottom: '14px', padding: '12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Card on file
                  </div>
                  {loadingSavedCards ? (
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Loading saved cards…</div>
                  ) : groomerSavedCards.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#92400e', padding: '8px 10px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px' }}>
                      ⚠️ No card on file for this client. The payment will be logged as a card transaction (no Stripe charge). Ask them to add a card in their portal to enable real card-on-file charges.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {groomerSavedCards.map(card => (
                        <label key={card.id} style={{
                          display: 'flex', alignItems: 'center', padding: '10px 12px',
                          border: '2px solid ' + (selectedSavedCardId === card.id ? '#7c3aed' : '#e5e7eb'),
                          background: selectedSavedCardId === card.id ? '#f5f3ff' : '#fff',
                          borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                        }}>
                          <input type="radio" name="boardingCard" checked={selectedSavedCardId === card.id}
                            onChange={() => setSelectedSavedCardId(card.id)}
                            style={{ marginRight: '10px' }} />
                          <span style={{ flex: 1, fontWeight: 700 }}>
                            {(card.brand || 'Card').charAt(0).toUpperCase() + (card.brand || '').slice(1)} •••• {card.last4}
                          </span>
                          {card.is_default && (
                            <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '10px', marginRight: '6px' }}>Default</span>
                          )}
                          {card.exp_month && card.exp_year && (
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
                            </span>
                          )}
                        </label>
                      ))}
                      <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                        💳 Picking Card here will charge the selected card via Stripe and email a receipt automatically.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Amount + Tip */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Amount Paid <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input type="number" step="0.01" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder={balance.toFixed(2)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Tip
                  </label>
                  <input type="number" step="0.01" value={payTip}
                    onChange={e => setPayTip(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes (optional)
                </label>
                <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)}
                  placeholder="Anything to remember about this payment?"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}/>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPayingRes(null)} disabled={recordingPayment}
                  style={{ flex: 1, padding: '11px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleRecordBoardingPayment} disabled={recordingPayment || !payMethod}
                  style={{
                    flex: 2, padding: '11px',
                    background: (recordingPayment || !payMethod) ? '#9ca3af' : '#10b981',
                    color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                    cursor: (recordingPayment || !payMethod) ? 'not-allowed' : 'pointer',
                  }}>
                  {recordingPayment ? 'Saving...' : '✓ Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Edit Booking Modal ─────────────────────────────────────── */}
      {editingReservation && (
        <div className="cal-modal-overlay" onClick={() => !savingEdit && closeEditAndReopenCard()} style={{ zIndex: 60 }}>
          <div className="cal-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '95%' }}>
            <div className="cal-modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>✏️ Edit Booking</h2>
              <button className="cal-modal-close" onClick={closeEditAndReopenCard} disabled={savingEdit}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              {/* Kennel picker */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Kennel
                </label>
                <select
                  value={editForm.kennel_id}
                  onChange={e => setEditForm({ ...editForm, kennel_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}
                >
                  <option value="">— Pick a kennel —</option>
                  {kennels.map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Check-In Date
                  </label>
                  <input type="date" value={editForm.start_date}
                    onChange={e => handleEditDateChange('start_date', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Check-In Time
                  </label>
                  <input type="time" value={editForm.start_time}
                    onChange={e => setEditForm({ ...editForm, start_time: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Check-Out Date
                  </label>
                  <input type="date" value={editForm.end_date}
                    onChange={e => handleEditDateChange('end_date', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Check-Out Time
                  </label>
                  <input type="time" value={editForm.end_time}
                    onChange={e => setEditForm({ ...editForm, end_time: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
              </div>

              {/* Live nights preview */}
              {editForm.start_date && editForm.end_date && editForm.end_date >= editForm.start_date && (
                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6b7280' }}>
                  🌙 {getNightsBetween(editForm.start_date, editForm.end_date)} night{getNightsBetween(editForm.start_date, editForm.end_date) === 1 ? '' : 's'}
                </div>
              )}

              {/* Per Night Rate — when this changes, the total auto-updates
                  to (rate × nights). Lets groomers think in per-night terms. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Per Night Rate ($)
                  </label>
                  <input type="number" step="0.01" min="0" value={editForm.per_night_rate || ''}
                    onChange={e => handlePerNightRateChange(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Price ($)
                  </label>
                  <input type="number" step="0.01" min="0" value={editForm.total_price}
                    onChange={e => setEditForm({ ...editForm, total_price: e.target.value })}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}/>
                </div>
              </div>
              {editForm.per_night_rate > 0 && editForm.start_date && editForm.end_date && editForm.end_date >= editForm.start_date && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                  💡 ${editForm.per_night_rate.toFixed(2)}/night × {getNightsBetween(editForm.start_date, editForm.end_date)} night{getNightsBetween(editForm.start_date, editForm.end_date) === 1 ? '' : 's'} = ${(editForm.per_night_rate * getNightsBetween(editForm.start_date, editForm.end_date)).toFixed(2)}
                </div>
              )}
              {(!editForm.per_night_rate || editForm.per_night_rate <= 0) && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                  💡 Tip: type a rate per night and the total fills in automatically
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes (optional)
                </label>
                <textarea value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Anything special about this stay?"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}/>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={closeEditAndReopenCard} disabled={savingEdit}
                  style={{ flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  style={{
                    flex: 2, padding: '12px',
                    background: savingEdit ? '#9ca3af' : '#7c3aed',
                    color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                    cursor: savingEdit ? 'not-allowed' : 'pointer',
                  }}>
                  {savingEdit ? 'Saving...' : '✓ Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
