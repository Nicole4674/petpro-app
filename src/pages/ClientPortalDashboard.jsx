// =======================================================
// PetPro — Client Portal Dashboard
// URL: /portal
// - Mirrors ClientDetail style (cp-* CSS classes)
// - NO "Back to Clients" — replaced with Log Out
// - NO "Book Again" buttons — booking happens via messaging/Claude
// - Tabs: Overview ✓, Messages (placeholder), others coming soon
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getBreedDefaults } from '../lib/breedDefaults'
import EnableNotifications from '../components/EnableNotifications'
import ReportCardModal from '../components/ReportCardModal'
import ClientPaymentModal from '../components/ClientPaymentModal'
import BreedPicker from '../components/BreedPicker'
import { DOG_BREEDS, CAT_BREEDS } from '../lib/breeds'
import { formatPhone, formatPhoneOnInput } from '../lib/phone'

const TABS = [
  { key: 'overview', label: '🐾 Overview' },
  { key: 'upcoming', label: '📅 Upcoming' },
  { key: 'grooming', label: '✂️ Past Grooming' },
  { key: 'boarding', label: '🏠 Past Boarding' },
  { key: 'vaccinations', label: '💉 Vaccinations' },
  { key: 'payments', label: '🧾 Payments' },
  { key: 'cards', label: '💳 My Cards' },
  { key: 'messages', label: '💬 Messages' },
]

// Shared input style for the "My Contacts" form in the portal
const portalInputStyle = {
  padding: '10px 12px',
  fontSize: '14px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  outline: 'none',
  fontFamily: 'inherit',
}

