import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TABS = [
  { key: 'overview', label: '🐾 Overview' },
  { key: 'upcoming', label: '📅 Upcoming' },
  { key: 'grooming', label: '✂️ Past Grooming' },
  { key: 'boarding', label: '🏠 Past Boarding' },
  { key: 'vaccinations', label: '💉 Vaccinations' },
  { key: 'payments', label: '💳 Payments' },
  { key: 'notes', label: '📝 Notes' },
]

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
  const [clientPayments, setClientPayments] = useState([]) // actual payment records from payments table
  const [clientOutstanding, setClientOutstanding] = useState({ total: 0, appointments: [] })
  const [upcomingAppts, setUpcomingAppts] = useState([])
  const [upcomingCount, setUpcomingCount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  // Most recent completed appointment per pet — used by "Book Again" buttons to pre-fill the calendar form
  const [lastApptPerPet, setLastApptPerPet] = useState({})
  // Most recent completed appointment overall for this client (for the header "Book Again" button)
  const [lastApptOverall, setLastApptOverall] = useState(null)

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
  }, [activeTab, id])

  // Fetch ALL real payments for this client (from payments table)
  const fetchClientPayments = async () => {
    setLoadingTab(true)
    try {
      // 1. Get payment history
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
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        pets(id, name, breed),
        services(id, service_name, price, time_block_minutes)
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
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        pets(id, name, breed),
        services(id, service_name, price, time_block_minutes)
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
          <button
            className="cp-book-again-btn"
            onClick={handleBookAgainFromHeader}
            title={lastApptOverall ? `Rebook last service` : 'No history to rebook from'}
          >
            📅 Book Again
          </button>
        </div>
        <div className="cp-header-row">
          <div className="cp-avatar-big" style={{ background: getPetAvatar({ name: client.first_name }) }}>
            {client.first_name?.[0]}{client.last_name?.[0]}
          </div>
          <div className="cp-header-info">
            <h1 className="cp-name">
              {client.first_name} {client.last_name}
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
              <span>📞 {client.phone || 'No phone'}</span>
              {client.email && (
                <>
                  <span className="cp-stat-dot">·</span>
                  <span>📧 {client.email}</span>
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
              <h3 className="cp-card-title">📋 Contact Information</h3>
              <div className="cp-contact-grid">
                <div className="cp-contact-item">
                  <span className="cp-contact-label">Phone</span>
                  <span className="cp-contact-value">{client.phone || 'Not provided'}</span>
                </div>
                <div className="cp-contact-item">
                  <span className="cp-contact-label">Email</span>
                  <span className="cp-contact-value">{client.email || 'Not provided'}</span>
                </div>
                <div className="cp-contact-item">
                  <span className="cp-contact-label">Preferred Contact</span>
                  <span className="cp-contact-value">{client.preferred_contact || 'Not set'}</span>
                </div>
                <div className="cp-contact-item">
                  <span className="cp-contact-label">Address</span>
                  <span className="cp-contact-value">{client.address || 'Not provided'}</span>
                </div>
              </div>
              {client.notes && (
                <div className="cp-client-notes-preview">
                  <strong>Notes:</strong> {client.notes}
                </div>
              )}
            </div>

            {/* Pets Section */}
            <div className="cp-card">
              <div className="cp-card-title-row">
                <h3 className="cp-card-title">🐾 Pets ({pets.length})</h3>
                <Link to={`/clients/${id}/pets/new`} className="cp-btn-add">+ Add Pet</Link>
              </div>

              {pets.length === 0 ? (
                <div className="cp-empty">No pets added yet. Add this client's first pet!</div>
              ) : (
                <div className="cp-pets-grid">
                  {pets.map(pet => {
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
                          <span className="cp-history-service">{appt.services?.service_name || 'Service'}</span>
                          {isOverdue && (
                            <span className="cp-upcoming-overdue-badge">⚠️ Overdue — needs action</span>
                          )}
                          <span className="cp-history-status" style={{ background: getStatusColor(appt.status) + '20', color: getStatusColor(appt.status) }}>
                            {appt.status}
                          </span>
                        </div>
                        <div className="cp-history-meta">
                          <span>🐾 {appt.pets?.name || 'Unknown Pet'}</span>
                          <span>🕐 {formatTime(appt.start_time)} — {formatTime(appt.end_time)}</span>
                          {appt.services?.time_block_minutes && <span>⏱️ {appt.services.time_block_minutes} min</span>}
                        </div>
                        {appt.service_notes && (
                          <div className="cp-history-notes">📝 {appt.service_notes}</div>
                        )}
                      </div>
                      <div className="cp-upcoming-actions">
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
                          <span className="cp-history-service">{appt.services?.service_name || 'Service'}</span>
                          <span className="cp-history-status" style={{ background: getStatusColor(appt.status) + '20', color: getStatusColor(appt.status) }}>
                            {appt.status}
                          </span>
                        </div>
                        <div className="cp-history-meta">
                          <span>🐾 {appt.pets?.name || 'Unknown Pet'}</span>
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
                              {p.appointments?.services?.service_name && (
                                <span>✂️ {p.appointments.services.service_name}</span>
                              )}
                              {p.appointments?.pets?.name && (
                                <span>🐾 {p.appointments.pets.name}</span>
                              )}
                              {!p.appointments && <span className="cp-real-payment-orphan">Payment (no appointment link)</span>}
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
                      <div className="cp-note-header-row">
                        <span className="cp-note-badge-client">📋 Client</span>
                        <span className="cp-note-date">{formatDate(note.created_at)}</span>
                      </div>
                      <div className="cp-note-text">{note.content}</div>
                    </div>
                  ))}
                </div>
              ) : client.notes ? (
                <div className="cp-note-item cp-note-item-client">
                  <div className="cp-note-header-row">
                    <span className="cp-note-badge-client">📋 Imported Notes</span>
                  </div>
                  <div className="cp-note-text" style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</div>
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
                            <div className="cp-note-header-row">
                              <span className="cp-note-badge-groom">✂️ Grooming</span>
                              <span className="cp-note-date">{formatDate(note.created_at)}</span>
                            </div>
                            <div className="cp-note-text">{note.content}</div>
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

      </div>
    </div>
  )
}
