import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatPhone, formatPhoneOnInput } from '../lib/phone'
import { mapsUrl, telUrl } from '../lib/maps'
import AddressInput from '../components/AddressInput'

const TABS = [
  { key: 'overview', label: '🐾 Overview' },
  { key: 'upcoming', label: '📅 Upcoming' },
  { key: 'contacts', label: '📞 Contacts' },
  { key: 'grooming', label: '✂️ Past Grooming' },
  { key: 'boarding', label: '🏠 Past Boarding' },
  { key: 'vaccinations', label: '💉 Vaccinations' },
  { key: 'payments', label: '💳 Payments' },
  { key: 'notes', label: '📝 Notes' },
  { key: 'agreements', label: '📜 Agreements' },
]

// Freeform relationship suggestions (shown as datalist in the form)
const CONTACT_RELATIONSHIP_SUGGESTIONS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Roommate',
  'Pickup person', 'Pet sitter', 'Dog walker', 'Neighbor',
  'Vet', 'Emergency contact', 'Other'
]

// Shared form styles for the Contacts tab
const contactLabelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '13px',
  fontWeight: '600',
  color: '#374151'
}

const contactInputStyle = {
  padding: '10px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontWeight: '400',
  outline: 'none',
  fontFamily: 'inherit'
}

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [pets, setPets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Tab data states
  const [groomingHistory, setGroomingHistory] = useState([])
  const [boardingHistory, setBoardingHistory] = useState([])
  const [vaccinations, setVaccinations] = useState([])
  const [loadingTab, setLoadingTab] = useState(false)

  // Notes state
  const [clientNotes, setClientNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('client') // 'client' or 'grooming'
  const [noteForPet, setNoteForPet] = useState('') // pet_id for grooming notes
  const [savingNote, setSavingNote] = useState(false)
  const [groomingNotes, setGroomingNotes] = useState([]) // per-pet grooming notes
  // Signed agreements state — list of waivers this client has signed
  const [signedAgreements, setSignedAgreements] = useState([])
  const [loadingAgreements, setLoadingAgreements] = useState(false)
  const [clientPayments, setClientPayments] = useState([]) // actual payment records from payments table
  const [clientOutstanding, setClientOutstanding] = useState({ total: 0, appointments: [] })
  const [upcomingAppts, setUpcomingAppts] = useState([])
  const [upcomingCount, setUpcomingCount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  // Most recent completed appointment per pet — used by "Book Again" buttons to pre-fill the calendar form
  const [lastApptPerPet, setLastApptPerPet] = useState({})
  // Most recent completed appointment overall for this client (for the header "Book Again" button)
  const [lastApptOverall, setLastApptOverall] = useState(null)

  // ===== Edit Client state (inline edit on Contact Information card) =====
  // Lets the groomer fix name/email/phone/address — handles marriage name
  // changes, typos, missing emails (important before sending portal invites).
  const [editingClient, setEditingClient] = useState(false)
  const [editClientForm, setEditClientForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    preferred_contact: 'text', address: ''
  })
  const [savingClientEdit, setSavingClientEdit] = useState(false)
  const [editClientError, setEditClientError] = useState('')

  // ===== Contacts tab state (Task #97 / #98) =====
  // Multi-contact support — spouse, pickup people, emergency, vet, etc.
  const [contacts, setContacts] = useState([])
  const [contactForm, setContactForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    relationship: '', is_emergency: false, can_pickup: true, notes: ''
  })
  const [editingContactId, setEditingContactId] = useState(null) // null = adding new; otherwise editing this row
  const [savingContact, setSavingContact] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)

  useEffect(() => {
    fetchClientAndPets()
    fetchUpcomingCounts()
    fetchLastCompletedPerPet()
  }, [id])

  // For "Book Again" pre-fill — find each pet's most recent completed appointment (and overall most recent for the header button)
  // NOTE: checkout flow only sets checked_out_at (not status='completed'), so filter on that alone.
  // Any appointment with checked_out_at IS NOT NULL is "done" regardless of status field.
  const fetchLastCompletedPerPet = async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, pet_id, service_id, appointment_date, services(id, service_name)')
      .eq('client_id', id)
      .not('checked_out_at', 'is', null)
      .order('appointment_date', { ascending: false })

    if (error || !data) {
      setLastApptPerPet({})
      setLastApptOverall(null)
      return
    }

    // Most recent overall
    setLastApptOverall(data[0] || null)

    // Most recent per pet (data is already sorted desc, so first hit per pet_id wins)
    const perPet = {}
    data.forEach(a => {
      if (a.pet_id && !perPet[a.pet_id]) {
        perPet[a.pet_id] = a
      }
    })
    setLastApptPerPet(perPet)
  }

  // Lightweight count fetch — runs on page load so badge appears immediately
  const fetchUpcomingCounts = async () => {
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_date, status')
      .eq('client_id', id)
      .is('checked_out_at', null)

    if (error || !data) {
      setUpcomingCount(0)
      setOverdueCount(0)
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const closedStatuses = ['cancelled', 'no_show', 'completed', 'checked_out']

    let overdue = 0
    let upcoming = 0
    data.forEach(a => {
      if (closedStatuses.includes(a.status)) return
      const apptDate = new Date(a.appointment_date + 'T00:00:00')
      if (apptDate < today) overdue++
      else upcoming++
    })

    setOverdueCount(overdue)
    setUpcomingCount(upcoming)
  }

  useEffect(() => {
    if (activeTab === 'grooming') fetchGroomingHistory()
    if (activeTab === 'boarding') fetchBoardingHistory()
    if (activeTab === 'vaccinations') fetchVaccinations()
    if (activeTab === 'notes') fetchNotes()
    if (activeTab === 'payments') fetchClientPayments()
    if (activeTab === 'upcoming') fetchUpcomingAppointments()
    if (activeTab === 'contacts') fetchContacts()
    if (activeTab === 'agreements') fetchSignedAgreements()
  }, [activeTab, id])

  // Fetch ALL real payments for this client (from payments table)
  const fetchClientPayments = async () => {
    setLoadingTab(true)
    try {
      // 1. Get payment history. Joins both appointments AND boarding_reservations
      // so the row label can say "Full Groom · bella" for grooming OR
      // "🏠 Boarding 4/27 → 4/28 · bella" for boarding stays.
      const { data: payData, error } = await supabase
        .from('payments')
        .select(`
          *,
          appointments:appointment_id (
            id,
            appointment_date,
            final_price,
            quoted_price,
            pets:pet_id ( name ),
            services:service_id ( service_name )
          ),
          boarding_reservations:boarding_reservation_id (
            id,
            start_date,
            end_date,
            boarding_reservation_pets ( pets:pet_id ( name ) )
          )
        `)
        .eq('client_id', id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching payments:', error)
        setClientPayments([])
      } else {
        setClientPayments(payData || [])
      }

      // 2. Get checked-out appointments for this client to compute outstanding balance
      const { data: apptsData } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, start_time, quoted_price, final_price, discount_amount,
          pets:pet_id ( name ),
          services:service_id ( service_name )
        `)
        .eq('client_id', id)
        .not('checked_out_at', 'is', null)
        .order('appointment_date', { ascending: false })

      // Build paid map from payment rows
      const paidMap = {}
      ;(payData || []).forEach(p => {
        if (!paidMap[p.appointment_id]) paidMap[p.appointment_id] = 0
        paidMap[p.appointment_id] += parseFloat(p.amount || 0)
      })

      // Calculate balance per appointment
      const unpaidAppts = []
      let totalOwed = 0
      ;(apptsData || []).forEach(a => {
        const servicePrice = parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0))
        const discount = parseFloat(a.discount_amount || 0)
        const totalDue = servicePrice - discount
        const paid = paidMap[a.id] || 0
        const balance = totalDue - paid
        if (balance > 0.01) {
          unpaidAppts.push({
            id: a.id,
            appointmentDate: a.appointment_date,
            startTime: a.start_time,
            petName: a.pets ? a.pets.name : '—',
            serviceName: a.services ? a.services.service_name : '—',
            totalDue: totalDue,
            paid: paid,
            balance: balance
          })
          totalOwed += balance
        }
      })

      setClientOutstanding({ total: totalOwed, appointments: unpaidAppts })
    } finally {
      setLoadingTab(false)
    }
  }

  // Fetch upcoming appointments for this client (grooming only for now — boarding handled later)
  // Shows ANY appointment that hasn't been closed out yet (not completed/cancelled/no_show/checked_out)
  // Past-dated confirmed appointments that never got marked done still show here — with an overdue badge
  const fetchUpcomingAppointments = async () => {
    setLoadingTab(true)
    // Includes appointment_pets so multi-pet recurring bookings show ALL pets
    // on the upcoming list, not just the legacy primary pet.
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        pets(id, name, breed),
        services(id, service_name, price, time_block_minutes),
        appointment_pets(id, pets:pet_id(id, name, breed), services:service_id(id, service_name))
      `)
      .eq('client_id', id)
      .is('checked_out_at', null)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching upcoming appts:', error)
      setUpcomingAppts([])
    } else {
      // Filter out closed-out statuses — only "still open" appointments
      const filtered = (data || []).filter(a =>
        !['cancelled', 'no_show', 'completed', 'checked_out'].includes(a.status)
      )
      setUpcomingAppts(filtered)
    }
    setLoadingTab(false)
  }

  // Cancel an upcoming appointment — keeps the record with status 'cancelled' for history
  const handleCancelAppointment = async (appt) => {
    const petName = appt.pets?.name || 'this pet'
    const dateStr = formatDate(appt.appointment_date)
    const timeStr = formatTime(appt.start_time)
    if (!window.confirm(`Cancel ${petName}'s appointment on ${dateStr} at ${timeStr}?\n\nThis will keep the record in history for tracking cancellations.`)) return

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt.id)

    if (error) {
      alert('Error cancelling appointment: ' + error.message)
      return
    }

    fetchUpcomingAppointments()
    fetchUpcomingCounts()
  }

  // Jump to calendar with the reschedule modal auto-opened for this appointment
  const handleReschedule = (apptId) => {
    navigate(`/calendar?rescheduleAppt=${apptId}`)
  }

  // "Book Again" → jump to calendar with New Appointment form pre-filled with client + pet + service
  const handleBookAgain = (petId, serviceId) => {
    const params = new URLSearchParams({
      bookClient: id,
      bookPet: petId,
    })
    if (serviceId) params.set('bookService', serviceId)
    navigate(`/calendar?${params.toString()}`)
  }

  // Header "Book Again" — uses most recently groomed pet's last service
  const handleBookAgainFromHeader = () => {
    if (!lastApptOverall) {
      alert('No previous appointments to rebook from — use + New Appointment instead.')
      return
    }
    handleBookAgain(lastApptOverall.pet_id, lastApptOverall.service_id)
  }

  // Pet card "Book Again" — uses this pet's last service
  const handleBookAgainForPet = (petId) => {
    const last = lastApptPerPet[petId]
    if (last) {
      handleBookAgain(petId, last.service_id)
    } else {
      // No history for this pet — still pre-fill client + pet, let user pick service
      handleBookAgain(petId, null)
    }
  }

  const fetchClientAndPets = async () => {
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (clientError) {
      console.error('Error fetching client:', clientError)
      setLoading(false)
      return
    }

    setClient(clientData)

    const { data: petsData, error: petsError } = await supabase
      .from('pets')
      .select('*')
      .eq('client_id', id)
      .order('name')

    if (!petsError) setPets(petsData || [])
    setLoading(false)
  }

  const fetchGroomingHistory = async () => {
    setLoadingTab(true)
    // Pull appointment_pets so multi-pet bookings show all pets in history
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        pets(id, name, breed),
        services(id, service_name, price, time_block_minutes),
        appointment_pets(id, pets:pet_id(id, name, breed), services:service_id(id, service_name))
      `)
      .eq('client_id', id)
      .order('appointment_date', { ascending: false })

    if (!error) setGroomingHistory(data || [])
    setLoadingTab(false)
  }

  const fetchBoardingHistory = async () => {
    setLoadingTab(true)
    const { data, error } = await supabase
      .from('boarding_reservations')
      .select(`
        *,
        kennels(id, name),
        boarding_reservation_pets(id, pet_id, pets(id, name, breed))
      `)
      .eq('client_id', id)
      .order('start_date', { ascending: false })

    if (!error) setBoardingHistory(data || [])
    setLoadingTab(false)
  }

  const fetchVaccinations = async () => {
    setLoadingTab(true)
    // Get all vaccinations for all pets belonging to this client
    const petIds = pets.map(p => p.id)
    if (petIds.length === 0) { setLoadingTab(false); return }

    const { data, error } = await supabase
      .from('pet_vaccinations')
      .select('*')
      .in('pet_id', petIds)
      .order('expiration_date', { ascending: true })

    if (!error) setVaccinations(data || [])
    setLoadingTab(false)
  }

  const fetchNotes = async () => {
    setLoadingTab(true)

    // Fetch all notes for this client from the unified notes table
    // Exclude appointment-specific notes (those live on the appointment modal)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('client_id', id)
      .is('appointment_id', null)
      .order('created_at', { ascending: false })

    if (!error) {
      const allNotes = data || []
      // Client-level notes: no pet_id OR note_type = 'client'
      setClientNotes(allNotes.filter(n => n.note_type === 'client' || (!n.pet_id && n.note_type !== 'grooming')))
      // Grooming notes: linked to a pet
      setGroomingNotes(allNotes.filter(n => n.note_type === 'grooming' || (n.pet_id && n.note_type !== 'client')))
    } else {
      setClientNotes([])
      setGroomingNotes([])
    }
    setLoadingTab(false)
  }

  // Fetch the signed agreements for this client (Phase A — Agreements feature).
  // We pull the linked agreement title + type so we can display "Grooming Waiver
  // signed Apr 30, 2026" rather than just an opaque id.
  const fetchSignedAgreements = async () => {
    setLoadingAgreements(true)
    try {
      const { data } = await supabase
        .from('signed_agreements')
        .select('id, signed_at, signature_text, signature_image, agreement_content_snapshot, ip_address, user_agent, agreements(id, type, title)')
        .eq('client_id', id)
        .order('signed_at', { ascending: false })
      setSignedAgreements(data || [])
    } catch (err) {
      console.error('[ClientDetail] fetchSignedAgreements error:', err)
      setSignedAgreements([])
    } finally {
      setLoadingAgreements(false)
    }
  }


  const saveNote = async () => {
    if (!newNote.trim()) return
    if (noteType === 'grooming' && !noteForPet) {
      alert('Please select a pet for this grooming note')
      return
    }
    setSavingNote(true)

    const { data: { user } } = await supabase.auth.getUser()

    // Save to the unified notes table
    const { error } = await supabase.from('notes').insert({
      client_id: id,
      pet_id: noteType === 'grooming' ? noteForPet : null,
      appointment_id: null,
      groomer_id: user.id,
      note_type: noteType,
      content: newNote.trim(),
    })

    if (!error) {
      setNewNote('')
      setNoteForPet('')
      fetchNotes()
    } else {
      alert('Error saving note: ' + error.message)
    }
    setSavingNote(false)
  }

  // ─── Inline note edit (no delete — preserves audit trail) ────────────
  // Lets the groomer fix typos / update info on existing notes. Tracks
  // which note is currently in edit mode + the working text in the textarea.
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const startEditNote = (note) => {
    setEditingNoteId(note.id)
    setEditingNoteText(note.content || '')
  }
  const cancelEditNote = () => {
    setEditingNoteId(null)
    setEditingNoteText('')
  }
  const saveEditNote = async () => {
    if (!editingNoteId || !editingNoteText.trim()) return
    setSavingEdit(true)
    const { error } = await supabase
      .from('notes')
      .update({ content: editingNoteText.trim(), updated_at: new Date().toISOString() })
      .eq('id', editingNoteId)
    if (error) {
      alert('Error saving edit: ' + error.message)
      setSavingEdit(false)
      return
    }
    setEditingNoteId(null)
    setEditingNoteText('')
    setSavingEdit(false)
    fetchNotes()
  }

  // ===== Edit Client handlers =====
  const startEditClient = () => {
    if (!client) return
    setEditClientForm({
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      phone: client.phone || '',
      email: client.email || '',
      preferred_contact: client.preferred_contact || 'text',
      address: client.address || '',
      address_notes: client.address_notes || '',
      // Coords come from clients table cache. Filled in only when the
      // user picks a new address from the Places Autocomplete dropdown.
      latitude: null,
      longitude: null,
    })
    setEditClientError('')
    setEditingClient(true)
  }

  const cancelEditClient = () => {
    setEditClientError('')
    setEditingClient(false)
  }

  const saveClientEdit = async () => {
    setEditClientError('')
    // Validate
    if (!editClientForm.first_name.trim()) {
      setEditClientError('First name is required.')
      return
    }
    if (!editClientForm.phone.trim()) {
      setEditClientError('Phone number is required.')
      return
    }

    setSavingClientEdit(true)
    // Build the update payload. Only include latitude/longitude if the user
    // picked a new address from the Places dropdown (otherwise the existing
    // cached coords stay as-is). The address-change DB trigger will auto-
    // wipe stale coords if the user typed a different address by hand.
    const updatePayload = {
      first_name: editClientForm.first_name.trim(),
      last_name: editClientForm.last_name.trim() || null,
      phone: editClientForm.phone.trim(),
      email: editClientForm.email.trim() || null,
      preferred_contact: editClientForm.preferred_contact,
      address: editClientForm.address.trim() || null,
      address_notes: (editClientForm.address_notes || '').trim() || null,
    }
    if (editClientForm.latitude != null && editClientForm.longitude != null) {
      updatePayload.latitude = editClientForm.latitude
      updatePayload.longitude = editClientForm.longitude
      updatePayload.coords_geocoded_at = new Date().toISOString()
    }
    const { error } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      setEditClientError('Could not save: ' + error.message)
    } else {
      await fetchClientAndPets()
      setEditingClient(false)
    }
    setSavingClientEdit(false)
  }

  // ===== Contacts CRUD (Task #97 / #98) =====
  // Fetch all extra contacts for this client (emergency, pickup people, etc.)
  const fetchContacts = async () => {
    setLoadingTab(true)
    const { data, error } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', id)
      // Emergency contacts first, then pickup-allowed, then newest
      .order('is_emergency', { ascending: false })
      .order('can_pickup', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setContacts(data || [])
    else setContacts([])
    setLoadingTab(false)
  }

  const resetContactForm = () => {
    setContactForm({
      first_name: '', last_name: '', phone: '', email: '',
      relationship: '', is_emergency: false, can_pickup: true, notes: ''
    })
    setEditingContactId(null)
    setShowContactForm(false)
  }

  const startEditContact = (c) => {
    setContactForm({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      email: c.email || '',
      relationship: c.relationship || '',
      is_emergency: !!c.is_emergency,
      can_pickup: c.can_pickup !== false,
      notes: c.notes || ''
    })
    setEditingContactId(c.id)
    setShowContactForm(true)
  }

  const saveContact = async () => {
    const first = (contactForm.first_name || '').trim()
    const phone = (contactForm.phone || '').trim()
    if (!first) { alert('First name is required'); return }
    if (!phone) { alert('Phone number is required'); return }

    setSavingContact(true)
    const payload = {
      client_id: id,
      first_name: first,
      last_name: (contactForm.last_name || '').trim() || null,
      phone: phone,
      email: (contactForm.email || '').trim() || null,
      relationship: (contactForm.relationship || '').trim() || null,
      is_emergency: !!contactForm.is_emergency,
      can_pickup: contactForm.can_pickup !== false,
      notes: (contactForm.notes || '').trim() || null,
    }

    let error
    if (editingContactId) {
      const res = await supabase.from('client_contacts').update(payload).eq('id', editingContactId)
      error = res.error
    } else {
      const res = await supabase.from('client_contacts').insert(payload)
      error = res.error
    }

    if (error) {
      alert('Error saving contact: ' + error.message)
    } else {
      resetContactForm()
      fetchContacts()
    }
    setSavingContact(false)
  }

  const deleteContact = async (contactId) => {
    if (!window.confirm('Delete this contact? This cannot be undone.')) return
    const { error } = await supabase.from('client_contacts').delete().eq('id', contactId)
    if (error) alert('Error deleting: ' + error.message)
    else fetchContacts()
  }

  // ===== Inactive / Active toggle =====
  const [togglingActive, setTogglingActive] = useState(false)
  const handleToggleActive = async () => {
    if (!client) return
    const newVal = !(client.is_active !== false) // flip (default true if null)
    const verb = newVal ? 'reactivate' : 'mark as inactive'
    if (!window.confirm(verb.toUpperCase() + ' ' + (client.first_name || 'this client') + '?\n\n' +
        (newVal ? 'They\'ll show up in your default client list again.' : 'They\'ll be hidden from the default client list. Their data stays — use the "Show inactive" toggle to see them later.'))) return
    setTogglingActive(true)
    const { error } = await supabase
      .from('clients')
      .update({ is_active: newVal })
      .eq('id', id)
    if (error) {
      alert('Error: ' + error.message)
    } else {
      await fetchClientAndPets()
    }
    setTogglingActive(false)
  }

  // ===== Merge Clients =====
  // Move this client's data (pets, appointments, payments, notes, contacts,
  // portal login) INTO another client record. This one gets deleted after.
  // Covers the scenario where a new signup creates a duplicate of an
  // existing client whose phone/email didn't match at signup time.
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeCandidates, setMergeCandidates] = useState([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [merging, setMerging] = useState(false)

  const openMergeModal = () => {
    setMergeSearch('')
      setMergeCandidates([])
      setMerging(false)
      setShowMergeModal(false)
      setMergeSearch('')
      setMergeCandidates([])
    setMerging(false) // safety belt — never reopen with stale "Merging..." state
    setShowMergeModal(true)
  }

  const searchMergeCandidates = async (q) => {
    setMergeSearch(q)
    if (!q || q.trim().length < 2) {
      setMergeCandidates([])
      return
    }
    setMergeSearching(true)
    const term = q.trim()
    const digits = term.replace(/[^0-9]/g, '')
    // Search by name OR phone, EXCLUDE the current client
    let query = supabase
      .from('clients')
      .select('id, first_name, last_name, phone, email, user_id')
      .neq('id', id)
      .limit(20)
    if (digits.length >= 3) {
      // looks like a phone search
      query = query.ilike('phone', '%' + digits + '%')
    } else {
      // name search — OR first_name/last_name
      query = query.or('first_name.ilike.%' + term + '%,last_name.ilike.%' + term + '%')
    }
    const { data, error } = await query
    if (!error) setMergeCandidates(data || [])
    setMergeSearching(false)
  }

  const confirmMerge = async (target) => {
    if (!target || !client) return
    const sourceName = ((client.first_name || '') + ' ' + (client.last_name || '')).trim()
    const targetName = ((target.first_name || '') + ' ' + (target.last_name || '')).trim()
    const warn =
      'MERGE ' + sourceName + ' into ' + targetName + '?\n\n' +
      'This will:\n' +
      '  • Move ALL of ' + sourceName + '\'s pets, appointments, payments, notes, and contacts to ' + targetName + '\n' +
      (client.user_id ? '  • Transfer the portal login to ' + targetName + ' (they\'ll log in with ' + (client.email || 'their email') + ')\n' : '') +
      '  • DELETE the ' + sourceName + ' record\n\n' +
      'This CANNOT be undone. Type "merge" to confirm.'
    const typed = window.prompt(warn)
    if (!typed || typed.trim().toLowerCase() !== 'merge') {
      return
    }
    setMerging(true)
    const { error } = await supabase.rpc('merge_clients', {
      p_source_id: id,
      p_target_id: target.id,
    })
    if (error) {
      alert('Merge failed: ' + error.message)
      setMerging(false)
      return
    }
    // Reset all merge state BEFORE navigating — otherwise the modal +
    // "Merging..." stays stuck because React Router re-renders this same
    // component instead of unmounting it (we're going /clients/A → /clients/B)
    setMerging(false)
    setShowMergeModal(false)
    setMergeSearch('')
    setMergeCandidates([])
    // Redirect to the target client — where all the data now lives
    navigate('/clients/' + target.id)
  }

  // ===== Delete Client =====
  // Wipes the client row (cascades pets / appointments / payments / contacts / notes)
  // AND their auth user if they had a portal account (frees up the email).
  const [deletingClient, setDeletingClient] = useState(false)
  const handleDeleteClient = async () => {
    if (!client) return
    const name = ((client.first_name || '') + ' ' + (client.last_name || '')).trim()
    const petCount = pets.length
    const warn =
      'PERMANENTLY DELETE ' + name + '?\n\n' +
      'This will erase:\n' +
      '  • This client record\n' +
      '  • ' + petCount + ' pet' + (petCount === 1 ? '' : 's') + '\n' +
      '  • ALL their appointments (past & upcoming)\n' +
      '  • ALL their payment history\n' +
      '  • ALL their notes & contacts\n' +
      (client.user_id ? '  • Their portal login (email frees up for re-signup)\n' : '') +
      '\nThis CANNOT be undone. Type their first name (' + (client.first_name || '') + ') OR full name to confirm.'
    const typed = window.prompt(warn)
    if (!typed) return
    const typedLower = typed.trim().toLowerCase()
    const firstNameLower = (client.first_name || '').trim().toLowerCase()
    const fullNameLower = ((client.first_name || '') + ' ' + (client.last_name || '')).trim().toLowerCase()
    if (typedLower !== firstNameLower && typedLower !== fullNameLower) {
      alert('Name did not match. Delete cancelled.\n\nExpected "' + (client.first_name || '') + '" or "' + name + '".')
      return
    }
    setDeletingClient(true)
    const { error } = await supabase.rpc('delete_client_and_auth', { p_client_id: id })
    if (error) {
      alert('Error deleting: ' + error.message)
      setDeletingClient(false)
      return
    }
    navigate('/clients')
  }

  // Helper functions
  const getStatusColor = (status) => {
    const colors = {
      scheduled: '#7c3aed', confirmed: '#2563eb', completed: '#16a34a',
      cancelled: '#dc2626', no_show: '#f59e0b', checked_in: '#16a34a',
      checked_out: '#6b7280', pending: '#f59e0b', wait_list: '#8b5cf6'
    }
    return colors[status] || '#6b7280'
  }

  const getVaxStatus = (expirationDate) => {
    if (!expirationDate) return 'unknown'
    const exp = new Date(expirationDate)
    const now = new Date()
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (exp < now) return 'expired'
    if (exp < thirtyDays) return 'due_soon'
    return 'current'
  }

  const getVaxStatusStyle = (status) => {
    if (status === 'expired') return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
    if (status === 'due_soon') return { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
    return { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${ampm}`
  }

  const getPetName = (petId) => {
    const pet = pets.find(p => p.id === petId)
    return pet ? pet.name : 'Unknown Pet'
  }

  const getPetAvatar = (pet) => {
    const colors = ['#7c3aed', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899']
    const idx = pet.name.charCodeAt(0) % colors.length
    return colors[idx]
  }

  // Calculate stats
  const totalGroomingSpent = groomingHistory.reduce((sum, a) => sum + (parseFloat(a.final_price || a.quoted_price) || 0), 0)
  const totalBoardingSpent = boardingHistory.reduce((sum, r) => sum + (parseFloat(r.total_price) || 0), 0)
  const completedGrooming = groomingHistory.filter(a => a.status === 'completed').length
  const totalBoardingNights = boardingHistory.reduce((sum, r) => {
    if (r.status === 'cancelled') return sum
    const start = new Date(r.start_date)
    const end = new Date(r.end_date)
    return sum + Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
  }, 0)

  if (loading) {
    return (
      <div className="cp-loading">
        <div className="cp-loading-paw">🐾</div>
        <p>Loading client profile...</p>
      </div>
    )
  }

  if (!client) return <div className="cp-loading">Client not found</div>

  // ─── RENDER ───
  return (
    <div className="cp-page">
      {/* Header */}
      <div className="cp-header">
        <div className="cp-header-top">
          <Link to="/clients" className="cp-back">← Back to Clients</Link>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="cp-book-again-btn"
              onClick={handleBookAgainFromHeader}
              title={lastApptOverall ? `Rebook last service` : 'No history to rebook from'}
            >
              📅 Book Again
            </button>
            <button
              onClick={handleToggleActive}
              disabled={togglingActive}
              title={client.is_active === false ? 'Reactivate this client' : 'Mark inactive (hide from default client list)'}
              style={{
                padding: '8px 14px',
                background: '#fff',
                color: client.is_active === false ? '#16a34a' : '#6b7280',
                border: '1px solid ' + (client.is_active === false ? '#bbf7d0' : '#d1d5db'),
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: togglingActive ? 'wait' : 'pointer',
                opacity: togglingActive ? 0.6 : 1,
              }}
            >
              {togglingActive
                ? '...'
                : (client.is_active === false ? '♻️ Reactivate' : '💤 Mark Inactive')}
            </button>
            <button
              onClick={openMergeModal}
              disabled={merging}
              title="Merge this client into another client record (e.g., combine a duplicate from portal signup with the real record)"
              style={{
                padding: '8px 14px',
                background: '#fff',
                color: '#7c3aed',
                border: '1px solid #7c3aed',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: merging ? 'wait' : 'pointer',
                opacity: merging ? 0.6 : 1,
              }}
            >
              {merging ? 'Merging...' : '🔀 Merge'}
            </button>
            <button
              onClick={handleDeleteClient}
              disabled={deletingClient}
              title="Permanently delete this client (and their portal login if they have one)"
              style={{
                padding: '8px 14px',
                background: '#fff',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: deletingClient ? 'wait' : 'pointer',
                opacity: deletingClient ? 0.6 : 1,
              }}
            >
              {deletingClient ? 'Deleting...' : '🗑️ Delete'}
            </button>
          </div>
        </div>
        <div className="cp-header-row">
          <div className="cp-avatar-big" style={{ background: getPetAvatar({ name: client.first_name }) }}>
            {client.first_name?.[0]}{client.last_name?.[0]}
          </div>
          <div className="cp-header-info">
            <h1 className="cp-name">
              {client.first_name} {client.last_name}
              {client.is_active === false && (
                <span style={{
                  marginLeft: '10px',
                  padding: '4px 10px',
                  background: '#f3f4f6',
                  color: '#6b7280',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: '700',
                  verticalAlign: 'middle',
                }}>💤 INACTIVE</span>
              )}
              {client.is_first_time && <span className="cp-badge-new">New Client</span>}
              {overdueCount > 0 && (
                <span
                  className="cp-badge-overdue"
                  onClick={() => setActiveTab('upcoming')}
                  title="Click to view overdue appointments"
                >
                  🔴 {overdueCount} Overdue
                </span>
              )}
              {overdueCount === 0 && upcomingCount > 0 && (
                <span
                  className="cp-badge-upcoming"
                  onClick={() => setActiveTab('upcoming')}
                  title="Click to view upcoming appointments"
                >
                  📅 {upcomingCount} Upcoming
                </span>
              )}
            </h1>
            <div className="cp-quick-stats">
              <span>🐾 {pets.length} Pet{pets.length !== 1 ? 's' : ''}</span>
              <span className="cp-stat-dot">·</span>
              {client.phone ? (
                <a href={telUrl(client.phone)} style={{ color: 'inherit', textDecoration: 'none' }} title="Tap to call">
                  📞 {formatPhone(client.phone)}
                </a>
              ) : (
                <span>📞 No phone</span>
              )}
              {client.email && (
                <>
                  <span className="cp-stat-dot">·</span>
                  <a href={'mailto:' + client.email} style={{ color: 'inherit', textDecoration: 'none' }} title="Tap to email">
                    📧 {client.email}
                  </a>
                </>
              )}
              {client.preferred_contact && (
                <>
                  <span className="cp-stat-dot">·</span>
                  <span>💬 Prefers {client.preferred_contact}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="cp-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`cp-tab ${activeTab === tab.key ? 'cp-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="cp-tab-content">

        {/* ═══════ OVERVIEW TAB ═══════ */}
        {activeTab === 'overview' && (
          <div className="cp-overview">
            {/* Contact Card */}
            <div className="cp-card">
              <div className="cp-card-title-row">
                <h3 className="cp-card-title">📋 Contact Information</h3>
                {!editingClient && (
                  <button
                    onClick={startEditClient}
                    style={{
                      padding: '6px 12px',
                      background: '#fff',
                      color: '#7c3aed',
                      border: '1px solid #7c3aed',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {!editingClient ? (
                <>
                  {/* ─── View Mode ─── */}
                  <div className="cp-contact-grid">
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Name</span>
                      <span className="cp-contact-value">{client.first_name} {client.last_name || ''}</span>
                    </div>
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Phone</span>
                      {client.phone ? (
                        <a
                          href={telUrl(client.phone)}
                          className="cp-contact-value"
                          style={{ color: '#7c3aed', textDecoration: 'none' }}
                          title="Tap to call"
                        >
                          📞 {formatPhone(client.phone)}
                        </a>
                      ) : (
                        <span className="cp-contact-value">Not provided</span>
                      )}
                    </div>
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Email</span>
                      {client.email ? (
                        <a
                          href={'mailto:' + client.email}
                          className="cp-contact-value"
                          style={{ color: '#7c3aed', textDecoration: 'none' }}
                          title="Tap to email"
                        >
                          ✉️ {client.email}
                        </a>
                      ) : (
                        <span className="cp-contact-value">Not provided</span>
                      )}
                    </div>
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Preferred Contact</span>
                      <span className="cp-contact-value">{client.preferred_contact || 'Not set'}</span>
                    </div>
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Address</span>
                      {client.address ? (
                        <a
                          href={mapsUrl(client.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cp-contact-value"
                          style={{ color: '#7c3aed', textDecoration: 'none' }}
                          title="Tap for directions"
                        >
                          🏠 {client.address}
                        </a>
                      ) : (
                        <span className="cp-contact-value">Not provided</span>
                      )}
                    </div>
                  </div>
                  {client.notes && (
                    <div className="cp-client-notes-preview">
                      <strong>Notes:</strong> {client.notes}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* ─── Edit Mode ─── */}
                  {editClientError && (
                    <div style={{
                      padding: '10px 12px',
                      background: '#fee2e2',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      color: '#991b1b',
                      marginBottom: '12px',
                      fontSize: '13px'
                    }}>
                      {editClientError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <label style={contactLabelStyle}>
                      First name *
                      <input
                        type="text"
                        value={editClientForm.first_name}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, first_name: e.target.value }) }}
                        style={contactInputStyle}
                      />
                    </label>
                    <label style={contactLabelStyle}>
                      Last name
                      <input
                        type="text"
                        value={editClientForm.last_name}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, last_name: e.target.value }) }}
                        style={contactInputStyle}
                      />
                    </label>
                    <label style={contactLabelStyle}>
                      Phone *
                      <input
                        type="tel"
                        value={editClientForm.phone}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, phone: formatPhoneOnInput(e.target.value) }) }}
                        placeholder="713-098-3746"
                        style={contactInputStyle}
                      />
                    </label>
                    <label style={contactLabelStyle}>
                      Email
                      <input
                        type="email"
                        value={editClientForm.email}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, email: e.target.value }) }}
                        placeholder="sandy@example.com"
                        style={contactInputStyle}
                      />
                    </label>
                    <label style={contactLabelStyle}>
                      Preferred Contact
                      <select
                        value={editClientForm.preferred_contact}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, preferred_contact: e.target.value }) }}
                        style={{ ...contactInputStyle, background: '#fff' }}
                      >
                        <option value="text">Text</option>
                        <option value="call">Call</option>
                        <option value="email">Email</option>
                      </select>
                    </label>
                    <label style={{ ...contactLabelStyle, gridColumn: '1 / -1' }}>
                      Address
                      <AddressInput
                        value={editClientForm.address}
                        onChange={(addr) => setEditClientForm({ ...editClientForm, address: addr })}
                        onSelect={({ address, latitude, longitude }) => {
                          // Picked from Places dropdown → save clean address + coords together
                          setEditClientForm({ ...editClientForm, address, latitude, longitude })
                        }}
                        placeholder="Start typing — pick from dropdown for best results"
                        style={contactInputStyle}
                      />
                      <small style={{ display: 'block', marginTop: '4px', color: '#6b7280', fontSize: '11px' }}>
                        Pick from the dropdown so the route map can find them later.
                      </small>
                    </label>
                    {/* Address notes — gate codes, parking tips, "ring don't knock" */}
                    <label style={{ ...contactLabelStyle, gridColumn: '1 / -1' }}>
                      📍 Address Notes
                      <textarea
                        value={editClientForm.address_notes || ''}
                        onChange={function (e) { setEditClientForm({ ...editClientForm, address_notes: e.target.value }) }}
                        placeholder='e.g. "Park in driveway · Gate code 4567 · Side door"'
                        rows={2}
                        style={{ ...contactInputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <small style={{ display: 'block', marginTop: '4px', color: '#6b7280', fontSize: '11px' }}>
                        Shows on route map + appointment popup so you don't forget gate codes / parking tips.
                      </small>
                    </label>
                  </div>

                  {editClientForm.email && client.email && editClientForm.email.trim().toLowerCase() !== client.email.toLowerCase() && client.user_id && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      background: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      color: '#92400e',
                      fontSize: '12px'
                    }}>
                      ⚠️ This client already signed up for the portal with their old email. Changing the email here won't change their login — they'll still log in with <strong>{client.email}</strong>.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
                    <button
                      onClick={cancelEditClient}
                      disabled={savingClientEdit}
                      style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveClientEdit}
                      disabled={savingClientEdit}
                      style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', opacity: savingClientEdit ? 0.6 : 1 }}
                    >
                      {savingClientEdit ? 'Saving...' : '💾 Save changes'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Pets Section — active only. Memorial pets show in their own
                "🌈 Pets We Remember" card below this one. */}
            <div className="cp-card">
              <div className="cp-card-title-row">
                <h3 className="cp-card-title">🐾 Pets ({pets.filter(p => !p.is_memorial && !p.is_archived).length})</h3>
                <Link to={`/clients/${id}/pets/new`} className="cp-btn-add">+ Add Pet</Link>
              </div>

              {pets.filter(p => !p.is_memorial && !p.is_archived).length === 0 ? (
                <div className="cp-empty">No pets added yet. Add this client's first pet!</div>
              ) : (
                <div className="cp-pets-grid">
                  {pets.filter(p => !p.is_memorial && !p.is_archived).map(pet => {
                    const vaxStatus = getVaxStatus(pet.vaccination_expiry)
                    return (
                      <Link to={`/pets/${pet.id}`} key={pet.id} className="cp-pet-card">
                        <div className="cp-pet-card-top">
                          <div className="cp-pet-avatar" style={{ background: getPetAvatar(pet) }}>
                            {pet.name?.[0]}
                          </div>
                          <div className="cp-pet-info">
                            <h4 className="cp-pet-name">{pet.name}</h4>
                            <p className="cp-pet-breed">{pet.breed} · {pet.weight}lbs</p>
                            <p className="cp-pet-details">
                              {pet.age && <span>{pet.age}</span>}
                              {pet.sex && <span> · {pet.sex}</span>}
                              {pet.is_spayed_neutered && <span> · Fixed</span>}
                              {!pet.is_spayed_neutered && pet.sex && <span> · Intact</span>}
                            </p>
                          </div>
                          <div className="cp-pet-vax-badge" style={getVaxStatusStyle(vaxStatus)}>
                            {vaxStatus === 'current' ? '✅ Vax Current' : vaxStatus === 'due_soon' ? '⚠️ Vax Due Soon' : vaxStatus === 'expired' ? '❌ Vax Expired' : '❓ Unknown'}
                          </div>
                        </div>

                        {/* Health Alerts */}
                        {(pet.allergies || pet.medications) && (
                          <div className="cp-pet-health">
                            {pet.allergies && (
                              <div className="cp-pet-alert cp-pet-alert-red">
                                🚨 Allergies: {pet.allergies}
                              </div>
                            )}
                            {pet.medications && (
                              <div className="cp-pet-alert cp-pet-alert-blue">
                                💊 Medications: {pet.medications}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Flags */}
                        <div className="cp-pet-flags">
                          {pet.muzzle_required && <span className="cp-flag cp-flag-red">🔴 Muzzle</span>}
                          {pet.dog_aggressive && <span className="cp-flag cp-flag-red">⚠️ Dog Aggressive</span>}
                          {pet.people_aggressive && <span className="cp-flag cp-flag-red">⚠️ People Aggressive</span>}
                          {pet.collapsed_trachea && <span className="cp-flag cp-flag-yellow">🫁 Collapsed Trachea</span>}
                          {pet.is_senior && <span className="cp-flag cp-flag-purple">👴 Senior</span>}
                          {pet.handling_fee && <span className="cp-flag cp-flag-yellow">💰 Handling Fee</span>}
                          {pet.anxiety_level && pet.anxiety_level !== 'none' && (
                            <span className="cp-flag cp-flag-yellow">😰 Anxiety: {pet.anxiety_level}</span>
                          )}
                          {pet.matting_level && pet.matting_level !== 'none' && (
                            <span className="cp-flag cp-flag-yellow">🪮 Matting: {pet.matting_level}</span>
                          )}
                        </div>

                        {pet.grooming_notes && (
                          <div className="cp-pet-groom-notes">✂️ {pet.grooming_notes}</div>
                        )}

                        {/* Book Again button for this specific pet */}
                        <div className="cp-pet-actions">
                          <button
                            className="cp-pet-book-again"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleBookAgainForPet(pet.id)
                            }}
                            title={lastApptPerPet[pet.id] ? `Rebook ${pet.name}'s last service` : `Book a service for ${pet.name}`}
                          >
                            📅 Book Again for {pet.name}
                          </button>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 🌈 Pets We Remember — memorial section.
                Read-only display — to mark/restore memorial status the
                groomer clicks into the pet's profile (PetDetail.jsx)
                and uses the Danger Zone buttons there. */}
            {pets.filter(p => p.is_memorial && !p.is_archived).length > 0 && (
              <div className="cp-card" style={{ background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                <h3 className="cp-card-title" style={{ color: '#6b21a8' }}>
                  🌈 Pets We Remember ({pets.filter(p => p.is_memorial && !p.is_archived).length})
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
                  Always loved. Click any pet to view their memorial page.
                </p>
                <div className="cp-pets-grid">
                  {pets.filter(p => p.is_memorial && !p.is_archived).map(pet => (
                    <Link to={`/pets/${pet.id}`} key={pet.id} className="cp-pet-card" style={{ opacity: 0.85 }}>
                      <div className="cp-pet-card-top">
                        <div className="cp-pet-avatar" style={{ background: getPetAvatar(pet), filter: 'grayscale(0.3)' }}>
                          {pet.name?.[0]}
                        </div>
                        <div className="cp-pet-info">
                          <h4 className="cp-pet-name">{pet.name} 🌈</h4>
                          <p className="cp-pet-breed">{pet.breed} · {pet.weight}lbs</p>
                          {pet.memorial_date && (
                            <p className="cp-pet-details" style={{ fontStyle: 'italic', color: '#6b21a8' }}>
                              Passed {new Date(pet.memorial_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ UPCOMING TAB ═══════ */}
        {activeTab === 'upcoming' && (
          <div className="cp-upcoming">
            {loadingTab ? (
              <div className="cp-tab-loading">🐾 Loading upcoming appointments...</div>
            ) : upcomingAppts.length === 0 ? (
              <div className="cp-empty-tab">
                <div className="cp-empty-icon">📅</div>
                <p>No upcoming appointments</p>
                <p className="cp-empty-sub">Book this client's next appointment from the calendar</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="cp-summary-bar">
                  <div className="cp-summary-item">
                    <span className="cp-summary-number">{upcomingAppts.length}</span>
                    <span className="cp-summary-label">Upcoming Appointment{upcomingAppts.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Upcoming List */}
                <div className="cp-history-list">
                  {upcomingAppts.map(appt => {
                    const apptDate = new Date(appt.appointment_date + 'T00:00:00')
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const isOverdue = apptDate < today
                    return (
                    <div key={appt.id} className={`cp-upcoming-item ${isOverdue ? 'cp-upcoming-overdue' : ''}`}>
                      <div className="cp-history-date-col">
                        <span className="cp-history-month">{apptDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="cp-history-day">{apptDate.getDate()}</span>
                        <span className="cp-history-year">{apptDate.getFullYear()}</span>
                      </div>
                      <div className="cp-history-details">
                        <div className="cp-history-top-row">
                          <span className="cp-history-service">
                            {/* Multi-pet: list each pet's service joined; otherwise legacy primary service */}
                            {(appt.appointment_pets && appt.appointment_pets.length > 0)
                              ? appt.appointment_pets
                                  .map(ap => ap.services && ap.services.service_name)
                                  .filter(Boolean)
                                  .join(' · ') || 'Service'
                              : (appt.services?.service_name || 'Service')}
                          </span>
                          {isOverdue && (
                            <span className="cp-upcoming-overdue-badge">⚠️ Overdue — needs action</span>
                          )}
                          <span className="cp-history-status" style={{ background: getStatusColor(appt.status) + '20', color: getStatusColor(appt.status) }}>
                            {appt.status}
                          </span>
                        </div>
                        <div className="cp-history-meta">
                          <span>🐾 {
                            /* Show every pet on the appointment (multi-pet bookings) */
                            (appt.appointment_pets && appt.appointment_pets.length > 0)
                              ? appt.appointment_pets
                                  .map(ap => ap.pets && ap.pets.name)
                                  .filter(Boolean)
                                  .join(', ')
                              : (appt.pets?.name || 'Unknown Pet')
                          }</span>
                          <span>🕐 {formatTime(appt.start_time)} — {formatTime(appt.end_time)}</span>
                          {appt.services?.time_block_minutes && <span>⏱️ {appt.services.time_block_minutes} min</span>}
                        </div>
                        {appt.service_notes && (
                          <div className="cp-history-notes">📝 {appt.service_notes}</div>
                        )}
                      </div>
                      <div className="cp-upcoming-actions">
                        <button
                          className="cp-upcoming-btn cp-upcoming-btn-view"
                          onClick={() => navigate(`/calendar?viewAppt=${appt.id}`)}
                          title="View full appointment details on the calendar"
                        >
                          👁 View
                        </button>
                        <button
                          className="cp-upcoming-btn cp-upcoming-btn-reschedule"
                          onClick={() => handleReschedule(appt.id)}
                        >
                          📅 Reschedule
                        </button>
                        <button
                          className="cp-upcoming-btn cp-upcoming-btn-cancel"
                          onClick={() => handleCancelAppointment(appt)}
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════ PAST GROOMING TAB ═══════ */}
        {activeTab === 'grooming' && (
          <div className="cp-grooming">
            {loadingTab ? (
              <div className="cp-tab-loading">🐾 Loading grooming history...</div>
            ) : groomingHistory.length === 0 ? (
              <div className="cp-empty-tab">
                <div className="cp-empty-icon">✂️</div>
                <p>No grooming appointments yet</p>
              </div>
            ) : (
              <>
                {/* Summary Bar */}
                <div className="cp-summary-bar">
                  <div className="cp-summary-item">
                    <span className="cp-summary-number">{groomingHistory.length}</span>
                    <span className="cp-summary-label">Total Appointments</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number">{completedGrooming}</span>
                    <span className="cp-summary-label">Completed</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number cp-summary-money">${totalGroomingSpent.toFixed(2)}</span>
                    <span className="cp-summary-label">Total Spent</span>
                  </div>
                </div>

                {/* Appointment List */}
                <div className="cp-history-list">
                  {groomingHistory.map(appt => (
                    <div key={appt.id} className="cp-history-item">
                      <div className="cp-history-date-col">
                        <span className="cp-history-month">{new Date(appt.appointment_date).toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="cp-history-day">{new Date(appt.appointment_date).getDate()}</span>
                        <span className="cp-history-year">{new Date(appt.appointment_date).getFullYear()}</span>
                      </div>
                      <div className="cp-history-details">
                        <div className="cp-history-top-row">
                          <span className="cp-history-service">
                            {(appt.appointment_pets && appt.appointment_pets.length > 0)
                              ? appt.appointment_pets
                                  .map(ap => ap.services && ap.services.service_name)
                                  .filter(Boolean)
                                  .join(' · ') || 'Service'
                              : (appt.services?.service_name || 'Service')}
                          </span>
                          <span className="cp-history-status" style={{ background: getStatusColor(appt.status) + '20', color: getStatusColor(appt.status) }}>
                            {appt.status}
                          </span>
                        </div>
                        <div className="cp-history-meta">
                          <span>🐾 {
                            (appt.appointment_pets && appt.appointment_pets.length > 0)
                              ? appt.appointment_pets
                                  .map(ap => ap.pets && ap.pets.name)
                                  .filter(Boolean)
                                  .join(', ')
                              : (appt.pets?.name || 'Unknown Pet')
                          }</span>
                          <span>🕐 {formatTime(appt.start_time)} — {formatTime(appt.end_time)}</span>
                          {appt.services?.time_block_minutes && <span>⏱️ {appt.services.time_block_minutes} min</span>}
                        </div>
                        {appt.service_notes && (
                          <div className="cp-history-notes">📝 {appt.service_notes}</div>
                        )}
                        {appt.has_flags && appt.flag_details && (
                          <div className="cp-history-flags">🚩 {appt.flag_details}</div>
                        )}
                      </div>
                      <div className="cp-history-right">
                        <div className="cp-history-price">
                          ${parseFloat(appt.final_price || appt.quoted_price || 0).toFixed(2)}
                        </div>
                        <button
                          className="cp-history-book-again"
                          onClick={() => handleBookAgain(appt.pet_id, appt.service_id)}
                          title="Rebook this exact service for this pet"
                        >
                          📅 Book Again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════ PAST BOARDING TAB ═══════ */}
        {activeTab === 'boarding' && (
          <div className="cp-boarding">
            {loadingTab ? (
              <div className="cp-tab-loading">🐾 Loading boarding history...</div>
            ) : boardingHistory.length === 0 ? (
              <div className="cp-empty-tab">
                <div className="cp-empty-icon">🏠</div>
                <p>No boarding reservations yet</p>
              </div>
            ) : (
              <>
                {/* Summary Bar */}
                <div className="cp-summary-bar">
                  <div className="cp-summary-item">
                    <span className="cp-summary-number">{boardingHistory.length}</span>
                    <span className="cp-summary-label">Total Stays</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number">{totalBoardingNights}</span>
                    <span className="cp-summary-label">Total Nights</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number cp-summary-money">${totalBoardingSpent.toFixed(2)}</span>
                    <span className="cp-summary-label">Total Spent</span>
                  </div>
                </div>

                {/* Reservation List */}
                <div className="cp-history-list">
                  {boardingHistory.map(res => {
                    const nights = Math.max(1, Math.round((new Date(res.end_date) - new Date(res.start_date)) / (1000 * 60 * 60 * 24)))
                    const petNames = res.boarding_reservation_pets?.map(brp => brp.pets?.name).filter(Boolean).join(', ') || 'Unknown Pet'
                    return (
                      <div key={res.id} className="cp-history-item">
                        <div className="cp-history-date-col">
                          <span className="cp-history-month">{new Date(res.start_date).toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="cp-history-day">{new Date(res.start_date).getDate()}</span>
                          <span className="cp-history-year">{new Date(res.start_date).getFullYear()}</span>
                        </div>
                        <div className="cp-history-details">
                          <div className="cp-history-top-row">
                            <span className="cp-history-service">🏠 Boarding — {nights} Night{nights !== 1 ? 's' : ''}</span>
                            <span className="cp-history-status" style={{ background: getStatusColor(res.status) + '20', color: getStatusColor(res.status) }}>
                              {res.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="cp-history-meta">
                            <span>🐾 {petNames}</span>
                            <span>📅 {formatDate(res.start_date)} → {formatDate(res.end_date)}</span>
                            {res.kennels?.name && <span>🏨 Kennel: {res.kennels.name}</span>}
                          </div>
                          {res.notes && (
                            <div className="cp-history-notes">📝 {res.notes}</div>
                          )}
                        </div>
                        <div className="cp-history-price">
                          ${parseFloat(res.total_price || 0).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════ VACCINATIONS TAB ═══════ */}
        {activeTab === 'vaccinations' && (
          <div className="cp-vaccinations">
            {loadingTab ? (
              <div className="cp-tab-loading">🐾 Loading vaccination records...</div>
            ) : pets.length === 0 ? (
              <div className="cp-empty-tab">
                <div className="cp-empty-icon">💉</div>
                <p>Add pets first to track vaccinations</p>
              </div>
            ) : (
              <div className="cp-vax-by-pet">
                {pets.map(pet => {
                  const petVax = vaccinations.filter(v => v.pet_id === pet.id)
                  return (
                    <div key={pet.id} className="cp-vax-pet-section">
                      <div className="cp-vax-pet-header">
                        <div className="cp-pet-avatar-sm" style={{ background: getPetAvatar(pet) }}>
                          {pet.name?.[0]}
                        </div>
                        <h4>{pet.name}</h4>
                        <span className="cp-vax-pet-breed">{pet.breed}</span>
                      </div>

                      {petVax.length === 0 ? (
                        <div className="cp-vax-none">No vaccination records on file</div>
                      ) : (
                        <div className="cp-vax-list">
                          {petVax.map(vax => {
                            const status = getVaxStatus(vax.expiration_date)
                            return (
                              <div key={vax.id} className="cp-vax-row" style={{ borderLeft: `4px solid ${status === 'current' ? '#16a34a' : status === 'due_soon' ? '#f59e0b' : '#dc2626'}` }}>
                                <div className="cp-vax-type">
                                  {vax.vaccine_type === 'rabies' ? '🔴' : vax.vaccine_type === 'dhpp' ? '🟡' : vax.vaccine_type === 'bordetella' ? '🟢' : '💉'}{' '}
                                  {(vax.vaccine_type || 'other').toUpperCase()}
                                  {vax.vaccine_name && vax.vaccine_name !== vax.vaccine_type && (
                                    <span className="cp-vax-brand"> ({vax.vaccine_name})</span>
                                  )}
                                </div>
                                <div className="cp-vax-dates">
                                  <span>Given: {formatDate(vax.administered_date)}</span>
                                  <span>Expires: {formatDate(vax.expiration_date)}</span>
                                </div>
                                <div className="cp-vax-status-pill" style={getVaxStatusStyle(status)}>
                                  {status === 'current' ? '✅ Current' : status === 'due_soon' ? '⚠️ Due Soon' : '❌ Expired'}
                                </div>
                                {vax.vet_clinic && <div className="cp-vax-clinic">🏥 {vax.vet_clinic}</div>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════ PAYMENTS TAB ═══════ */}
        {activeTab === 'payments' && (() => {
          // Compute summary totals from REAL payment records
          const totalPaid = clientPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
          const totalTips = clientPayments.reduce((sum, p) => sum + parseFloat(p.tip_amount || 0), 0)
          const methodIcon = (m) => m === 'cash' ? '💵' : m === 'zelle' ? '⚡' : m === 'venmo' ? '🔵' : m === 'card' ? '💳' : m === 'check' ? '📝' : '•'

          // Payment breakdown by method
          const byMethod = clientPayments.reduce((acc, p) => {
            const method = p.method || 'other'
            const total = parseFloat(p.amount || 0) + parseFloat(p.tip_amount || 0)
            acc[method] = (acc[method] || 0) + total
            return acc
          }, {})

          return (
            <div className="cp-payments">
              {loadingTab ? (
                <div className="cp-tab-loading">🐾 Loading payment history...</div>
              ) : (
                <>
                  {/* Outstanding Balance Card (Phase C - Step 3) */}
                  {clientOutstanding.total > 0 && (
                    <div className="cp-outstanding-card">
                      <div className="cp-outstanding-head">
                        <div>
                          <div className="cp-outstanding-label">Outstanding Balance</div>
                          <div className="cp-outstanding-amount">${clientOutstanding.total.toFixed(2)}</div>
                        </div>
                        <div className="cp-outstanding-count">
                          {clientOutstanding.appointments.length} appointment{clientOutstanding.appointments.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="cp-outstanding-list">
                        {clientOutstanding.appointments.map(a => (
                          <div key={a.id} className="cp-outstanding-row">
                            <div className="cp-outstanding-row-info">
                              <div className="cp-outstanding-row-head">
                                🐾 {a.petName} · ✂️ {a.serviceName}
                              </div>
                              <div className="cp-outstanding-row-sub">
                                {new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {a.paid > 0 && (
                                  <span className="cp-outstanding-row-partial"> · ${a.paid.toFixed(2)} of ${a.totalDue.toFixed(2)} paid</span>
                                )}
                              </div>
                            </div>
                            <div className="cp-outstanding-row-balance">${a.balance.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {clientPayments.length === 0 && clientOutstanding.total === 0 ? (
                    <div className="cp-empty-tab">
                      <div className="cp-empty-icon">💳</div>
                      <p>No payment history yet</p>
                      <p className="cp-empty-sub">Payments will appear here once you take payment at checkout</p>
                    </div>
                  ) : clientPayments.length === 0 ? (
                    <div className="cp-empty-tab" style={{ marginTop: '20px' }}>
                      <div className="cp-empty-icon">💳</div>
                      <p>No payments recorded yet</p>
                      <p className="cp-empty-sub">This client has appointments checked out but hasn't paid</p>
                    </div>
                  ) : (
                    <>
                  {/* Payment Summary */}
                  <div className="cp-summary-bar">
                    <div className="cp-summary-item">
                      <span className="cp-summary-number cp-summary-money">${(totalPaid + totalTips).toFixed(2)}</span>
                      <span className="cp-summary-label">Lifetime Paid</span>
                    </div>
                    <div className="cp-summary-item">
                      <span className="cp-summary-number cp-summary-money">${totalPaid.toFixed(2)}</span>
                      <span className="cp-summary-label">Services</span>
                    </div>
                    <div className="cp-summary-item">
                      <span className="cp-summary-number cp-summary-money">${totalTips.toFixed(2)}</span>
                      <span className="cp-summary-label">Tips</span>
                    </div>
                  </div>

                  {/* Breakdown by payment method */}
                  <div className="cp-method-breakdown">
                    <div className="cp-method-breakdown-label">By Payment Method</div>
                    <div className="cp-method-breakdown-chips">
                      {Object.entries(byMethod).map(([method, total]) => (
                        <div key={method} className="cp-method-chip">
                          <span className="cp-method-chip-icon">{methodIcon(method)}</span>
                          <span className="cp-method-chip-label">{method.toUpperCase()}</span>
                          <span className="cp-method-chip-amount">${total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Records Timeline */}
                  <div className="cp-payments-timeline">
                    <div className="cp-payments-timeline-label">All Payments</div>
                    {clientPayments.map(p => {
                      const date = new Date(p.created_at)
                      const apptPrice = parseFloat(p.appointments?.final_price || p.appointments?.quoted_price || 0)
                      return (
                        <div key={p.id} className="cp-real-payment-row">
                          <div className="cp-history-date-col">
                            <span className="cp-history-month">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                            <span className="cp-history-day">{date.getDate()}</span>
                            <span className="cp-history-year">{date.getFullYear()}</span>
                          </div>
                          <div className="cp-real-payment-info">
                            <div className="cp-real-payment-head">
                              <span className="cp-real-payment-method">
                                {methodIcon(p.method)} {p.method.toUpperCase()}
                              </span>
                              <span className="cp-real-payment-time">
                                {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="cp-real-payment-sub">
                              {/* Grooming row */}
                              {p.appointments?.services?.service_name && (
                                <span>✂️ {p.appointments.services.service_name}</span>
                              )}
                              {p.appointments?.pets?.name && (
                                <span>🐾 {p.appointments.pets.name}</span>
                              )}
                              {/* Boarding row — show date range + pet names */}
                              {!p.appointments && p.boarding_reservations && (() => {
                                const br = p.boarding_reservations
                                const fmt = (d) => {
                                  if (!d) return ''
                                  const dd = new Date(d + 'T00:00:00')
                                  return (dd.getMonth() + 1) + '/' + dd.getDate()
                                }
                                const range = (br.start_date || br.end_date)
                                  ? fmt(br.start_date) + (br.end_date ? ' → ' + fmt(br.end_date) : '')
                                  : ''
                                const pets = (br.boarding_reservation_pets || [])
                                  .map(bp => bp.pets && bp.pets.name)
                                  .filter(Boolean)
                                  .join(', ')
                                return (
                                  <>
                                    <span>🏠 Boarding {range}</span>
                                    {pets && <span>🐾 {pets}</span>}
                                  </>
                                )
                              })()}
                              {/* Truly orphan — neither appointment nor boarding */}
                              {!p.appointments && !p.boarding_reservations && (
                                <span className="cp-real-payment-orphan">Payment (no appointment link)</span>
                              )}
                            </div>
                            {p.notes && <div className="cp-real-payment-notes">"{p.notes}"</div>}
                          </div>
                          <div className="cp-real-payment-amounts">
                            <div className="cp-history-price">${parseFloat(p.amount).toFixed(2)}</div>
                            {parseFloat(p.tip_amount) > 0 && (
                              <div className="cp-real-payment-tip">+ ${parseFloat(p.tip_amount).toFixed(2)} tip</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* ═══════ CONTACTS TAB (Task #97 / #98) ═══════ */}
        {/* Multi-contact support: spouse, pickup people, emergency, vet, etc. */}
        {activeTab === 'contacts' && (
          <div className="cp-contacts">
            {/* Explainer card */}
            <div className="cp-card" style={{ marginBottom: '16px', background: '#faf5ff', border: '1px solid #ddd6fe' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '22px' }}>📞</span>
                <div>
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>Additional contacts for {client.first_name}</div>
                  <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                    Spouse, pickup people, pet sitters, vet, emergency — anyone who might drop off, pick up, or need to be called. The <strong>primary</strong> phone on this client's profile stays where it is — this is for <em>extra</em> people.
                  </div>
                </div>
              </div>
            </div>

            {/* Existing contacts list */}
            {loadingTab ? (
              <div className="cp-loading">Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                No extra contacts yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                {contacts.map(function (c) {
                  const fullName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim()
                  return (
                    <div
                      key={c.id}
                      className="cp-card"
                      style={{
                        borderLeft: c.is_emergency ? '4px solid #dc2626' : '4px solid #7c3aed',
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '15px' }}>{fullName}</strong>
                            {c.relationship && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                                background: '#ede9fe', color: '#6d28d9', fontWeight: '600'
                              }}>{c.relationship}</span>
                            )}
                            {c.is_emergency && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                                background: '#fee2e2', color: '#991b1b', fontWeight: '700'
                              }}>🚨 EMERGENCY</span>
                            )}
                            {!c.can_pickup && (
                              <span style={{
                                fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                                background: '#fef3c7', color: '#92400e', fontWeight: '600'
                              }}>NOT AUTHORIZED TO PICKUP</span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#374151', marginBottom: '2px' }}>
                            📞 <a href={'tel:' + c.phone} style={{ color: '#7c3aed', textDecoration: 'none' }}>{formatPhone(c.phone)}</a>
                          </div>
                          {c.email && (
                            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '2px' }}>
                              ✉️ {c.email}
                            </div>
                          )}
                          {c.notes && (
                            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
                              {c.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={function () { startEditContact(c) }}
                            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={function () { deleteContact(c.id) }}
                            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add / Edit form */}
            {!showContactForm ? (
              <button
                type="button"
                onClick={function () { resetContactForm(); setShowContactForm(true) }}
                style={{
                  width: '100%', padding: '14px', background: '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                + Add a contact
              </button>
            ) : (
              <div className="cp-card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>
                  {editingContactId ? 'Edit contact' : 'Add a contact'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={contactLabelStyle}>
                    First name *
                    <input
                      type="text"
                      value={contactForm.first_name}
                      onChange={function (e) { setContactForm({ ...contactForm, first_name: e.target.value }) }}
                      style={contactInputStyle}
                    />
                  </label>
                  <label style={contactLabelStyle}>
                    Last name
                    <input
                      type="text"
                      value={contactForm.last_name}
                      onChange={function (e) { setContactForm({ ...contactForm, last_name: e.target.value }) }}
                      style={contactInputStyle}
                    />
                  </label>
                  <label style={contactLabelStyle}>
                    Phone *
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={function (e) { setContactForm({ ...contactForm, phone: formatPhoneOnInput(e.target.value) }) }}
                      placeholder="713-098-3746"
                      style={contactInputStyle}
                    />
                  </label>
                  <label style={contactLabelStyle}>
                    Email
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={function (e) { setContactForm({ ...contactForm, email: e.target.value }) }}
                      style={contactInputStyle}
                    />
                  </label>
                  <label style={{ ...contactLabelStyle, gridColumn: '1 / -1' }}>
                    Relationship (who they are)
                    <input
                      type="text"
                      list="contact-relationship-options"
                      value={contactForm.relationship}
                      onChange={function (e) { setContactForm({ ...contactForm, relationship: e.target.value }) }}
                      placeholder="e.g. Spouse, Pickup person, Vet, Mom"
                      style={contactInputStyle}
                    />
                    <datalist id="contact-relationship-options">
                      {CONTACT_RELATIONSHIP_SUGGESTIONS.map(function (r) {
                        return <option key={r} value={r} />
                      })}
                    </datalist>
                  </label>
                  <label style={{ ...contactLabelStyle, gridColumn: '1 / -1' }}>
                    Notes
                    <textarea
                      value={contactForm.notes}
                      onChange={function (e) { setContactForm({ ...contactForm, notes: e.target.value }) }}
                      placeholder="e.g. Only picks up Tuesdays, Call after 5pm"
                      rows={2}
                      style={{ ...contactInputStyle, resize: 'vertical' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '18px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={contactForm.is_emergency}
                      onChange={function (e) { setContactForm({ ...contactForm, is_emergency: e.target.checked }) }}
                    />
                    🚨 Emergency contact
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={contactForm.can_pickup}
                      onChange={function (e) { setContactForm({ ...contactForm, can_pickup: e.target.checked }) }}
                    />
                    Authorized to pick up pet
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button
                    type="button"
                    onClick={resetContactForm}
                    disabled={savingContact}
                    style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveContact}
                    disabled={savingContact}
                    style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', opacity: savingContact ? 0.6 : 1 }}
                  >
                    {savingContact ? 'Saving...' : (editingContactId ? 'Save changes' : 'Add contact')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ NOTES TAB ═══════ */}
        {activeTab === 'notes' && (
          <div className="cp-notes">
            {/* Add Note Form */}
            <div className="cp-card">
              <h3 className="cp-card-title">📝 Add a Note</h3>

              {/* Note Type Selector */}
              <div className="cp-note-type-row">
                <button
                  className={`cp-note-type-btn ${noteType === 'client' ? 'cp-note-type-active' : ''}`}
                  onClick={() => { setNoteType('client'); setNoteForPet('') }}
                >
                  📋 Client Note
                </button>
                <button
                  className={`cp-note-type-btn cp-note-type-groom ${noteType === 'grooming' ? 'cp-note-type-groom-active' : ''}`}
                  onClick={() => setNoteType('grooming')}
                >
                  ✂️ Grooming Note
                </button>
              </div>

              {/* Grooming note: pick a pet */}
              {noteType === 'grooming' && pets.length > 0 && (
                <div className="cp-note-pet-picker">
                  <label className="cp-note-pet-label">Which pet is this note for?</label>
                  <div className="cp-note-pet-options">
                    {pets.map(pet => (
                      <button
                        key={pet.id}
                        className={`cp-note-pet-chip ${noteForPet === pet.id ? 'cp-note-pet-chip-active' : ''}`}
                        onClick={() => setNoteForPet(pet.id)}
                      >
                        <span className="cp-note-pet-chip-avatar" style={{ background: getPetAvatar(pet) }}>{pet.name?.[0]}</span>
                        {pet.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                className="cp-note-input"
                placeholder={noteType === 'client'
                  ? 'Client note... (e.g., always 10 min late, prefers text, cash only, very picky about ears)'
                  : 'Grooming note... (e.g., #3 blade on body, scissors on face, hates feet touched, matting behind ears)'
                }
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={3}
              />
              <button
                className="cp-btn-save-note"
                onClick={saveNote}
                disabled={!newNote.trim() || savingNote}
              >
                {savingNote ? 'Saving...' : '🐾 Save Note'}
              </button>
            </div>

            {/* ── CLIENT NOTES SECTION ── */}
            <div className="cp-notes-section">
              <div className="cp-notes-section-header">
                <h3>📋 Client Notes</h3>
                <span className="cp-notes-count">{clientNotes.length}</span>
              </div>

              {clientNotes.length > 0 ? (
                <div className="cp-notes-list">
                  {clientNotes.map(note => (
                    <div key={note.id} className="cp-note-item cp-note-item-client">
                      <div className="cp-note-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className="cp-note-badge-client">📋 Client</span>
                          <span className="cp-note-date">{formatDate(note.created_at)}</span>
                          {note.updated_at && note.updated_at !== note.created_at && (
                            <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>· edited</span>
                          )}
                        </div>
                        {editingNoteId !== note.id && (
                          <button
                            onClick={() => startEditNote(note)}
                            style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                          >
                            ✏️ Edit
                          </button>
                        )}
                      </div>
                      {editingNoteId === note.id ? (
                        <div style={{ marginTop: '6px' }}>
                          <textarea
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            rows={3}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                            <button
                              onClick={cancelEditNote}
                              disabled={savingEdit}
                              style={{ padding: '6px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEditNote}
                              disabled={savingEdit || !editingNoteText.trim()}
                              style={{ padding: '6px 12px', background: savingEdit ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                            >
                              {savingEdit ? 'Saving…' : '💾 Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="cp-note-text">{note.content}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : client.notes ? (
                <div className="cp-note-item cp-note-item-client">
                  <div className="cp-note-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span className="cp-note-badge-client">📋 Imported Notes</span>
                    {editingNoteId !== '__imported__' && (
                      <button
                        onClick={() => { setEditingNoteId('__imported__'); setEditingNoteText(client.notes || '') }}
                        style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                  {editingNoteId === '__imported__' ? (
                    <div style={{ marginTop: '6px' }}>
                      <textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        rows={4}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                          onClick={cancelEditNote}
                          disabled={savingEdit}
                          style={{ padding: '6px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!editingNoteText.trim()) return
                            setSavingEdit(true)
                            const { error: upErr } = await supabase
                              .from('clients')
                              .update({ notes: editingNoteText.trim() })
                              .eq('id', id)
                            if (upErr) {
                              alert('Error saving: ' + upErr.message)
                              setSavingEdit(false)
                              return
                            }
                            setEditingNoteId(null)
                            setEditingNoteText('')
                            setSavingEdit(false)
                            // Refresh client data so the note shows updated text
                            fetchClientAndPets()
                          }}
                          disabled={savingEdit || !editingNoteText.trim()}
                          style={{ padding: '6px 12px', background: savingEdit ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          {savingEdit ? 'Saving…' : '💾 Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cp-note-text" style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</div>
                  )}
                </div>
              ) : (
                <div className="cp-notes-empty-mini">No client notes yet</div>
              )}
            </div>

            {/* ── GROOMING NOTES SECTION ── */}
            <div className="cp-notes-section">
              <div className="cp-notes-section-header">
                <h3>✂️ Grooming Notes</h3>
                <span className="cp-notes-count">{groomingNotes.length}</span>
              </div>

              {groomingNotes.length > 0 ? (
                <div className="cp-notes-list">
                  {/* Group by pet */}
                  {pets.map(pet => {
                    const petNotes = groomingNotes.filter(n => n.pet_id === pet.id)
                    if (petNotes.length === 0) return null
                    return (
                      <div key={pet.id} className="cp-groom-notes-pet">
                        <div className="cp-groom-notes-pet-header">
                          <div className="cp-pet-avatar-sm" style={{ background: getPetAvatar(pet) }}>
                            {pet.name?.[0]}
                          </div>
                          <span className="cp-groom-notes-pet-name">{pet.name}</span>
                          <span className="cp-groom-notes-pet-breed">{pet.breed}</span>
                        </div>
                        {petNotes.map(note => (
                          <div key={note.id} className="cp-note-item cp-note-item-groom">
                            <div className="cp-note-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="cp-note-badge-groom">✂️ Grooming</span>
                                <span className="cp-note-date">{formatDate(note.created_at)}</span>
                                {note.updated_at && note.updated_at !== note.created_at && (
                                  <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>· edited</span>
                                )}
                              </div>
                              {editingNoteId !== note.id && (
                                <button
                                  onClick={() => startEditNote(note)}
                                  style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                                >
                                  ✏️ Edit
                                </button>
                              )}
                            </div>
                            {editingNoteId === note.id ? (
                              <div style={{ marginTop: '6px' }}>
                                <textarea
                                  value={editingNoteText}
                                  onChange={(e) => setEditingNoteText(e.target.value)}
                                  rows={3}
                                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                                  <button
                                    onClick={cancelEditNote}
                                    disabled={savingEdit}
                                    style={{ padding: '6px 12px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={saveEditNote}
                                    disabled={savingEdit || !editingNoteText.trim()}
                                    style={{ padding: '6px 12px', background: savingEdit ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                  >
                                    {savingEdit ? 'Saving…' : '💾 Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="cp-note-text">{note.content}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {/* Grooming notes without a pet_id */}
                  {groomingNotes.filter(n => !n.pet_id || !pets.find(p => p.id === n.pet_id)).map(note => (
                    <div key={note.id} className="cp-note-item cp-note-item-groom">
                      <div className="cp-note-header-row">
                        <span className="cp-note-badge-groom">✂️ Grooming</span>
                        <span className="cp-note-date">{formatDate(note.created_at)}</span>
                      </div>
                      <div className="cp-note-text">{note.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cp-notes-empty-mini">
                  No grooming notes yet — add cut styles, handling tips, and preferences above!
                </div>
              )}

              {/* Quick grooming reference from pet records */}
              {pets.some(p => p.grooming_notes) && (
                <div className="cp-groom-imported">
                  <div className="cp-groom-imported-title">📌 From Pet Profiles</div>
                  {pets.filter(p => p.grooming_notes).map(pet => (
                    <div key={pet.id} className="cp-groom-imported-item">
                      <strong>{pet.name}:</strong> {pet.grooming_notes}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════ AGREEMENTS TAB ═══════ */}
        {activeTab === 'agreements' && (
          <div className="cp-card">
            <h3 className="cp-card-title">📜 Signed Agreements</h3>
            {loadingAgreements ? (
              <div style={{ padding: '20px', color: '#6b7280' }}>Loading…</div>
            ) : signedAgreements.length === 0 ? (
              <div style={{ padding: '20px', color: '#6b7280', fontStyle: 'italic' }}>
                No agreements signed yet. The client will be prompted to sign at first portal login.
              </div>
            ) : (
              signedAgreements.map((sig) => (
                <div key={sig.id} style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
                      {sig.agreements?.type === 'grooming' ? '✂️' : '🏠'} {sig.agreements?.title || 'Agreement'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Signed {new Date(sig.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' at '}
                      {new Date(sig.signed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Typed signature */}
                  {sig.signature_text && (
                    <div style={{ fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                      <strong>Typed name:</strong>{' '}
                      <span style={{ fontFamily: 'cursive', fontSize: '15px', color: '#111827' }}>
                        {sig.signature_text}
                      </span>
                    </div>
                  )}

                  {/* Drawn signature image */}
                  {sig.signature_image && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Drawn signature:</div>
                      <img
                        src={sig.signature_image}
                        alt="Drawn signature"
                        style={{
                          maxWidth: '300px',
                          maxHeight: '100px',
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '4px',
                        }}
                      />
                    </div>
                  )}

                  {sig.user_agent && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', fontStyle: 'italic' }}>
                      Device: {sig.user_agent.slice(0, 80)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* ═══════ MERGE CLIENTS MODAL ═══════ */}
      {showMergeModal && (
        <div
          onClick={function () { setShowMergeModal(false) }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            onClick={function (e) { e.stopPropagation() }}
            style={{
              background: '#fff', borderRadius: '16px', padding: '24px',
              maxWidth: '520px', width: '100%', maxHeight: '80vh',
              overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '800' }}>
              🔀 Merge {client.first_name} into another client
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
              Search for the client you want to merge this one INTO. All pets, appointments, payments, notes, and contacts will move there. This record will be deleted.
            </p>

            <input
              type="text"
              autoFocus
              placeholder="Search by name or phone..."
              value={mergeSearch}
              onChange={function (e) { searchMergeCandidates(e.target.value) }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px', fontSize: '15px',
                border: '1px solid #d1d5db', borderRadius: '10px', marginBottom: '14px'
              }}
            />

            {mergeSearching && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: '13px' }}>
                Searching...
              </div>
            )}

            {!mergeSearching && mergeSearch.trim().length >= 2 && mergeCandidates.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: '13px' }}>
                No other clients match "{mergeSearch}".
              </div>
            )}

            {mergeCandidates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {mergeCandidates.map(function (c) {
                  const fullName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim()
                  return (
                    <button
                      key={c.id}
                      onClick={function () { confirmMerge(c) }}
                      disabled={merging}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', background: '#f9fafb',
                        border: '1px solid #e5e7eb', borderRadius: '10px',
                        cursor: merging ? 'wait' : 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827' }}>{fullName || 'Unnamed'}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          {formatPhone(c.phone) || 'No phone'} {c.email && '· ' + c.email}
                          {c.user_id && <span style={{ marginLeft: '6px', padding: '1px 6px', background: '#ede9fe', color: '#6d28d9', borderRadius: '999px', fontSize: '10px', fontWeight: '700' }}>HAS LOGIN</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '13px', color: '#7c3aed', fontWeight: '700' }}>Merge →</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={function () { setShowMergeModal(false) }}
                disabled={merging}
                style={{
                  padding: '10px 18px', background: '#f1f5f9', color: '#475569',
                  border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