export default function ClientPortalDashboard() {
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [client, setClient] = useState(null)
  var [pets, setPets] = useState([])
  var [shopSettings, setShopSettings] = useState(null)
  var [activeTab, setActiveTab] = useState('overview')

  // Edit mode state for Contact Info card
  var [editing, setEditing] = useState(false)
  var [saving, setSaving] = useState(false)
  var [editError, setEditError] = useState('')
  var [editFirstName, setEditFirstName] = useState('')
  var [editLastName, setEditLastName] = useState('')
  var [editPhone, setEditPhone] = useState('')
  var [editPrefContact, setEditPrefContact] = useState('text')
  var [editAddress, setEditAddress] = useState('')

  // ===== My Contacts (Task #97 / #98) — emergency + pickup people =====
  var [myContacts, setMyContacts] = useState([])
  var [myContactForm, setMyContactForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    relationship: '', is_emergency: false, can_pickup: true, notes: ''
  })
  var [editingMyContactId, setEditingMyContactId] = useState(null)
  var [savingMyContact, setSavingMyContact] = useState(false)
  var [showMyContactForm, setShowMyContactForm] = useState(false)

  // Add Pet modal state
  var [showAddPet, setShowAddPet] = useState(false)
  var [addingPet, setAddingPet] = useState(false)
  var [addPetError, setAddPetError] = useState('')
  var [newPetName, setNewPetName] = useState('')
  var [newPetBreed, setNewPetBreed] = useState('')
  var [newPetSpecies, setNewPetSpecies] = useState('dog') // dog or cat — drives breed picker filter
  var [newPetWeight, setNewPetWeight] = useState('')
  var [newPetAge, setNewPetAge] = useState('')
  var [newPetNotes, setNewPetNotes] = useState('')
  // Health & Vet (all optional)
  var [newPetAllergies, setNewPetAllergies] = useState('')
  var [newPetMedications, setNewPetMedications] = useState('')
  var [newPetVaxExpiry, setNewPetVaxExpiry] = useState('')
  var [newPetVetName, setNewPetVetName] = useState('')
  var [newPetVetPhone, setNewPetVetPhone] = useState('')

  // === Edit Health & Vet on existing pet ===
  var [editingHealthPet, setEditingHealthPet] = useState(null) // the pet object being edited, or null
  var [savingHealth, setSavingHealth] = useState(false)
  var [editHealthError, setEditHealthError] = useState('')
  var [editHealthAllergies, setEditHealthAllergies] = useState('')
  var [editHealthMedications, setEditHealthMedications] = useState('')
  var [editHealthVaxExpiry, setEditHealthVaxExpiry] = useState('')
  var [editHealthVetName, setEditHealthVetName] = useState('')
  var [editHealthVetPhone, setEditHealthVetPhone] = useState('')

  // Upcoming appointments + boarding state
  var [upcomingAppts, setUpcomingAppts] = useState([])
  var [upcomingBoarding, setUpcomingBoarding] = useState([])

  // Which appointment IDs already have a pending waitlist entry (so we show
  // "On waitlist" instead of the Notify button)
  var [waitlistedApptIds, setWaitlistedApptIds] = useState([])
  var [waitlistSavingId, setWaitlistSavingId] = useState(null)

  // Pay-now modal state — null when closed, the appointment object when open
  var [payingAppointment, setPayingAppointment] = useState(null)
  var [payingBalance, setPayingBalance] = useState(0)

  // History tabs state
  var [pastGrooming, setPastGrooming] = useState([])
  var [pastBoarding, setPastBoarding] = useState([])
  var [vaccinations, setVaccinations] = useState([])
  var [clientPayments, setClientPayments] = useState([])
  // Report cards for all this client's pets — newest first
  var [reportCards, setReportCards] = useState([])
  var [viewingReportCard, setViewingReportCard] = useState(null)

  useEffect(function () {
    loadPortalData()
  }, [])

  async function loadPortalData() {
    setLoading(true)
    setError('')
    try {
      // 1. Get logged-in user
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/portal/login')
        return
      }

      // 2. Load client record
      var { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (clientError) throw clientError
      if (!clientData) {
        setError('No client profile found for this account.')
        setLoading(false)
        return
      }
      setClient(clientData)

      // 2b. Load their extra contacts (pickup people, emergency, etc.)
      fetchMyContacts(clientData.id)

      // 3. Load their pets
      var { data: petsData, error: petsError } = await supabase
        .from('pets')
        .select('*')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: true })

      if (petsError) throw petsError
      setPets(petsData || [])

      // 4. Load shop branding (groomer's shop_settings)
      var { data: shopData } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('groomer_id', clientData.groomer_id)
        .maybeSingle()

      if (shopData) setShopSettings(shopData)

      // 5. Load upcoming grooming appointments (mirrors ClientDetail filter)
      // Note: we pull `price` on appointment_pets services so multi-pet
      // bookings can compute total properly for the Pay-Now button.
      // "Open" = not checked out AND status not in closed-out set
      // Includes appointment_pets so multi-pet recurring bookings show all pets,
      // not just the primary one.
      var { data: apptsData } = await supabase
        .from('appointments')
        .select('*, pets(id, name, breed), services(id, service_name, price, time_block_minutes), appointment_pets(id, pets:pet_id(id, name, breed), services:service_id(id, service_name, price))')
        .eq('client_id', clientData.id)
        .is('checked_out_at', null)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })

      var closedStatuses = ['cancelled', 'no_show', 'completed', 'checked_out']
      var openAppts = (apptsData || []).filter(function (a) {
        return closedStatuses.indexOf(a.status) === -1
      })
      setUpcomingAppts(openAppts)

      // 5b. Load waitlist entries this client already has pending,
      // so we can show "On waitlist" on those appointment cards.
      var { data: wlRows } = await supabase
        .from('grooming_waitlist')
        .select('appointment_id')
        .eq('client_id', clientData.id)
        .in('status', ['waiting', 'notified'])
        .not('appointment_id', 'is', null)

      setWaitlistedApptIds(((wlRows || []).map(function (r) { return r.appointment_id })).filter(Boolean))

      // 6. Load upcoming boarding reservations (end date today or later, not cancelled)
      var todayStr = new Date().toISOString().split('T')[0]
      var { data: boardingData } = await supabase
        .from('boarding_reservations')
        .select('*, kennels(id, name), boarding_reservation_pets(id, pet_id, pets(id, name, breed))')
        .eq('client_id', clientData.id)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })

      var openBoarding = (boardingData || []).filter(function (b) {
        return b.status !== 'cancelled'
      })
      setUpcomingBoarding(openBoarding)

      // 7. Past grooming — appointments that have been checked out
      // Pulls appointment_pets so multi-pet bookings show all pets
      var { data: pastApptsData } = await supabase
        .from('appointments')
        .select('*, pets(id, name, breed), services(id, service_name, price, time_block_minutes), appointment_pets(id, pets:pet_id(id, name, breed), services:service_id(id, service_name, price))')
        .eq('client_id', clientData.id)
        .not('checked_out_at', 'is', null)
        .order('appointment_date', { ascending: false })

      setPastGrooming(pastApptsData || [])

      // 8. Past boarding — reservations that ended before today and not cancelled
      var { data: pastBoardingData } = await supabase
        .from('boarding_reservations')
        .select('*, kennels(id, name), boarding_reservation_pets(id, pet_id, pets(id, name, breed))')
        .eq('client_id', clientData.id)
        .lt('end_date', todayStr)
        .order('start_date', { ascending: false })

      var closedBoarding = (pastBoardingData || []).filter(function (b) {
        return b.status !== 'cancelled'
      })
      setPastBoarding(closedBoarding)

      // 9. Vaccinations for all client's pets
      var petIds = (petsData || []).map(function (p) { return p.id })
      if (petIds.length > 0) {
        var { data: vaxData } = await supabase
          .from('pet_vaccinations')
          .select('*')
          .in('pet_id', petIds)
          .order('expiration_date', { ascending: true })
        setVaccinations(vaxData || [])
      } else {
        setVaccinations([])
      }

      // 10. Payment history
      var { data: payData } = await supabase
        .from('payments')
        .select('*, appointments:appointment_id(id, appointment_date, pets:pet_id(name), services:service_id(service_name), appointment_pets(id, pets:pet_id(name), services:service_id(service_name)))')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })

      setClientPayments(payData || [])

      // 11. Report cards (groomer/boarding "pickup card" — pet's day recap)
      // RLS allows clients to read their own via "Clients view own report cards" policy
      var { data: cardData } = await supabase
        .from('report_cards')
        .select('id, pet_id, service_type, services_performed, behavior_rating, behavior_notes, recommendations, next_visit_weeks, photo_urls, groomer_name, appointment_id, boarding_reservation_id, created_at')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })
      setReportCards(cardData || [])
    } catch (err) {
      console.error('Error loading portal:', err)
      setError('Could not load your profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Client self-serve: add an existing appointment to the waitlist
  // ("Notify me if an earlier slot opens up").
  async function addAppointmentToWaitlist(appt) {
    if (!appt || !appt.id || !client) return
    if (waitlistSavingId) return
    setWaitlistSavingId(appt.id)
    try {
      // Position: put at end of this groomer's waiting list
      var { data: existing } = await supabase
        .from('grooming_waitlist')
        .select('position')
        .eq('groomer_id', client.groomer_id)
        .eq('status', 'waiting')
      var nextPos = ((existing || []).length) + 1

      var record = {
        groomer_id: client.groomer_id,
        client_id: client.id,
        pet_id: appt.pet_id,
        service_id: appt.service_id || null,
        appointment_id: appt.id,
        position: nextPos,
        status: 'waiting',
        preferred_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        flexible_dates: true,
        any_time: true,
        notes: 'Client requested earlier slot from portal'
      }

      var { error } = await supabase.from('grooming_waitlist').insert([record])
      if (error) {
        alert('Could not add to waitlist: ' + error.message)
      } else {
        setWaitlistedApptIds(waitlistedApptIds.concat([appt.id]))
      }
    } catch (e) {
      alert('Could not add to waitlist — please try again.')
    } finally {
      setWaitlistSavingId(null)
    }
  }

  async function handleLogout() {
    if (!confirm('Log out of your portal?')) return
    await supabase.auth.signOut()
    navigate('/portal/login')
  }

  // Edit Contact Info handlers
  function handleStartEdit() {
    setEditFirstName(client.first_name || '')
    setEditLastName(client.last_name || '')
    setEditPhone(client.phone || '')
    setEditPrefContact(client.preferred_contact || 'text')
    setEditAddress(client.address || '')
    setEditError('')
    setEditing(true)
  }

  function handleCancelEdit() {
    setEditError('')
    setEditing(false)
  }

  async function handleSaveEdit() {
    setEditError('')

    // Validation
    if (!editFirstName.trim()) {
      setEditError('First name is required.')
      return
    }
    if (!editPhone.trim()) {
      setEditError('Phone number is required.')
      return
    }

    setSaving(true)
    try {
      var { error: updateError } = await supabase
        .from('clients')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim() || null,
          phone: editPhone.trim(),
          preferred_contact: editPrefContact,
          address: editAddress.trim() || null,
        })
        .eq('id', client.id)

      if (updateError) throw updateError

      // Reload so UI shows fresh values
      await loadPortalData()
      setEditing(false)
    } catch (err) {
      console.error('Error saving profile:', err)
      setEditError('Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ===== My Contacts CRUD (Task #97 / #98) =====
  // Client-portal-side: clients manage their OWN extra contacts
  // (spouse, pickup people, emergency, vet). RLS already restricts
  // them to their own client_id rows.
  async function fetchMyContacts(clientId) {
    if (!clientId) return
    var { data, error } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('is_emergency', { ascending: false })
      .order('can_pickup', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setMyContacts(data || [])
  }

  function resetMyContactForm() {
    setMyContactForm({
      first_name: '', last_name: '', phone: '', email: '',
      relationship: '', is_emergency: false, can_pickup: true, notes: ''
    })
    setEditingMyContactId(null)
    setShowMyContactForm(false)
  }

  function startEditMyContact(c) {
    setMyContactForm({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      email: c.email || '',
      relationship: c.relationship || '',
      is_emergency: !!c.is_emergency,
      can_pickup: c.can_pickup !== false,
      notes: c.notes || ''
    })
    setEditingMyContactId(c.id)
    setShowMyContactForm(true)
  }

  async function saveMyContact() {
    var first = (myContactForm.first_name || '').trim()
    var phone = (myContactForm.phone || '').trim()
    if (!first) { alert('First name is required'); return }
    if (!phone) { alert('Phone number is required'); return }

    setSavingMyContact(true)
    var payload = {
      client_id: client.id,
      first_name: first,
      last_name: (myContactForm.last_name || '').trim() || null,
      phone: phone,
      email: (myContactForm.email || '').trim() || null,
      relationship: (myContactForm.relationship || '').trim() || null,
      is_emergency: !!myContactForm.is_emergency,
      can_pickup: myContactForm.can_pickup !== false,
      notes: (myContactForm.notes || '').trim() || null,
    }

    var error
    if (editingMyContactId) {
      var resU = await supabase.from('client_contacts').update(payload).eq('id', editingMyContactId)
      error = resU.error
    } else {
      var resI = await supabase.from('client_contacts').insert(payload)
      error = resI.error
    }

    if (error) {
      alert('Could not save: ' + error.message)
    } else {
      resetMyContactForm()
      fetchMyContacts(client.id)
    }
    setSavingMyContact(false)
  }

  async function deleteMyContact(contactId) {
    if (!window.confirm('Delete this contact?')) return
    var { error } = await supabase.from('client_contacts').delete().eq('id', contactId)
    if (error) alert('Error deleting: ' + error.message)
    else fetchMyContacts(client.id)
  }

  // Add Pet modal handlers
  function handleOpenAddPet() {
    setNewPetName('')
    setNewPetBreed('')
    setNewPetSpecies('dog')
    setNewPetWeight('')
    setNewPetAge('')
    setNewPetNotes('')
    setNewPetAllergies('')
    setNewPetMedications('')
    setNewPetVaxExpiry('')
    setNewPetVetName('')
    setNewPetVetPhone('')
    setAddPetError('')
    setShowAddPet(true)
  }

  function handleCloseAddPet() {
    if (addingPet) return
    setAddPetError('')
    setShowAddPet(false)
  }

  async function handleSaveNewPet() {
    setAddPetError('')

    // Validation — all four basic fields required
    if (!newPetName.trim()) {
      setAddPetError('Pet name is required.')
      return
    }
    if (!newPetBreed.trim()) {
      setAddPetError('Breed is required.')
      return
    }
    if (!newPetWeight || isNaN(parseFloat(newPetWeight))) {
      setAddPetError('Weight is required (in lbs).')
      return
    }
    if (!newPetAge || isNaN(parseFloat(newPetAge))) {
      setAddPetError('Age is required (in years).')
      return
    }

    setAddingPet(true)
    try {
      // Smart auto-fill: infer coat_type from the breed the client typed
      // (Client never sees this field — it just saves the groomer time later)
      var breedDefaults = getBreedDefaults(newPetBreed.trim())

      var petInsert = {
        name: newPetName.trim(),
        species: newPetSpecies,
        breed: newPetBreed.trim(),
        weight: parseFloat(newPetWeight),
        age: parseFloat(newPetAge),
        special_notes: newPetNotes.trim() || null,
        // Health & Vet — all optional; empty strings → null
        allergies: newPetAllergies.trim() || null,
        medications: newPetMedications.trim() || null,
        vaccination_expiry: newPetVaxExpiry || null,
        vet_name: newPetVetName.trim() || null,
        vet_phone: newPetVetPhone.trim() || null,
        client_id: client.id,
        groomer_id: client.groomer_id,
      }
      if (breedDefaults.coat_type) {
        petInsert.coat_type = breedDefaults.coat_type
      }

      var { error: insertError } = await supabase
        .from('pets')
        .insert(petInsert)

      if (insertError) throw insertError

      // Reload portal data so new pet shows in grid
      await loadPortalData()
      setShowAddPet(false)
    } catch (err) {
      console.error('Error adding pet:', err)
      setAddPetError('Could not add pet. Please try again.')
    } finally {
      setAddingPet(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // Edit Health & Vet on existing pet
  // ══════════════════════════════════════════════════════
  function handleOpenEditHealth(pet) {
    setEditHealthError('')
    setEditHealthAllergies(pet.allergies || '')
    setEditHealthMedications(pet.medications || '')
    setEditHealthVaxExpiry(pet.vaccination_expiry || '')
    setEditHealthVetName(pet.vet_name || '')
    setEditHealthVetPhone(pet.vet_phone || '')
    setEditingHealthPet(pet)
  }

  function handleCloseEditHealth() {
    if (savingHealth) return
    setEditHealthError('')
    setEditingHealthPet(null)
  }

  async function handleSaveHealth() {
    if (!editingHealthPet) return
    setEditHealthError('')
    setSavingHealth(true)
    try {
      var { error: updateError } = await supabase
        .from('pets')
        .update({
          allergies: editHealthAllergies.trim() || null,
          medications: editHealthMedications.trim() || null,
          vaccination_expiry: editHealthVaxExpiry || null,
          vet_name: editHealthVetName.trim() || null,
          vet_phone: editHealthVetPhone.trim() || null,
        })
        .eq('id', editingHealthPet.id)
      if (updateError) throw updateError
      await loadPortalData()
      setEditingHealthPet(null)
    } catch (err) {
      console.error('Error saving health info:', err)
      setEditHealthError('Could not save. Please try again.')
    } finally {
      setSavingHealth(false)
    }
  }

  // Format HH:MM:SS → "10:30 AM"
  function formatTime(t) {
    if (!t) return ''
    var parts = String(t).split(':')
    var h = parseInt(parts[0], 10)
    var m = parts[1] || '00'
    var ampm = h >= 12 ? 'PM' : 'AM'
    var hour12 = h % 12 || 12
    return hour12 + ':' + m + ' ' + ampm
  }

  // Format date → "Apr 20, 2026"
  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Compute vaccination status: expired / due_soon (within 30 days) / current
  function getVaxStatus(expirationDate) {
    if (!expirationDate) return 'unknown'
    var exp = new Date(expirationDate)
    var now = new Date()
    var thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (exp < now) return 'expired'
    if (exp < thirtyDays) return 'due_soon'
    return 'current'
  }

  function getVaxStatusStyle(status) {
    if (status === 'expired') return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
    if (status === 'due_soon') return { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
    return { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
  }

  // Payment method → emoji icon
  function methodIcon(m) {
    if (m === 'cash') return '💵'
    if (m === 'zelle') return '⚡'
    if (m === 'venmo') return '🔵'
    if (m === 'card') return '💳'
    if (m === 'check') return '📝'
    return '•'
  }

  // Avatar color based on first letter
  function getPetAvatar(pet) {
    var colors = ['#7c3aed', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899']
    var name = pet.name || 'A'
    var idx = name.charCodeAt(0) % colors.length
    return colors[idx]
  }

  // Loading state
  if (loading) {
    return (
      <div className="cp-loading">
        <div className="cp-loading-paw">🐾</div>
        <p>Loading your portal...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cp-loading">
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
        <p>{error}</p>
        <button
          onClick={handleLogout}
          style={{
            marginTop: '16px',
            padding: '10px 18px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Log Out
        </button>
      </div>
    )
  }

  if (!client) return <div className="cp-loading">Profile not found</div>

  var brandColor = (shopSettings && shopSettings.primary_color) || '#7c3aed'
  var shopName = (shopSettings && shopSettings.shop_name) || 'PetPro'

  return (
    <div className="cp-page">

      {/* Shop Branding Banner (top strip) */}
      <div style={{
        background: brandColor,
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        borderRadius: '10px',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {shopSettings && shopSettings.logo_url ? (
            <img
              src={shopSettings.logo_url}
              alt={shopName}
              style={{ height: '32px', width: '32px', borderRadius: '6px', objectFit: 'contain', background: '#fff', padding: '2px' }}
            />
          ) : (
            <span style={{ fontSize: '22px' }}>🐾</span>
          )}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700' }}>{shopName}</div>
            {shopSettings && shopSettings.tagline && (
              <div style={{ fontSize: '11px', opacity: 0.9 }}>{shopSettings.tagline}</div>
            )}
            {/* Shop address + Get Directions — helps every-3-months clients who forget where to go */}
            {shopSettings && shopSettings.address && (
              <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>📍 {shopSettings.address}</span>
                <a
                  href={'https://maps.google.com/?q=' + encodeURIComponent(shopSettings.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#fff', textDecoration: 'underline', fontWeight: '600' }}
                >
                  Get Directions →
                </a>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '6px',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Log Out
        </button>
      </div>

      {/* Header */}
      <div className="cp-header">
        <div className="cp-header-row">
          <div className="cp-avatar-big" style={{ background: getPetAvatar({ name: client.first_name || 'A' }) }}>
            {(client.first_name || 'A').charAt(0).toUpperCase()}
            {(client.last_name || '').charAt(0).toUpperCase()}
          </div>
          <div className="cp-header-info">
            <h1 className="cp-name">
              {client.first_name} {client.last_name}
              {client.is_first_time && <span className="cp-badge-new">New Client</span>}
            </h1>
            <div className="cp-quick-stats">
              <span>{pets.length} {pets.length === 1 ? 'Pet' : 'Pets'}</span>
              {client.phone && (
                <>
                  <span className="cp-stat-dot">·</span>
                  <span>📞 {formatPhone(client.phone)}</span>
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

      {/* Tabs */}
      <div className="cp-tabs">
        {TABS.map(function (tab) {
          return (
            <button
              key={tab.key}
              className={'cp-tab ' + (activeTab === tab.key ? 'cp-tab-active' : '')}
              onClick={function () {
                if (tab.key === 'messages') {
                  navigate('/portal/messages')
                } else if (tab.key === 'cards') {
                  navigate('/portal/cards')
                } else {
                  setActiveTab(tab.key)
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="cp-tab-content">

        {/* ═══════ OVERVIEW TAB ═══════ */}
        {activeTab === 'overview' && (
          <div className="cp-overview">

            {/* Push Notifications Prompt (big blue card — first thing clients see) */}
            <EnableNotifications variant="hero" userType="client" />

            {/* Contact Information */}
            <div className="cp-card">
              <h3 className="cp-card-title">📋 Contact Information</h3>

              {!editing ? (
                <>
                  {/* ─── View Mode ─── */}
                  <div className="cp-contact-grid">
                    <div className="cp-contact-item">
                      <span className="cp-contact-label">Phone</span>
                      <span className="cp-contact-value">{formatPhone(client.phone) || 'Not provided'}</span>
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
                  <div style={{ marginTop: '12px', textAlign: 'right' }}>
                    <button
                      onClick={handleStartEdit}
                      style={{
                        padding: '8px 14px',
                        background: '#fff',
                        color: brandColor,
                        border: '1px solid ' + brandColor,
                        borderRadius: '6px',
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      ✏️ Edit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* ─── Edit Mode ─── */}
                  {editError && (
                    <div style={{
                      padding: '10px 12px',
                      background: '#fee2e2',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      color: '#991b1b',
                      marginBottom: '12px',
                      fontSize: '13px'
                    }}>
                      {editError}
                    </div>
                  )}

                  {/* First + Last Name */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        First Name
                      </label>
                      <input
                        type="text"
                        value={editFirstName}
                        onChange={function (e) { setEditFirstName(e.target.value) }}
                        placeholder="First name"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          fontSize: '16px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={editLastName}
                        onChange={function (e) { setEditLastName(e.target.value) }}
                        placeholder="Last name"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          fontSize: '16px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={function (e) { setEditPhone(formatPhoneOnInput(e.target.value)) }}
                      placeholder="(555) 123-4567"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Email (LOCKED — login credential) */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Email <span style={{ color: '#9ca3af', fontWeight: '400', textTransform: 'none', letterSpacing: 'normal' }}>(contact groomer to change)</span>
                    </label>
                    <input
                      type="email"
                      value={client.email || ''}
                      disabled
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        background: '#f3f4f6',
                        color: '#6b7280',
                        cursor: 'not-allowed'
                      }}
                    />
                  </div>

                  {/* Preferred Contact */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Preferred Contact
                    </label>
                    <select
                      value={editPrefContact}
                      onChange={function (e) { setEditPrefContact(e.target.value) }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box',
                        background: '#fff'
                      }}
                    >
                      <option value="text">Text</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                    </select>
                  </div>

                  {/* Address */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Address
                    </label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={function (e) { setEditAddress(e.target.value) }}
                      placeholder="123 Main St, City, ST 12345"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '16px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Save / Cancel */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      style={{
                        padding: '10px 18px',
                        background: '#fff',
                        color: '#6b7280',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: saving ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      style={{
                        padding: '10px 18px',
                        background: saving ? '#9ca3af' : brandColor,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: saving ? 'wait' : 'pointer'
                      }}
                    >
                      {saving ? 'Saving...' : '💾 Save Changes'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Emergency & Pickup Contacts (Task #97 / #98) */}
            <div className="cp-card">
              <div className="cp-card-title-row">
                <h3 className="cp-card-title">📞 Emergency & Pickup Contacts ({myContacts.length})</h3>
                {!showMyContactForm && (
                  <button
                    onClick={function () { resetMyContactForm(); setShowMyContactForm(true) }}
                    className="cp-btn-add"
                    style={{ background: brandColor }}
                  >
                    + Add Contact
                  </button>
                )}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', lineHeight: '1.5' }}>
                Add anyone authorized to drop off or pick up your pet, or who should be called in an emergency. Your groomer sees these too.
              </div>

              {myContacts.length === 0 && !showMyContactForm ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  No extra contacts added yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {myContacts.map(function (c) {
                    var fullName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim()
                    return (
                      <div
                        key={c.id}
                        style={{
                          padding: '12px 14px',
                          borderLeft: c.is_emergency ? '4px solid #dc2626' : '4px solid ' + brandColor,
                          background: '#fafafa',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '180px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <strong>{fullName}</strong>
                              {c.relationship && (
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#ede9fe', color: '#6d28d9', fontWeight: '600' }}>
                                  {c.relationship}
                                </span>
                              )}
                              {c.is_emergency && (
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#fee2e2', color: '#991b1b', fontWeight: '700' }}>
                                  🚨 EMERGENCY
                                </span>
                              )}
                              {!c.can_pickup && (
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: '#fef3c7', color: '#92400e', fontWeight: '600' }}>
                                  NOT AUTHORIZED TO PICKUP
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '14px', color: '#374151' }}>📞 {formatPhone(c.phone)}</div>
                            {c.email && <div style={{ fontSize: '13px', color: '#6b7280' }}>✉️ {c.email}</div>}
                            {c.notes && <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', marginTop: '4px' }}>{c.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={function () { startEditMyContact(c) }}
                              style={{ padding: '6px 10px', fontSize: '12px', background: '#fff', color: brandColor, border: '1px solid ' + brandColor, borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={function () { deleteMyContact(c.id) }}
                              style={{ padding: '6px 10px', fontSize: '12px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
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
              {showMyContactForm && (
                <div style={{ marginTop: '14px', padding: '16px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>
                    {editingMyContactId ? 'Edit contact' : 'Add a new contact'}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="First name *"
                      value={myContactForm.first_name}
                      onChange={function (e) { setMyContactForm({ ...myContactForm, first_name: e.target.value }) }}
                      style={portalInputStyle}
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={myContactForm.last_name}
                      onChange={function (e) { setMyContactForm({ ...myContactForm, last_name: e.target.value }) }}
                      style={portalInputStyle}
                    />
                    <input
                      type="tel"
                      placeholder="Phone * (713-098-3746)"
                      value={myContactForm.phone}
                      onChange={function (e) { setMyContactForm({ ...myContactForm, phone: formatPhoneOnInput(e.target.value) }) }}
                      style={portalInputStyle}
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={myContactForm.email}
                      onChange={function (e) { setMyContactForm({ ...myContactForm, email: e.target.value }) }}
                      style={portalInputStyle}
                    />
                  </div>
                  <input
                    type="text"
                    list="portal-relationship-options"
                    placeholder="Relationship (e.g. Spouse, Pickup person, Vet, Mom)"
                    value={myContactForm.relationship}
                    onChange={function (e) { setMyContactForm({ ...myContactForm, relationship: e.target.value }) }}
                    style={{ ...portalInputStyle, width: '100%', marginBottom: '10px', boxSizing: 'border-box' }}
                  />
                  <datalist id="portal-relationship-options">
                    <option value="Spouse" />
                    <option value="Parent" />
                    <option value="Sibling" />
                    <option value="Child" />
                    <option value="Pickup person" />
                    <option value="Pet sitter" />
                    <option value="Dog walker" />
                    <option value="Neighbor" />
                    <option value="Vet" />
                    <option value="Emergency contact" />
                  </datalist>
                  <textarea
                    placeholder="Notes — e.g. Only picks up Tuesdays, Call after 5pm"
                    rows={2}
                    value={myContactForm.notes}
                    onChange={function (e) { setMyContactForm({ ...myContactForm, notes: e.target.value }) }}
                    style={{ ...portalInputStyle, width: '100%', marginBottom: '10px', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '18px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={myContactForm.is_emergency}
                        onChange={function (e) { setMyContactForm({ ...myContactForm, is_emergency: e.target.checked }) }}
                      />
                      🚨 Emergency contact
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={myContactForm.can_pickup}
                        onChange={function (e) { setMyContactForm({ ...myContactForm, can_pickup: e.target.checked }) }}
                      />
                      Authorized to pick up
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={resetMyContactForm}
                      disabled={savingMyContact}
                      style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveMyContact}
                      disabled={savingMyContact}
                      style={{ padding: '8px 14px', background: brandColor, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: savingMyContact ? 0.6 : 1 }}
                    >
                      {savingMyContact ? 'Saving...' : (editingMyContactId ? 'Save changes' : 'Add contact')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pets */}
            <div className="cp-card">
              <div className="cp-card-title-row">
                <h3 className="cp-card-title">🐾 My Pets ({pets.length})</h3>
                <button
                  onClick={handleOpenAddPet}
                  className="cp-btn-add"
                  style={{ background: brandColor }}
                >
                  + Add Pet
                </button>
              </div>
              {pets.length === 0 ? (
                <div className="cp-empty">No pets added yet. Add your first pet!</div>
              ) : (
                <div className="cp-pets-grid">
                  {pets.map(function (pet) {
                    var hasHealthInfo = pet.allergies || pet.medications || pet.vaccination_expiry || pet.vet_name || pet.vet_phone
                    return (
                      <div key={pet.id} className="cp-pet-card" style={{ cursor: 'default' }}>
                        <div className="cp-pet-card-top">
                          <div className="cp-pet-avatar" style={{ background: getPetAvatar(pet) }}>
                            {(pet.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="cp-pet-info">
                            <h4 className="cp-pet-name">{pet.name}</h4>
                            <p className="cp-pet-breed">
                              {pet.breed || 'Breed not set'}
                              {pet.weight ? ' · ' + pet.weight + 'lbs' : ''}
                            </p>
                            {pet.age && (
                              <p className="cp-pet-details">Age: {pet.age}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={function () { handleOpenEditHealth(pet) }}
                          style={{
                            marginTop: '10px',
                            width: '100%',
                            padding: '8px 12px',
                            background: hasHealthInfo ? '#f3f4f6' : '#fef3c7',
                            color: hasHealthInfo ? '#374151' : '#92400e',
                            border: '1px solid ' + (hasHealthInfo ? '#d1d5db' : '#fde68a'),
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          🏥 {hasHealthInfo ? 'Edit Health & Vet Info' : 'Add Health & Vet Info'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ─── Recent Report Cards (groomer/boarding pickup recap) ─── */}
            {reportCards.length > 0 && (
              <div className="cp-card">
                <h3 className="cp-card-title">📋 Recent Report Cards</h3>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                  How your pets did at their visit. Tap any card to view or print it.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {reportCards.slice(0, 8).map(function (rc) {
                    var pet = pets.find(function (p) { return p.id === rc.pet_id })
                    var petName = (pet && pet.name) || 'Pet'
                    var dateStr = new Date(rc.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })
                    var ratingMap = {
                      great:     { label: '⭐ Great Day',  bg: '#dcfce7', fg: '#166534' },
                      good:      { label: '😊 Good',       bg: '#dbeafe', fg: '#1e40af' },
                      okay:      { label: '😐 Okay',       bg: '#fef3c7', fg: '#92400e' },
                      anxious:   { label: '😰 Anxious',    bg: '#fed7aa', fg: '#9a3412' },
                      difficult: { label: '⚠️ Difficult',  bg: '#fee2e2', fg: '#991b1b' },
                    }
                    var pill = ratingMap[rc.behavior_rating] || null
                    return (
                      <div
                        key={rc.id}
                        onClick={function () { setViewingReportCard(rc) }}
                        style={{
                          padding: '12px 14px',
                          background: '#faf5ff',
                          border: '1px solid #e9d5ff',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <div style={{ fontWeight: '700', color: '#111827', fontSize: '14px' }}>
                            🐾 {petName} · {rc.service_type === 'boarding' ? '🏠 Boarding' : '✂️ Grooming'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            {dateStr}
                            {rc.groomer_name ? ' · with ' + rc.groomer_name : ''}
                            {rc.next_visit_weeks ? ' · next visit: ' + rc.next_visit_weeks + ' wks' : ''}
                          </div>
                          {rc.services_performed && (
                            <div style={{ fontSize: '12px', color: '#374151', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rc.services_performed}
                            </div>
                          )}
                        </div>
                        {pill && (
                          <span style={{
                            padding: '4px 10px',
                            background: pill.bg,
                            color: pill.fg,
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: '700',
                            whiteSpace: 'nowrap'
                          }}>
                            {pill.label}
                          </span>
                        )}
                        <span style={{ color: '#7c3aed', fontWeight: '600', fontSize: '13px' }}>
                          View →
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ═══════ UPCOMING TAB ═══════ */}
        {activeTab === 'upcoming' && (
          <div className="cp-upcoming">
            {upcomingAppts.length === 0 && upcomingBoarding.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '56px', marginBottom: '12px' }}>📅</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No upcoming appointments</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                  Message your groomer to book your next visit!
                </p>
              </div>
            ) : (
              <>
                {/* Summary counts */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {upcomingAppts.length > 0 && (
                    <div className="cp-card" style={{ flex: '1 1 180px', padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: '800', color: brandColor }}>
                        {upcomingAppts.length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                        Grooming Appointment{upcomingAppts.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                  {upcomingBoarding.length > 0 && (
                    <div className="cp-card" style={{ flex: '1 1 180px', padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: '800', color: brandColor }}>
                        {upcomingBoarding.length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                        Boarding Stay{upcomingBoarding.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </div>

                {/* Grooming list */}
                {upcomingAppts.length > 0 && (
                  <div className="cp-card">
                    <h3 className="cp-card-title">✂️ Upcoming Grooming</h3>
                    <div className="cp-history-list">
                      {upcomingAppts.map(function (appt) {
                        var apptDate = new Date(appt.appointment_date + 'T00:00:00')
                        var today = new Date()
                        today.setHours(0, 0, 0, 0)
                        var isOverdue = apptDate < today
                        return (
                          <div key={appt.id} className={'cp-upcoming-item ' + (isOverdue ? 'cp-upcoming-overdue' : '')}>
                            <div className="cp-history-date-col">
                              <span className="cp-history-month">{apptDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                              <span className="cp-history-day">{apptDate.getDate()}</span>
                              <span className="cp-history-year">{apptDate.getFullYear()}</span>
                            </div>
                            <div className="cp-history-details">
                              <div className="cp-history-top-row">
                                <span className="cp-history-service">
                                  {/* Multi-pet: list each pet's service joined; otherwise fall back to the legacy primary service */}
                                  {(appt.appointment_pets && appt.appointment_pets.length > 0)
                                    ? appt.appointment_pets
                                        .map(function (ap) { return ap.services && ap.services.service_name })
                                        .filter(Boolean)
                                        .join(' · ') || 'Grooming'
                                    : ((appt.services && appt.services.service_name) || 'Grooming')}
                                </span>
                                {isOverdue && (
                                  <span className="cp-upcoming-overdue-badge">⚠️ Needs your groomer's attention</span>
                                )}
                              </div>
                              <div className="cp-history-meta">
                                <span>🐾 {
                                  /* Show every pet on the appointment (multi-pet bookings) */
                                  (appt.appointment_pets && appt.appointment_pets.length > 0)
                                    ? appt.appointment_pets
                                        .map(function (ap) { return ap.pets && ap.pets.name })
                                        .filter(Boolean)
                                        .join(', ')
                                    : ((appt.pets && appt.pets.name) || 'Pet')
                                }</span>
                                <span>🕐 {formatTime(appt.start_time)}{appt.end_time ? ' — ' + formatTime(appt.end_time) : ''}</span>
                                {appt.services && appt.services.time_block_minutes && (
                                  <span>⏱️ {appt.services.time_block_minutes} min</span>
                                )}
                              </div>
                              {appt.service_notes && (
                                <div className="cp-history-notes">📝 {appt.service_notes}</div>
                              )}
                              {/* Pay Now — only show if there's a balance owed on this appointment */}
                              {(function () {
                                // Compute the appointment total from whatever pricing data is available:
                                //   1. Explicit total_price column (newer multi-pet bookings)
                                //   2. Sum of service prices across appointment_pets (multi-pet)
                                //   3. The legacy single service.price (one pet, one service)
                                var total = parseFloat(appt.total_price || 0)
                                if (!total && appt.appointment_pets && appt.appointment_pets.length > 0) {
                                  total = appt.appointment_pets.reduce(function (sum, ap) {
                                    return sum + parseFloat((ap.services && ap.services.price) || 0)
                                  }, 0)
                                }
                                if (!total && appt.services && appt.services.price) {
                                  total = parseFloat(appt.services.price)
                                }
                                if (!total || total <= 0) return null
                                // Net paid = sum of (amount - refunded_amount), clamped to >=0 per row
                                var paid = (clientPayments || [])
                                  .filter(function (p) { return p.appointment_id === appt.id })
                                  .reduce(function (sum, p) {
                                    var paidAmt = parseFloat(p.amount || 0)
                                    var refunded = parseFloat(p.refunded_amount || 0)
                                    return sum + Math.max(0, paidAmt - refunded)
                                  }, 0)
                                var bal = total - paid
                                if (bal <= 0.001) {
                                  return (
                                    <div style={{
                                      marginTop: 10,
                                      padding: '8px 12px',
                                      background: '#dcfce7',
                                      border: '1px solid #86efac',
                                      borderRadius: 8,
                                      color: '#166534',
                                      fontSize: 13,
                                      fontWeight: 700
                                    }}>
                                      ✓ Paid in full
                                    </div>
                                  )
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={function () {
                                      setPayingAppointment(appt)
                                      setPayingBalance(bal)
                                    }}
                                    style={{
                                      marginTop: 10,
                                      marginRight: 8,
                                      padding: '8px 14px',
                                      background: '#10b981',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: 8,
                                      fontSize: 13,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    💳 Pay ${bal.toFixed(2)}
                                  </button>
                                )
                              })()}
                              {/* Waitlist: notify me if an earlier slot opens */}
                              {!isOverdue && (
                                waitlistedApptIds.indexOf(appt.id) >= 0 ? (
                                  <div style={{
                                    marginTop: 10,
                                    padding: '8px 12px',
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: 8,
                                    color: '#065f46',
                                    fontSize: 13,
                                    fontWeight: 600
                                  }}>
                                    ✓ On waitlist — we'll text you if an earlier slot opens
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={function () { addAppointmentToWaitlist(appt) }}
                                    disabled={waitlistSavingId === appt.id}
                                    style={{
                                      marginTop: 10,
                                      padding: '8px 14px',
                                      background: '#7c3aed',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: 8,
                                      fontSize: 13,
                                      fontWeight: 600,
                                      cursor: waitlistSavingId === appt.id ? 'wait' : 'pointer',
                                      opacity: waitlistSavingId === appt.id ? 0.7 : 1
                                    }}
                                  >
                                    {waitlistSavingId === appt.id ? 'Adding…' : '🔔 Notify me if earlier slot opens'}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Boarding list */}
                {upcomingBoarding.length > 0 && (
                  <div className="cp-card">
                    <h3 className="cp-card-title">🏠 Upcoming Boarding</h3>
                    <div className="cp-history-list">
                      {upcomingBoarding.map(function (res) {
                        var start = new Date(res.start_date + 'T00:00:00')
                        var end = new Date(res.end_date + 'T00:00:00')
                        var petNames = (res.boarding_reservation_pets || [])
                          .map(function (bp) { return bp.pets && bp.pets.name })
                          .filter(Boolean)
                          .join(', ')
                        return (
                          <div key={res.id} className="cp-upcoming-item">
                            <div className="cp-history-date-col">
                              <span className="cp-history-month">{start.toLocaleDateString('en-US', { month: 'short' })}</span>
                              <span className="cp-history-day">{start.getDate()}</span>
                              <span className="cp-history-year">{start.getFullYear()}</span>
                            </div>
                            <div className="cp-history-details">
                              <div className="cp-history-top-row">
                                <span className="cp-history-service">
                                  🏠 Boarding · {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <div className="cp-history-meta">
                                {petNames && <span>🐾 {petNames}</span>}
                                {res.kennels && res.kennels.name && <span>🏠 Kennel: {res.kennels.name}</span>}
                              </div>
                              {res.special_instructions && (
                                <div className="cp-history-notes">📝 {res.special_instructions}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Help text — remind them how to make changes */}
                <div style={{
                  padding: '14px 16px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  marginTop: '16px',
                  fontSize: '13px',
                  color: '#6b7280',
                  textAlign: 'center'
                }}>
                  💬 Need to change an appointment? Message your groomer — they'll help you reschedule or cancel.
                </div>
              </>
            )}
          </div>
        )}
        {/* ═══════ PAST GROOMING TAB ═══════ */}
        {activeTab === 'grooming' && (
          <div>
            {pastGrooming.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '56px', marginBottom: '12px' }}>✂️</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No grooming history yet</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Past appointments will show up here after they're complete.</p>
              </div>
            ) : (
              <div className="cp-card">
                <h3 className="cp-card-title">✂️ Past Grooming ({pastGrooming.length})</h3>
                <div className="cp-history-list">
                  {pastGrooming.map(function (appt) {
                    var d = new Date(appt.appointment_date + 'T00:00:00')
                    var price = appt.final_price || appt.quoted_price
                    return (
                      <div key={appt.id} className="cp-history-item">
                        <div className="cp-history-date-col">
                          <span className="cp-history-month">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="cp-history-day">{d.getDate()}</span>
                          <span className="cp-history-year">{d.getFullYear()}</span>
                        </div>
                        <div className="cp-history-details">
                          <div className="cp-history-top-row">
                            <span className="cp-history-service">
                              {(appt.appointment_pets && appt.appointment_pets.length > 0)
                                ? appt.appointment_pets
                                    .map(function (ap) { return ap.services && ap.services.service_name })
                                    .filter(Boolean)
                                    .join(' · ') || 'Grooming'
                                : ((appt.services && appt.services.service_name) || 'Grooming')}
                            </span>
                            {price && (
                              <span style={{ fontWeight: '700', color: '#16a34a' }}>${parseFloat(price).toFixed(2)}</span>
                            )}
                          </div>
                          <div className="cp-history-meta">
                            <span>🐾 {
                              (appt.appointment_pets && appt.appointment_pets.length > 0)
                                ? appt.appointment_pets
                                    .map(function (ap) { return ap.pets && ap.pets.name })
                                    .filter(Boolean)
                                    .join(', ')
                                : ((appt.pets && appt.pets.name) || 'Pet')
                            }</span>
                            {appt.start_time && <span>🕐 {formatTime(appt.start_time)}</span>}
                          </div>
                          {appt.service_notes && (
                            <div className="cp-history-notes">📝 {appt.service_notes}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ PAST BOARDING TAB ═══════ */}
        {activeTab === 'boarding' && (
          <div>
            {pastBoarding.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '56px', marginBottom: '12px' }}>🏠</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No boarding stays yet</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Past boarding stays will show up here.</p>
              </div>
            ) : (
              <div className="cp-card">
                <h3 className="cp-card-title">🏠 Past Boarding ({pastBoarding.length})</h3>
                <div className="cp-history-list">
                  {pastBoarding.map(function (res) {
                    var start = new Date(res.start_date + 'T00:00:00')
                    var end = new Date(res.end_date + 'T00:00:00')
                    var petNames = (res.boarding_reservation_pets || [])
                      .map(function (bp) { return bp.pets && bp.pets.name })
                      .filter(Boolean)
                      .join(', ')
                    var nights = Math.round((end - start) / (1000 * 60 * 60 * 24))
                    return (
                      <div key={res.id} className="cp-history-item">
                        <div className="cp-history-date-col">
                          <span className="cp-history-month">{start.toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="cp-history-day">{start.getDate()}</span>
                          <span className="cp-history-year">{start.getFullYear()}</span>
                        </div>
                        <div className="cp-history-details">
                          <div className="cp-history-top-row">
                            <span className="cp-history-service">
                              🏠 {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {nights > 0 && <span style={{ color: '#6b7280', fontWeight: '400', marginLeft: '8px' }}>({nights} night{nights !== 1 ? 's' : ''})</span>}
                            </span>
                          </div>
                          <div className="cp-history-meta">
                            {petNames && <span>🐾 {petNames}</span>}
                            {res.kennels && res.kennels.name && <span>🏠 {res.kennels.name}</span>}
                          </div>
                          {res.special_instructions && (
                            <div className="cp-history-notes">📝 {res.special_instructions}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ VACCINATIONS TAB ═══════ */}
        {activeTab === 'vaccinations' && (
          <div>
            {pets.length === 0 ? (
              <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '56px', marginBottom: '12px' }}>💉</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No pets yet</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Add a pet first to track vaccinations.</p>
              </div>
            ) : (
              <>
                {pets.map(function (pet) {
                  var petVax = vaccinations.filter(function (v) { return v.pet_id === pet.id })
                  return (
                    <div key={pet.id} className="cp-card" style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div className="cp-pet-avatar" style={{ background: getPetAvatar(pet), width: '36px', height: '36px', fontSize: '14px' }}>
                          {(pet.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>{pet.name}</h4>
                          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{pet.breed}</p>
                        </div>
                      </div>

                      {petVax.length === 0 ? (
                        <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                          No vaccination records on file. Ask your groomer to add them!
                        </div>
                      ) : (
                        <div>
                          {petVax.map(function (vax) {
                            var status = getVaxStatus(vax.expiration_date)
                            var borderColor = status === 'current' ? '#16a34a' : status === 'due_soon' ? '#f59e0b' : '#dc2626'
                            var emoji = vax.vaccine_type === 'rabies' ? '🔴' : vax.vaccine_type === 'dhpp' ? '🟡' : vax.vaccine_type === 'bordetella' ? '🟢' : '💉'
                            return (
                              <div key={vax.id} style={{
                                padding: '12px 14px',
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderLeft: '4px solid ' + borderColor,
                                borderRadius: '8px',
                                marginBottom: '8px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827' }}>
                                      {emoji} {(vax.vaccine_type || 'other').toUpperCase()}
                                      {vax.vaccine_name && vax.vaccine_name !== vax.vaccine_type && (
                                        <span style={{ fontWeight: '400', color: '#6b7280', fontSize: '13px' }}> ({vax.vaccine_name})</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                      Given: {formatDate(vax.administered_date)} · Expires: {formatDate(vax.expiration_date)}
                                    </div>
                                    {vax.vet_clinic && (
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                        🏥 {vax.vet_clinic}
                                      </div>
                                    )}
                                  </div>
                                  <span style={Object.assign({
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    whiteSpace: 'nowrap'
                                  }, getVaxStatusStyle(status))}>
                                    {status === 'current' ? '✅ Current' : status === 'due_soon' ? '⚠️ Due Soon' : '❌ Expired'}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ═══════ PAYMENTS TAB ═══════ */}
        {activeTab === 'payments' && (
          <div>
            {(function () {
              var totalPaid = clientPayments.reduce(function (sum, p) { return sum + parseFloat(p.amount || 0) }, 0)
              var totalTips = clientPayments.reduce(function (sum, p) { return sum + parseFloat(p.tip_amount || 0) }, 0)

              if (clientPayments.length === 0) {
                return (
                  <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '56px', marginBottom: '12px' }}>💳</div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No payments yet</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Your payment history will show up here.</p>
                  </div>
                )
              }

              return (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div className="cp-card" style={{ flex: '1 1 150px', padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a' }}>
                        ${totalPaid.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                        Total Paid
                      </div>
                    </div>
                    {totalTips > 0 && (
                      <div className="cp-card" style={{ flex: '1 1 150px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '800', color: brandColor }}>
                          ${totalTips.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                          Total Tips
                        </div>
                      </div>
                    )}
                    <div className="cp-card" style={{ flex: '1 1 150px', padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: '800', color: '#111827' }}>
                        {clientPayments.length}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                        Payment{clientPayments.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Payment list */}
                  <div className="cp-card">
                    <h3 className="cp-card-title">💳 Payment History</h3>
                    <div>
                      {clientPayments.map(function (p) {
                        var amount = parseFloat(p.amount || 0)
                        var tip = parseFloat(p.tip_amount || 0)
                        var total = amount + tip
                        // MULTI-PET aware pet name + service name (fall back to single pet for legacy)
                        var appt = p.appointments
                        var aps = appt && appt.appointment_pets
                        var isMultiPet = aps && aps.length > 0
                        var petName, serviceName
                        if (isMultiPet) {
                          petName = aps.map(function (ap) { return ap.pets && ap.pets.name }).filter(Boolean).join(', ')
                          var svcList = []
                          aps.forEach(function (ap) {
                            var s = ap.services && ap.services.service_name
                            if (s && svcList.indexOf(s) === -1) svcList.push(s)
                          })
                          serviceName = svcList.join(', ')
                        } else {
                          petName = appt && appt.pets && appt.pets.name
                          serviceName = appt && appt.services && appt.services.service_name
                        }
                        return (
                          <div key={p.id} style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid #f3f4f6',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                            flexWrap: 'wrap'
                          }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>
                                {methodIcon(p.method)} {(p.method || 'payment').charAt(0).toUpperCase() + (p.method || 'payment').slice(1)}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                {formatDate(p.created_at)}
                                {serviceName && <span> · ✂️ {serviceName}</span>}
                                {petName && <span> · 🐾 {petName}</span>}
                              </div>
                              {p.notes && (
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', fontStyle: 'italic' }}>
                                  📝 {p.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '16px', fontWeight: '800', color: '#16a34a' }}>
                                ${total.toFixed(2)}
                              </div>
                              {tip > 0 && (
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                  ${amount.toFixed(2)} + ${tip.toFixed(2)} tip
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}
        {/* Messages tab navigates to /portal/messages — no render here */}

      </div>

      {/* ═══════ ADD PET MODAL ═══════ */}
      {showAddPet && (
        <div
          onClick={handleCloseAddPet}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            onClick={function (e) { e.stopPropagation() }}
            style={{
              background: '#fff',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
            }}
          >
            {/* Header */}
            <div style={{
              background: brandColor,
              color: '#fff',
              padding: '20px 24px',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>🐾 Add a Pet</h2>
              <button
                onClick={handleCloseAddPet}
                disabled={addingPet}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  fontSize: '18px',
                  cursor: addingPet ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {addPetError && (
                <div style={{
                  padding: '10px 12px',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  color: '#991b1b',
                  marginBottom: '14px',
                  fontSize: '13px'
                }}>
                  {addPetError}
                </div>
              )}

              <PetField
                label="Pet Name"
                value={newPetName}
                onChange={setNewPetName}
                placeholder="e.g. Bella"
                required
              />

              {/* Species toggle — drives the breed picker list below */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Species <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={function () { setNewPetSpecies('dog'); setNewPetBreed('') }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid ' + (newPetSpecies === 'dog' ? '#7c3aed' : '#d1d5db'),
                      background: newPetSpecies === 'dog' ? '#7c3aed' : '#fff',
                      color: newPetSpecies === 'dog' ? '#fff' : '#374151',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    🐶 Dog
                  </button>
                  <button
                    type="button"
                    onClick={function () { setNewPetSpecies('cat'); setNewPetBreed('') }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid ' + (newPetSpecies === 'cat' ? '#7c3aed' : '#d1d5db'),
                      background: newPetSpecies === 'cat' ? '#7c3aed' : '#fff',
                      color: newPetSpecies === 'cat' ? '#fff' : '#374151',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    🐱 Cat
                  </button>
                </div>
              </div>

              {/* Breed — type-to-filter dropdown, "+ Use as custom" at the bottom for unusual breeds */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Breed <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <BreedPicker
                  value={newPetBreed}
                  onChange={setNewPetBreed}
                  breeds={newPetSpecies === 'cat' ? CAT_BREEDS : DOG_BREEDS}
                  placeholder={newPetSpecies === 'cat' ? 'Search or type a cat breed...' : 'Search or type a dog breed...'}
                  required
                />
              </div>
              <PetField
                label="Weight (lbs)"
                value={newPetWeight}
                onChange={setNewPetWeight}
                placeholder="e.g. 25"
                type="number"
                required
              />
              <PetField
                label="Age (years)"
                value={newPetAge}
                onChange={setNewPetAge}
                placeholder="e.g. 3"
                type="number"
                required
              />

              {/* ——— Health & Vet Info divider ——— */}
              <div style={{ marginTop: '8px', marginBottom: '14px', paddingTop: '14px', borderTop: '1px dashed #e5e7eb' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>
                  Health & Vet Info
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  All optional — helps us in case of an emergency
                </div>
              </div>

              {/* Allergies (textarea) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Allergies <span style={{ color: '#9ca3af', fontWeight: '400', textTransform: 'none', letterSpacing: 'normal' }}>(optional)</span>
                </label>
                <textarea
                  value={newPetAllergies}
                  onChange={function (e) { setNewPetAllergies(e.target.value) }}
                  placeholder="e.g. chicken, oatmeal shampoo, bee stings..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Medications (textarea) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Medications <span style={{ color: '#9ca3af', fontWeight: '400', textTransform: 'none', letterSpacing: 'normal' }}>(optional)</span>
                </label>
                <textarea
                  value={newPetMedications}
                  onChange={function (e) { setNewPetMedications(e.target.value) }}
                  placeholder="e.g. Apoquel 16mg daily, Heartgard monthly..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Vaccination Expiry (date) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Vaccination Expiry <span style={{ color: '#9ca3af', fontWeight: '400', textTransform: 'none', letterSpacing: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="date"
                  value={newPetVaxExpiry}
                  onChange={function (e) { setNewPetVaxExpiry(e.target.value) }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Vet Name */}
              <PetField
                label="Vet Name (optional)"
                value={newPetVetName}
                onChange={setNewPetVetName}
                placeholder="e.g. Dr. Smith at Paws Veterinary"
              />

              {/* Vet Phone */}
              <PetField
                label="Vet Phone (optional)"
                value={newPetVetPhone}
                onChange={setNewPetVetPhone}
                placeholder="e.g. (555) 123-4567"
                type="tel"
              />

              {/* ——— Special Notes divider ——— */}
              <div style={{ marginTop: '8px', marginBottom: '10px', paddingTop: '14px', borderTop: '1px dashed #e5e7eb' }}></div>

              {/* Special Notes (textarea) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Special Notes <span style={{ color: '#9ca3af', fontWeight: '400', textTransform: 'none', letterSpacing: 'normal' }}>(optional)</span>
                </label>
                <textarea
                  value={newPetNotes}
                  onChange={function (e) { setNewPetNotes(e.target.value) }}
                  placeholder="Anything else your groomer should know..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  onClick={handleCloseAddPet}
                  disabled={addingPet}
                  style={{
                    padding: '11px 20px',
                    background: '#fff',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: addingPet ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewPet}
                  disabled={addingPet}
                  style={{
                    padding: '11px 20px',
                    background: addingPet ? '#9ca3af' : brandColor,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: addingPet ? 'wait' : 'pointer'
                  }}
                >
                  {addingPet ? 'Saving...' : '🐾 Save Pet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          EDIT HEALTH & VET INFO MODAL (existing pet)
          ═══════════════════════════════════════════════════ */}
      {editingHealthPet && (
        <div
          onClick={handleCloseEditHealth}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            onClick={function (e) { e.stopPropagation() }}
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>
                🏥 Health & Vet Info
              </h3>
              <button
                onClick={handleCloseEditHealth}
                disabled={savingHealth}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: savingHealth ? 'not-allowed' : 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 18px', color: '#6b7280', fontSize: '13px' }}>
              Updating <strong style={{ color: '#111827' }}>{editingHealthPet.name}</strong>'s health & vet info
            </p>

            {editHealthError && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '14px' }}>
                {editHealthError}
              </div>
            )}

            {/* Allergies */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Allergies
              </label>
              <textarea
                value={editHealthAllergies}
                onChange={function (e) { setEditHealthAllergies(e.target.value) }}
                placeholder="e.g. chicken, oatmeal shampoo, bee stings..."
                rows={2}
                disabled={savingHealth}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Medications */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Medications
              </label>
              <textarea
                value={editHealthMedications}
                onChange={function (e) { setEditHealthMedications(e.target.value) }}
                placeholder="e.g. Apoquel 16mg daily, Heartgard monthly..."
                rows={2}
                disabled={savingHealth}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Vaccination Expiry */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vaccination Expiry
              </label>
              <input
                type="date"
                value={editHealthVaxExpiry}
                onChange={function (e) { setEditHealthVaxExpiry(e.target.value) }}
                disabled={savingHealth}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Vet Name */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vet Name
              </label>
              <input
                type="text"
                value={editHealthVetName}
                onChange={function (e) { setEditHealthVetName(e.target.value) }}
                placeholder="e.g. Dr. Smith at Paws Veterinary"
                disabled={savingHealth}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Vet Phone */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vet Phone
              </label>
              <input
                type="tel"
                value={editHealthVetPhone}
                onChange={function (e) { setEditHealthVetPhone(e.target.value) }}
                placeholder="e.g. (555) 123-4567"
                disabled={savingHealth}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={handleCloseEditHealth}
                disabled={savingHealth}
                style={{
                  padding: '11px 20px',
                  background: '#fff',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: savingHealth ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHealth}
                disabled={savingHealth}
                style={{
                  padding: '11px 20px',
                  background: brandColor,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '14px',
                  cursor: savingHealth ? 'not-allowed' : 'pointer',
                  opacity: savingHealth ? 0.6 : 1
                }}
              >
                {savingHealth ? 'Saving...' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          REPORT CARD VIEWER (read-only + print for clients)
          ═══════════════════════════════════════════════════ */}
      {viewingReportCard && (() => {
        var pet = pets.find(function (p) { return p.id === viewingReportCard.pet_id })
        return (
          <ReportCardModal
            mode="view"
            clientView={true}
            serviceType={viewingReportCard.service_type}
            petId={viewingReportCard.pet_id}
            clientId={client && client.id}
            petName={(pet && pet.name) || 'Pet'}
            petBreed={(pet && pet.breed) || ''}
            petPhoto={(pet && pet.photo_url) || null}
            appointmentId={viewingReportCard.appointment_id}
            boardingReservationId={viewingReportCard.boarding_reservation_id}
            reportCard={viewingReportCard}
            onClose={function () { setViewingReportCard(null) }}
            onSaved={function () { setViewingReportCard(null) }}
          />
        )
      })()}

      {/* Pay-now modal — opens when a client clicks "Pay $X" on an upcoming appt */}
      {payingAppointment && (
        <ClientPaymentModal
          appointment={payingAppointment}
          balance={payingBalance}
          onClose={function () {
            setPayingAppointment(null)
            setPayingBalance(0)
          }}
          onSuccess={function () {
            setPayingAppointment(null)
            setPayingBalance(0)
            // Reload everything so balances + payment history reflect the new charge
            loadPortalData()
          }}
        />
      )}
    </div>
  )
}

// ─── "Coming Soon" placeholder ────────────────────────
function ComingSoon({ icon, title, subtitle, brandColor }) {
  return (
    <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: '56px', marginBottom: '12px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>{title}</h3>
      <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
        {subtitle || 'Coming soon! Check back shortly.'}
      </p>
    </div>
  )
}

// ─── Pet Field input helper (used inside Add Pet modal) ───
function PetField({ label, value, onChange, placeholder, type, required }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '16px',
          boxSizing: 'border-box'
        }}
      />
    </div>
  )
}
