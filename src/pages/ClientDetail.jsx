import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TABS = [
  { key: 'overview', label: '🐾 Overview' },
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

  useEffect(() => {
    fetchClientAndPets()
  }, [id])

  useEffect(() => {
    if (activeTab === 'grooming') fetchGroomingHistory()
    if (activeTab === 'boarding') fetchBoardingHistory()
    if (activeTab === 'vaccinations') fetchVaccinations()
    if (activeTab === 'notes') fetchNotes()
  }, [activeTab, id])

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

    // Fetch client notes
    const { data: cnData, error: cnError } = await supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (!cnError) {
      // Separate client notes from grooming notes by note_type field
      const allNotes = cnData || []
      setClientNotes(allNotes.filter(n => n.note_type !== 'grooming'))
      setGroomingNotes(allNotes.filter(n => n.note_type === 'grooming'))
    } else {
      // Table might not exist yet — we'll handle with fallback
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

    // Try to save to client_notes table with note_type
    const noteData = {
      client_id: id,
      note: newNote.trim(),
      note_type: noteType,
      pet_id: noteType === 'grooming' ? noteForPet : null,
      created_by: client.groomer_id,
    }

    const { error } = await supabase
      .from('client_notes')
      .insert(noteData)

    if (!error) {
      setNewNote('')
      setNoteForPet('')
      fetchNotes()
    } else {
      // Fallback: if table doesn't have the new columns yet, try basic insert
      const { error: fallbackError } = await supabase
        .from('client_notes')
        .insert({
          client_id: id,
          note: `[${noteType === 'grooming' ? '✂️ GROOMING' : '📋 CLIENT'}] ${newNote.trim()}`,
          created_by: client.groomer_id,
        })

      if (!fallbackError) {
        setNewNote('')
        setNoteForPet('')
        fetchNotes()
      } else {
        // Last fallback: update client.notes text field
        const existingNotes = client.notes || ''
        const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const prefix = noteType === 'grooming' ? '✂️' : '📋'
        const petName = noteType === 'grooming' && noteForPet ? ` [${getPetName(noteForPet)}]` : ''
        const updatedNotes = `[${timestamp}] ${prefix}${petName} ${newNote.trim()}\n${existingNotes}`

        await supabase.from('clients').update({ notes: updatedNotes }).eq('id', id)
        setClient({ ...client, notes: updatedNotes })
        setNewNote('')
        setNoteForPet('')
      }
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
        <Link to="/clients" className="cp-back">← Back to Clients</Link>
        <div className="cp-header-row">
          <div className="cp-avatar-big" style={{ background: getPetAvatar({ name: client.first_name }) }}>
            {client.first_name?.[0]}{client.last_name?.[0]}
          </div>
          <div className="cp-header-info">
            <h1 className="cp-name">
              {client.first_name} {client.last_name}
              {client.is_first_time && <span className="cp-badge-new">New Client</span>}
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
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
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
                      <div className="cp-history-price">
                        ${parseFloat(appt.final_price || appt.quoted_price || 0).toFixed(2)}
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
        {activeTab === 'payments' && (
          <div className="cp-payments">
            {/* Combined grooming + boarding payment history */}
            {groomingHistory.length === 0 && boardingHistory.length === 0 ? (
              <>
                {loadingTab ? (
                  <div className="cp-tab-loading">🐾 Loading payment history...</div>
                ) : (
                  <div className="cp-empty-tab">
                    <div className="cp-empty-icon">💳</div>
                    <p>No payment history yet</p>
                    <p className="cp-empty-sub">Payments will appear here after grooming or boarding appointments</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Payment Summary */}
                <div className="cp-summary-bar">
                  <div className="cp-summary-item">
                    <span className="cp-summary-number cp-summary-money">${(totalGroomingSpent + totalBoardingSpent).toFixed(2)}</span>
                    <span className="cp-summary-label">Lifetime Spend</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number cp-summary-money">${totalGroomingSpent.toFixed(2)}</span>
                    <span className="cp-summary-label">Grooming</span>
                  </div>
                  <div className="cp-summary-item">
                    <span className="cp-summary-number cp-summary-money">${totalBoardingSpent.toFixed(2)}</span>
                    <span className="cp-summary-label">Boarding</span>
                  </div>
                </div>

                {/* Combined timeline - merge and sort by date */}
                <div className="cp-history-list">
                  {[
                    ...groomingHistory
                      .filter(a => a.status === 'completed')
                      .map(a => ({
                        type: 'grooming',
                        date: a.appointment_date,
                        label: `✂️ ${a.services?.service_name || 'Grooming'}`,
                        pet: a.pets?.name || 'Unknown',
                        amount: parseFloat(a.final_price || a.quoted_price || 0),
                        id: a.id
                      })),
                    ...boardingHistory
                      .filter(r => r.status === 'checked_out' || r.status === 'completed')
                      .map(r => ({
                        type: 'boarding',
                        date: r.start_date,
                        label: `🏠 Boarding (${Math.max(1, Math.round((new Date(r.end_date) - new Date(r.start_date)) / (1000 * 60 * 60 * 24)))} nights)`,
                        pet: r.boarding_reservation_pets?.map(brp => brp.pets?.name).filter(Boolean).join(', ') || 'Unknown',
                        amount: parseFloat(r.total_price || 0),
                        id: r.id
                      }))
                  ]
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(item => (
                      <div key={item.id} className="cp-payment-row">
                        <div className="cp-history-date-col">
                          <span className="cp-history-month">{new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="cp-history-day">{new Date(item.date).getDate()}</span>
                          <span className="cp-history-year">{new Date(item.date).getFullYear()}</span>
                        </div>
                        <div className="cp-payment-info">
                          <span className="cp-payment-label">{item.label}</span>
                          <span className="cp-payment-pet">🐾 {item.pet}</span>
                        </div>
                        <div className="cp-history-price">${item.amount.toFixed(2)}</div>
                      </div>
                    ))
                  }
                </div>
              </>
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
                      <div className="cp-note-header-row">
                        <span className="cp-note-badge-client">📋 Client</span>
                        <span className="cp-note-date">{formatDate(note.created_at)}</span>
                      </div>
                      <div className="cp-note-text">{note.note}</div>
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
                            <div className="cp-note-text">{note.note}</div>
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
                      <div className="cp-note-text">{note.note}</div>
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
