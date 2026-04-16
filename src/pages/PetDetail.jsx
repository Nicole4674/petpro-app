import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var TABS = [
  { key: 'overview', label: '🐾 Overview' },
  { key: 'grooming', label: '✂️ Grooming History' },
  { key: 'boarding', label: '🏠 Boarding History' },
  { key: 'vaccinations', label: '💉 Vaccinations' },
  { key: 'notes', label: '📝 Notes' },
  { key: 'payments', label: '💳 Payments' }
]

export default function PetDetail() {
  var { id } = useParams()
  var navigate = useNavigate()
  var [pet, setPet] = useState(null)
  var [client, setClient] = useState(null)
  var [loading, setLoading] = useState(true)
  var [activeTab, setActiveTab] = useState('overview')
  var [editing, setEditing] = useState(false)
  var [editForm, setEditForm] = useState({})
  var [saving, setSaving] = useState(false)

  // Tab data
  var [groomingHistory, setGroomingHistory] = useState([])
  var [boardingHistory, setBoardingHistory] = useState([])
  var [vaccinations, setVaccinations] = useState([])
  var [notes, setNotes] = useState([])
  var [payments, setPayments] = useState([])
  var [loadingTab, setLoadingTab] = useState(false)

  // Notes form
  var [newNote, setNewNote] = useState('')
  var [savingNote, setSavingNote] = useState(false)

  useEffect(function() {
    fetchPet()
  }, [id])

  useEffect(function() {
    if (!pet) return
    if (activeTab === 'grooming') fetchGrooming()
    if (activeTab === 'boarding') fetchBoarding()
    if (activeTab === 'vaccinations') fetchVaccinations()
    if (activeTab === 'notes') fetchNotes()
    if (activeTab === 'payments') fetchPayments()
  }, [activeTab, id, pet])

  async function fetchPet() {
    var { data: petData, error: petError } = await supabase
      .from('pets')
      .select('*')
      .eq('id', id)
      .single()

    if (petError || !petData) {
      console.error('Error fetching pet:', petError)
      setLoading(false)
      return
    }

    setPet(petData)
    setEditForm(petData)

    // Fetch the owner
    var { data: clientData } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, email')
      .eq('id', petData.client_id)
      .single()

    if (clientData) setClient(clientData)
    setLoading(false)
  }

  async function fetchGrooming() {
    setLoadingTab(true)
    var { data } = await supabase
      .from('appointments')
      .select('*, services(id, service_name, price, time_block_minutes)')
      .eq('pet_id', id)
      .order('appointment_date', { ascending: false })

    setGroomingHistory(data || [])
    setLoadingTab(false)
  }

  async function fetchBoarding() {
    setLoadingTab(true)
    var { data } = await supabase
      .from('boarding_reservation_pets')
      .select('*, boarding_reservations:reservation_id(*, kennels:kennel_id(name))')
      .eq('pet_id', id)
      .order('created_at', { ascending: false })

    setBoardingHistory(data || [])
    setLoadingTab(false)
  }

  async function fetchVaccinations() {
    setLoadingTab(true)
    // Vaccination info is stored on the pet record itself for now
    // If you later create a vaccinations table, we'll query it here
    setLoadingTab(false)
  }

  async function fetchNotes() {
    setLoadingTab(true)
    var { data } = await supabase
      .from('notes')
      .select('*')
      .eq('pet_id', id)
      .order('created_at', { ascending: false })

    setNotes(data || [])
    setLoadingTab(false)
  }

  async function fetchPayments() {
    setLoadingTab(true)
    // Get completed appointments with pricing for this pet
    var { data } = await supabase
      .from('appointments')
      .select('id, appointment_date, status, final_price, quoted_price, services(service_name, price)')
      .eq('pet_id', id)
      .in('status', ['completed'])
      .order('appointment_date', { ascending: false })

    setPayments(data || [])
    setLoadingTab(false)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSaving(true)

    var { error } = await supabase
      .from('pets')
      .update({
        name: editForm.name,
        breed: editForm.breed,
        weight: editForm.weight,
        age: editForm.age,
        sex: editForm.sex,
        is_spayed_neutered: editForm.is_spayed_neutered,
        allergies: editForm.allergies,
        medications: editForm.medications,
        temperament: editForm.temperament,
        special_handling: editForm.special_handling,
        coat_type: editForm.coat_type,
        vaccination_expiry: editForm.vaccination_expiry,
        vet_name: editForm.vet_name,
        vet_phone: editForm.vet_phone,
        microchip_id: editForm.microchip_id
      })
      .eq('id', id)

    if (!error) {
      setPet(Object.assign({}, pet, editForm))
      setEditing(false)
    } else {
      alert('Error saving: ' + error.message)
    }
    setSaving(false)
  }

  async function handleAddNote() {
    if (!newNote.trim()) return
    setSavingNote(true)

    var { data: { user } } = await supabase.auth.getUser()

    var { error } = await supabase
      .from('notes')
      .insert([{
        pet_id: id,
        client_id: pet.client_id,
        groomer_id: user.id,
        note_type: 'grooming',
        content: newNote.trim()
      }])

    if (!error) {
      setNewNote('')
      fetchNotes()
    } else {
      alert('Error saving note: ' + error.message)
    }
    setSavingNote(false)
  }

  function formatDate(d) {
    if (!d) return '—'
    var parts = d.split('-')
    return parts[1] + '/' + parts[2] + '/' + parts[0]
  }

  function formatMoney(amount) {
    if (!amount && amount !== 0) return '—'
    return '$' + Number(amount).toFixed(2)
  }

  function getVaxStatus() {
    if (!pet || !pet.vaccination_expiry) return 'unknown'
    var exp = new Date(pet.vaccination_expiry)
    var now = new Date()
    var thirtyDays = new Date()
    thirtyDays.setDate(thirtyDays.getDate() + 30)
    if (exp < now) return 'expired'
    if (exp < thirtyDays) return 'due_soon'
    return 'current'
  }

  if (loading) return <div className="pd-loading">Loading pet profile...</div>

  if (!pet) {
    return (
      <div className="pd-page">
        <div className="pd-not-found">
          <div className="pd-not-found-icon">🐾</div>
          <h2>Pet not found</h2>
          <p>This pet may have been removed or the link is incorrect.</p>
          <button className="pd-back-btn" onClick={function() { navigate(-1) }}>← Go Back</button>
        </div>
      </div>
    )
  }

  var vaxStatus = getVaxStatus()

  return (
    <div className="pd-page">

      {/* Back Link */}
      {client && (
        <Link to={'/clients/' + client.id} className="pd-back-link">
          ← Back to {client.first_name} {client.last_name}
        </Link>
      )}

      {/* Pet Header Card */}
      <div className="pd-header-card">
        <div className="pd-header-left">
          <div className="pd-avatar">
            {pet.name?.[0] || '?'}
          </div>
          <div className="pd-header-info">
            <h1 className="pd-pet-name">{pet.name}</h1>
            <p className="pd-pet-breed">{pet.breed || 'Unknown breed'}</p>
            <div className="pd-pet-tags">
              {pet.weight && <span className="pd-tag">⚖️ {pet.weight} lbs</span>}
              {pet.age && <span className="pd-tag">🎂 {pet.age}</span>}
              {pet.sex && <span className="pd-tag">{pet.sex === 'Male' ? '♂️' : '♀️'} {pet.sex}</span>}
              {pet.is_spayed_neutered && <span className="pd-tag pd-tag-green">✅ Fixed</span>}
              {!pet.is_spayed_neutered && pet.sex && <span className="pd-tag pd-tag-amber">⚠️ Intact</span>}
              {pet.coat_type && <span className="pd-tag">🧶 {pet.coat_type}</span>}
            </div>
            {client && (
              <p className="pd-owner">
                Owner: <Link to={'/clients/' + client.id} className="pd-owner-link">{client.first_name} {client.last_name}</Link>
                {client.phone && <span className="pd-owner-phone"> · 📱 {client.phone}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="pd-header-right">
          <div className={'pd-vax-badge pd-vax-' + vaxStatus}>
            {vaxStatus === 'current' && '✅ Vax Current'}
            {vaxStatus === 'due_soon' && '⚠️ Vax Due Soon'}
            {vaxStatus === 'expired' && '❌ Vax Expired'}
            {vaxStatus === 'unknown' && '❓ Vax Unknown'}
          </div>
          {pet.vaccination_expiry && (
            <span className="pd-vax-date">Expires: {formatDate(pet.vaccination_expiry)}</span>
          )}
          <button className="pd-edit-btn" onClick={function() { setEditing(true) }}>✏️ Edit Pet</button>
        </div>
      </div>

      {/* Health Alerts Banner */}
      {(pet.allergies || pet.medications || pet.special_handling) && (
        <div className="pd-alerts-banner">
          {pet.allergies && (
            <div className="pd-alert pd-alert-red">
              🚨 <strong>Allergies:</strong> {pet.allergies}
            </div>
          )}
          {pet.medications && (
            <div className="pd-alert pd-alert-blue">
              💊 <strong>Medications:</strong> {pet.medications}
            </div>
          )}
          {pet.special_handling && (
            <div className="pd-alert pd-alert-amber">
              ⚠️ <strong>Special Handling:</strong> {pet.special_handling}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="pd-tabs">
        {TABS.map(function(tab) {
          return (
            <button
              key={tab.key}
              className={'pd-tab' + (activeTab === tab.key ? ' pd-tab-active' : '')}
              onClick={function() { setActiveTab(tab.key) }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="pd-tab-content">

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <div className="pd-overview">
            <div className="pd-overview-grid">
              <div className="pd-info-card">
                <h3 className="pd-card-title">📋 Basic Info</h3>
                <div className="pd-info-rows">
                  <div className="pd-info-row">
                    <span className="pd-info-label">Name</span>
                    <span className="pd-info-value">{pet.name}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Breed</span>
                    <span className="pd-info-value">{pet.breed || '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Weight</span>
                    <span className="pd-info-value">{pet.weight ? pet.weight + ' lbs' : '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Age</span>
                    <span className="pd-info-value">{pet.age || '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Sex</span>
                    <span className="pd-info-value">{pet.sex || '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Spayed/Neutered</span>
                    <span className="pd-info-value">{pet.is_spayed_neutered ? 'Yes ✅' : 'No'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Coat Type</span>
                    <span className="pd-info-value">{pet.coat_type || '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Microchip</span>
                    <span className="pd-info-value">{pet.microchip_id || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="pd-info-card">
                <h3 className="pd-card-title">🏥 Health & Vet</h3>
                <div className="pd-info-rows">
                  <div className="pd-info-row">
                    <span className="pd-info-label">Allergies</span>
                    <span className={'pd-info-value' + (pet.allergies ? ' pd-text-red' : '')}>{pet.allergies || 'None noted'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Medications</span>
                    <span className={'pd-info-value' + (pet.medications ? ' pd-text-blue' : '')}>{pet.medications || 'None'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Vaccination Expiry</span>
                    <span className="pd-info-value">{pet.vaccination_expiry ? formatDate(pet.vaccination_expiry) : '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Vet Name</span>
                    <span className="pd-info-value">{pet.vet_name || '—'}</span>
                  </div>
                  <div className="pd-info-row">
                    <span className="pd-info-label">Vet Phone</span>
                    <span className="pd-info-value">{pet.vet_phone || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="pd-info-card">
                <h3 className="pd-card-title">🧠 Temperament & Handling</h3>
                <div className="pd-info-rows">
                  <div className="pd-info-row pd-info-row-full">
                    <span className="pd-info-label">Temperament</span>
                    <span className="pd-info-value">{pet.temperament || 'Not noted'}</span>
                  </div>
                  <div className="pd-info-row pd-info-row-full">
                    <span className="pd-info-label">Special Handling</span>
                    <span className={'pd-info-value' + (pet.special_handling ? ' pd-text-amber' : '')}>{pet.special_handling || 'None needed'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== GROOMING HISTORY TAB ===== */}
        {activeTab === 'grooming' && (
          <div className="pd-history">
            {loadingTab ? <div className="pd-tab-loading">Loading grooming history...</div> : (
              groomingHistory.length === 0 ? (
                <div className="pd-empty">
                  <div className="pd-empty-icon">✂️</div>
                  <h3>No grooming history yet</h3>
                  <p>Appointments for {pet.name} will show up here.</p>
                </div>
              ) : (
                <div className="pd-history-list">
                  {groomingHistory.map(function(appt) {
                    return (
                      <div key={appt.id} className="pd-history-card">
                        <div className="pd-history-date">{formatDate(appt.appointment_date)}</div>
                        <div className="pd-history-details">
                          <span className="pd-history-service">{appt.services?.service_name || 'Service'}</span>
                          <span className={'pd-history-status pd-status-' + appt.status}>{appt.status}</span>
                        </div>
                        <div className="pd-history-price">
                          {formatMoney(appt.final_price || appt.quoted_price || appt.services?.price)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ===== BOARDING HISTORY TAB ===== */}
        {activeTab === 'boarding' && (
          <div className="pd-history">
            {loadingTab ? <div className="pd-tab-loading">Loading boarding history...</div> : (
              boardingHistory.length === 0 ? (
                <div className="pd-empty">
                  <div className="pd-empty-icon">🏠</div>
                  <h3>No boarding history yet</h3>
                  <p>Boarding stays for {pet.name} will show up here.</p>
                </div>
              ) : (
                <div className="pd-history-list">
                  {boardingHistory.map(function(stay) {
                    var res = stay.boarding_reservations
                    return (
                      <div key={stay.id} className="pd-history-card">
                        <div className="pd-history-date">
                          {res ? formatDate(res.start_date) + ' → ' + formatDate(res.end_date) : '—'}
                        </div>
                        <div className="pd-history-details">
                          <span className="pd-history-service">
                            {res?.kennels?.name || 'Kennel'}
                          </span>
                          <span className={'pd-history-status pd-status-' + (res?.status || 'unknown')}>
                            {res?.status || '—'}
                          </span>
                        </div>
                        <div className="pd-history-price">
                          {res?.total_price ? formatMoney(res.total_price) : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ===== VACCINATIONS TAB ===== */}
        {activeTab === 'vaccinations' && (
          <div className="pd-vaccinations">
            <div className="pd-vax-summary">
              <div className={'pd-vax-status-card pd-vax-card-' + vaxStatus}>
                <div className="pd-vax-status-icon">
                  {vaxStatus === 'current' && '✅'}
                  {vaxStatus === 'due_soon' && '⚠️'}
                  {vaxStatus === 'expired' && '❌'}
                  {vaxStatus === 'unknown' && '❓'}
                </div>
                <div className="pd-vax-status-info">
                  <h3>{vaxStatus === 'current' ? 'Vaccinations Current' : vaxStatus === 'due_soon' ? 'Vaccinations Due Soon' : vaxStatus === 'expired' ? 'Vaccinations Expired' : 'Vaccination Status Unknown'}</h3>
                  {pet.vaccination_expiry ? (
                    <p>Expiry date: {formatDate(pet.vaccination_expiry)}</p>
                  ) : (
                    <p>No vaccination expiry date on file</p>
                  )}
                </div>
              </div>
            </div>
            <div className="pd-vax-vet">
              <h3 className="pd-card-title">🏥 Vet Information</h3>
              <div className="pd-info-rows">
                <div className="pd-info-row">
                  <span className="pd-info-label">Vet Name</span>
                  <span className="pd-info-value">{pet.vet_name || 'Not on file'}</span>
                </div>
                <div className="pd-info-row">
                  <span className="pd-info-label">Vet Phone</span>
                  <span className="pd-info-value">{pet.vet_phone || 'Not on file'}</span>
                </div>
              </div>
            </div>
            <div className="pd-vax-note">
              💡 Individual vaccine records (Rabies, DHPP, Bordetella, etc.) will be tracked here once the vaccination table is built. For now, the overall vaccination expiry is tracked on the pet's profile.
            </div>
          </div>
        )}

        {/* ===== NOTES TAB ===== */}
        {activeTab === 'notes' && (
          <div className="pd-notes">
            <div className="pd-note-form">
              <textarea
                value={newNote}
                onChange={function(e) { setNewNote(e.target.value) }}
                placeholder={'Add a grooming note about ' + pet.name + '...'}
                className="pd-note-input"
                rows="3"
              />
              <button
                className="pd-note-submit"
                onClick={handleAddNote}
                disabled={savingNote || !newNote.trim()}
              >
                {savingNote ? 'Saving...' : '💾 Save Note'}
              </button>
            </div>

            {loadingTab ? <div className="pd-tab-loading">Loading notes...</div> : (
              notes.length === 0 ? (
                <div className="pd-empty">
                  <div className="pd-empty-icon">📝</div>
                  <h3>No notes yet</h3>
                  <p>Add grooming notes, behavior observations, or preferences for {pet.name}.</p>
                </div>
              ) : (
                <div className="pd-notes-list">
                  {notes.map(function(note) {
                    return (
                      <div key={note.id} className="pd-note-card">
                        <div className="pd-note-content">{note.content}</div>
                        <div className="pd-note-meta">
                          {note.created_at && new Date(note.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ===== PAYMENTS TAB ===== */}
        {activeTab === 'payments' && (
          <div className="pd-payments">
            {loadingTab ? <div className="pd-tab-loading">Loading payment history...</div> : (
              payments.length === 0 ? (
                <div className="pd-empty">
                  <div className="pd-empty-icon">💳</div>
                  <h3>No payment history yet</h3>
                  <p>Completed appointments with pricing for {pet.name} will show here.</p>
                </div>
              ) : (
                <>
                  <div className="pd-payment-summary">
                    <div className="pd-payment-total-card">
                      <span className="pd-payment-total-label">Total Spent</span>
                      <span className="pd-payment-total-amount">
                        {formatMoney(payments.reduce(function(sum, p) {
                          return sum + (p.final_price || p.quoted_price || p.services?.price || 0)
                        }, 0))}
                      </span>
                      <span className="pd-payment-total-count">{payments.length} completed visit{payments.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="pd-history-list">
                    {payments.map(function(p) {
                      return (
                        <div key={p.id} className="pd-history-card">
                          <div className="pd-history-date">{formatDate(p.appointment_date)}</div>
                          <div className="pd-history-details">
                            <span className="pd-history-service">{p.services?.service_name || 'Service'}</span>
                            <span className="pd-history-status pd-status-completed">completed</span>
                          </div>
                          <div className="pd-history-price">
                            {formatMoney(p.final_price || p.quoted_price || p.services?.price)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            )}
          </div>
        )}
      </div>

      {/* Edit Pet Modal */}
      {editing && (
        <div className="sl-modal-overlay" onClick={function(e) { if (e.target.className === 'sl-modal-overlay') setEditing(false) }}>
          <div className="sl-modal" style={{ maxWidth: '600px' }}>
            <div className="sl-modal-header">
              <h2>✏️ Edit {pet.name}</h2>
              <button className="sl-modal-close" onClick={function() { setEditing(false) }}>✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="sl-form">
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Name *</label>
                  <input type="text" className="sl-input" value={editForm.name || ''} required
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { name: e.target.value })) }}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Breed</label>
                  <input type="text" className="sl-input" value={editForm.breed || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { breed: e.target.value })) }}
                  />
                </div>
              </div>

              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Weight (lbs)</label>
                  <input type="number" className="sl-input" value={editForm.weight || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { weight: e.target.value })) }}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Age</label>
                  <input type="text" className="sl-input" value={editForm.age || ''} placeholder="e.g. 3 years"
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { age: e.target.value })) }}
                  />
                </div>
              </div>

              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Sex</label>
                  <select className="sl-input" value={editForm.sex || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { sex: e.target.value })) }}
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Coat Type</label>
                  <input type="text" className="sl-input" value={editForm.coat_type || ''} placeholder="e.g. Double coat, Curly"
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { coat_type: e.target.value })) }}
                  />
                </div>
              </div>

              <div className="sl-form-group">
                <label className="sl-checkbox-label">
                  <input type="checkbox" checked={editForm.is_spayed_neutered || false}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { is_spayed_neutered: e.target.checked })) }}
                  />
                  Spayed / Neutered
                </label>
              </div>

              <div className="sl-form-group">
                <label className="sl-label">Allergies</label>
                <textarea className="sl-input" value={editForm.allergies || ''} rows="2" placeholder="List any known allergies..."
                  onChange={function(e) { setEditForm(Object.assign({}, editForm, { allergies: e.target.value })) }}
                />
              </div>

              <div className="sl-form-group">
                <label className="sl-label">Medications</label>
                <textarea className="sl-input" value={editForm.medications || ''} rows="2" placeholder="Current medications..."
                  onChange={function(e) { setEditForm(Object.assign({}, editForm, { medications: e.target.value })) }}
                />
              </div>

              <div className="sl-form-group">
                <label className="sl-label">Temperament</label>
                <textarea className="sl-input" value={editForm.temperament || ''} rows="2" placeholder="e.g. Friendly, anxious around dryers, nips at feet..."
                  onChange={function(e) { setEditForm(Object.assign({}, editForm, { temperament: e.target.value })) }}
                />
              </div>

              <div className="sl-form-group">
                <label className="sl-label">Special Handling Instructions</label>
                <textarea className="sl-input" value={editForm.special_handling || ''} rows="2" placeholder="e.g. Muzzle required, needs two groomers, sensitive ears..."
                  onChange={function(e) { setEditForm(Object.assign({}, editForm, { special_handling: e.target.value })) }}
                />
              </div>

              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Vaccination Expiry</label>
                  <input type="date" className="sl-input" value={editForm.vaccination_expiry || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { vaccination_expiry: e.target.value })) }}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Microchip ID</label>
                  <input type="text" className="sl-input" value={editForm.microchip_id || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { microchip_id: e.target.value })) }}
                  />
                </div>
              </div>

              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Vet Name</label>
                  <input type="text" className="sl-input" value={editForm.vet_name || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { vet_name: e.target.value })) }}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Vet Phone</label>
                  <input type="text" className="sl-input" value={editForm.vet_phone || ''}
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { vet_phone: e.target.value })) }}
                  />
                </div>
              </div>

              <div className="sl-form-actions">
                <button type="button" className="sl-btn-cancel" onClick={function() { setEditing(false); setEditForm(pet) }}>Cancel</button>
                <button type="submit" className="sl-btn-save" disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
