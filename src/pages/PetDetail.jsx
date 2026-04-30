import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import IncidentModal from '../components/IncidentModal'
import { BehaviorTagsRow, BehaviorTagsEditor } from '../components/BehaviorTags'
import ReportCardModal from '../components/ReportCardModal'
import { formatPhone } from '../lib/phone'

var TABS = [
  { key: 'overview', label: '🐾 Overview' },
  { key: 'incidents', label: '🚨 Incidents' },
  { key: 'grooming', label: '✂️ Grooming History' },
  { key: 'boarding', label: '🏠 Boarding History' },
  { key: 'reports', label: '📋 Report Cards' },
  { key: 'vaccinations', label: '💉 Vaccinations' },
  { key: 'notes', label: '📝 Notes' },
  { key: 'payments', label: '💳 Payments' }
]

var BEHAVIOR_DISPLAY = {
  great:     { emoji: '🌟', label: 'Great',     color: '#16a34a', bg: '#dcfce7' },
  good:      { emoji: '👍', label: 'Good',      color: '#65a30d', bg: '#ecfccb' },
  okay:      { emoji: '😐', label: 'Okay',      color: '#ca8a04', bg: '#fef9c3' },
  anxious:   { emoji: '😰', label: 'Anxious',   color: '#ea580c', bg: '#ffedd5' },
  difficult: { emoji: '⚠️', label: 'Difficult', color: '#dc2626', bg: '#fee2e2' },
}

var INCIDENT_TYPE_LABELS = {
  bite: '🦷 Bite',
  injury: '🩹 Injury',
  medical: '🏥 Medical',
  behavior: '⚠️ Behavior',
  escape: '🏃 Escape',
  property_damage: '💥 Property Damage',
  other: '📋 Other',
}

var SEVERITY_STYLE = {
  minor:    { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  moderate: { color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  serious:  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

// Vaccine type definitions (dogs + cats). Order matters for dropdown.
var VACCINE_TYPES = [
  { value: 'rabies',            label: 'Rabies',            emoji: '🦠', species: 'both' },
  { value: 'dhpp',              label: 'DHPP',              emoji: '💉', species: 'dog'  },
  { value: 'bordetella',        label: 'Bordetella',        emoji: '🐕', species: 'dog'  },
  { value: 'canine_influenza',  label: 'Canine Influenza',  emoji: '🤧', species: 'dog'  },
  { value: 'leptospirosis',     label: 'Leptospirosis',     emoji: '💧', species: 'dog'  },
  { value: 'lyme',              label: 'Lyme',              emoji: '🕷️', species: 'dog'  },
  { value: 'fvrcp',             label: 'FVRCP',             emoji: '🐈', species: 'cat'  },
  { value: 'felv',              label: 'FeLV',              emoji: '🐱', species: 'cat'  },
  { value: 'other',             label: 'Other',             emoji: '💊', species: 'both' }
]

function getVaxTypeInfo(type) {
  for (var i = 0; i < VACCINE_TYPES.length; i++) {
    if (VACCINE_TYPES[i].value === type) return VACCINE_TYPES[i]
  }
  return { label: type, emoji: '💉', species: 'both' }
}

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
  var [reportCards, setReportCards] = useState([])
  var [viewingReportCard, setViewingReportCard] = useState(null)
  var [boardingHistory, setBoardingHistory] = useState([])
  var [vaccinations, setVaccinations] = useState([])
  var [notes, setNotes] = useState([])
  var [payments, setPayments] = useState([])
  var [incidents, setIncidents] = useState([])
  var [incidentModal, setIncidentModal] = useState(null) // { mode, incident? } | null
  var [staffOptions, setStaffOptions] = useState([])
  var [loadingTab, setLoadingTab] = useState(false)

  // Notes form
  var [newNote, setNewNote] = useState('')
  var [savingNote, setSavingNote] = useState(false)

  // Vaccination modal
  var [showVaxModal, setShowVaxModal] = useState(false)
  var [editingVaxId, setEditingVaxId] = useState(null)
  var [vaxForm, setVaxForm] = useState({
    vaccine_type: 'rabies',
    vaccine_label: '',
    expiry_date: '',
    date_administered: '',
    vet_clinic: '',
    notes: ''
  })
  var [savingVax, setSavingVax] = useState(false)
  var [pendingCertFile, setPendingCertFile] = useState(null)   // new file picked in modal, not yet uploaded
  var [existingCertUrl, setExistingCertUrl] = useState(null)   // current document_url on the record being edited
  var [uploadingCert, setUploadingCert] = useState(false)

  // 📸 Auto-read vax cert with Claude vision
  var [autoReadingVax, setAutoReadingVax] = useState(false)
  var [autoReadError, setAutoReadError] = useState(null)
  var [autoReadWarning, setAutoReadWarning] = useState(null)   // "low confidence" or "image blurry" notice after a successful read
  var autoReadTopInputRef = useRef(null)
  var autoReadInlineInputRef = useRef(null)

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
    if (activeTab === 'incidents') fetchIncidents()
    if (activeTab === 'reports') fetchReportCards()
  }, [activeTab, id, pet])

  async function fetchReportCards() {
    var { data } = await supabase
      .from('report_cards')
      .select('*')
      .eq('pet_id', id)
      .order('created_at', { ascending: false })
    setReportCards(data || [])
  }

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

    // Also fetch incident count for the header badge (cheap query, always fresh)
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('pet_id', id)
      .then(function (res) { if (res.count != null) setIncidents(Array(res.count).fill({ id: '_placeholder' })) })

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
    var { data, error } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('pet_id', id)
      .order('expiry_date', { ascending: true })

    if (error) {
      console.error('Error fetching vaccinations:', error)
      setVaccinations([])
    } else {
      setVaccinations(data || [])
    }
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

  async function fetchIncidents() {
    setLoadingTab(true)
    // Fetch incidents for this pet, newest first, with staff name joined
    var { data } = await supabase
      .from('incidents')
      .select('*, staff_members(first_name, last_name)')
      .eq('pet_id', id)
      .order('incident_date', { ascending: false })
      .order('created_at', { ascending: false })
    setIncidents(data || [])
    // Also load staff list for modal dropdown (only fetch once)
    if (staffOptions.length === 0) {
      var { data: { user } } = await supabase.auth.getUser()
      if (user) {
        var { data: staffList } = await supabase
          .from('staff_members')
          .select('id, first_name, last_name')
          .eq('groomer_id', user.id)
          .eq('status', 'active')
          .order('first_name')
        setStaffOptions(staffList || [])
      }
    }
    setLoadingTab(false)
  }

  function handleIncidentSaved() {
    fetchIncidents()
  }

  async function handleSaveEdit(e) {
    e.preventDefault()

    // Require weight + age — Claude needs both to quote price ranges accurately
    if (!editForm.weight || Number(editForm.weight) <= 0) {
      alert('Weight is required (in lbs) — Claude uses it to quote accurate prices.')
      return
    }
    if (!editForm.age || String(editForm.age).trim() === '') {
      alert('Age is required.')
      return
    }

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
        microchip_id: editForm.microchip_id,
        behavior_tags: editForm.behavior_tags || []
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

  function openAddVaxModal() {
    setEditingVaxId(null)
    setVaxForm({
      vaccine_type: 'rabies',
      vaccine_label: '',
      expiry_date: '',
      date_administered: '',
      vet_clinic: '',
      notes: ''
    })
    setPendingCertFile(null)
    setExistingCertUrl(null)
    setAutoReadError(null)
    setAutoReadWarning(null)
    setShowVaxModal(true)
  }

  function openEditVaxModal(vax) {
    setEditingVaxId(vax.id)
    setVaxForm({
      vaccine_type: vax.vaccine_type || 'rabies',
      vaccine_label: vax.vaccine_label || '',
      expiry_date: vax.expiry_date || '',
      date_administered: vax.date_administered || '',
      vet_clinic: vax.vet_clinic || '',
      notes: vax.notes || ''
    })
    setPendingCertFile(null)
    setExistingCertUrl(vax.document_url || null)
    setAutoReadError(null)
    setAutoReadWarning(null)
    setShowVaxModal(true)
  }

  // 📸 Auto-read a vaccine certificate image with Claude Vision.
  // Sends the image to chat-command-v2-services edge function with vax_cert_mode = true,
  // gets back structured JSON, and auto-fills the vax form.
  async function handleAutoReadVaxCert(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAutoReadError('Please upload an image (JPG, PNG, or HEIC).')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setAutoReadError('Image is too big (10MB max). Try a smaller photo.')
      return
    }

    setAutoReadError(null)
    setAutoReadWarning(null)
    setAutoReadingVax(true)

    try {
      // Convert file to base64
      var base64 = await new Promise(function(resolve, reject) {
        var reader = new FileReader()
        reader.onload = function() {
          var result = reader.result
          // Strip the "data:image/xxx;base64," prefix
          var comma = result.indexOf(',')
          resolve(comma >= 0 ? result.substring(comma + 1) : result)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Normalize media type (HEIC → JPEG for API compatibility)
      var mediaType = file.type
      if (mediaType === 'image/heic' || mediaType === 'image/heif') {
        mediaType = 'image/jpeg'
      }

      var { data: { session } } = await supabase.auth.getSession()
      var token = session ? session.access_token : ''

      var res = await fetch(
        import.meta.env.VITE_SUPABASE_URL + '/functions/v1/chat-command-v2-services',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({
            vax_cert_mode: true,
            images: [{ media_type: mediaType, data: base64 }],
            message: 'Read this vaccine cert',
            groomer_id: pet ? pet.groomer_id : null,
          }),
        }
      )

      var result = await res.json()

      if (result.error) {
        setAutoReadError(result.error)
        setAutoReadingVax(false)
        return
      }

      var vaxData = result.vax_data
      if (!vaxData) {
        setAutoReadError('Could not read the photo. Try a clearer picture.')
        setAutoReadingVax(false)
        return
      }

      // If Claude said this isn't a vax cert, show warning and don't fill anything
      if (vaxData.warning && !vaxData.vaccine_type && !vaxData.expiry_date) {
        setAutoReadError(vaxData.warning)
        setAutoReadingVax(false)
        return
      }

      // Auto-fill the form with what Claude read. Preserve existing values if Claude returned null.
      setVaxForm(function(prev) {
        return {
          vaccine_type: vaxData.vaccine_type || prev.vaccine_type,
          vaccine_label: vaxData.vaccine_label || prev.vaccine_label,
          expiry_date: vaxData.expiry_date || prev.expiry_date,
          date_administered: vaxData.date_administered || prev.date_administered,
          vet_clinic: vaxData.vet_clinic || prev.vet_clinic,
          notes: vaxData.notes || prev.notes,
        }
      })

      // Also attach the photo as the cert file so it saves with the record
      setPendingCertFile(file)

      // Show confidence / warnings so the groomer knows to double-check
      if (vaxData.confidence === 'low') {
        setAutoReadWarning('⚠️ Low confidence — please double-check the fields before saving.')
      } else if (vaxData.confidence === 'medium') {
        setAutoReadWarning('👀 Please verify the fields — some details were hard to read.')
      } else if (vaxData.warning) {
        setAutoReadWarning(vaxData.warning)
      } else {
        setAutoReadWarning('✅ Filled in from photo — please double-check before saving.')
      }

      setAutoReadingVax(false)
    } catch (err) {
      console.error('Auto-read vax cert failed:', err)
      setAutoReadError('Something went wrong. Try again.')
      setAutoReadingVax(false)
    }
  }

  async function handleSaveVaccination(e) {
    e.preventDefault()

    // Guardrails (match the edge-function tool layer)
    if (vaxForm.vaccine_type === 'other' && !vaxForm.vaccine_label.trim()) {
      alert('Please enter a vaccine name for "Other".')
      return
    }
    if (vaxForm.vaccine_type === 'bordetella' && !vaxForm.date_administered) {
      alert('Bordetella requires the date it was administered (7-day wait rule before boarding).')
      return
    }
    if (!vaxForm.expiry_date) {
      alert('Expiry date is required.')
      return
    }

    // Client-side file size cap (server-side cap is 10MB, but fail early for a nicer error)
    if (pendingCertFile && pendingCertFile.size > 10 * 1024 * 1024) {
      alert('Certificate photo must be 10 MB or smaller.')
      return
    }

    setSavingVax(true)

    var { data: { user } } = await supabase.auth.getUser()

    var payload = {
      pet_id: id,
      groomer_id: user.id,
      vaccine_type: vaxForm.vaccine_type,
      vaccine_label: vaxForm.vaccine_label.trim() || null,
      expiry_date: vaxForm.expiry_date,
      date_administered: vaxForm.date_administered || null,
      vet_clinic: vaxForm.vet_clinic.trim() || null,
      notes: vaxForm.notes.trim() || null
    }

    // Capture original document_url so we can clean up the old storage file
    // if user is replacing it or removing it.
    var originalDocUrl = null
    if (editingVaxId) {
      var currentRecord = vaccinations.find(function(v) { return v.id === editingVaxId })
      if (currentRecord) originalDocUrl = currentRecord.document_url || null
    }

    // Save the main record first so we have a vaccination id to use in the file path.
    var savedVaxId = editingVaxId
    var error

    if (editingVaxId) {
      var res = await supabase
        .from('vaccinations')
        .update(Object.assign({ updated_at: new Date().toISOString() }, payload))
        .eq('id', editingVaxId)
      error = res.error
    } else {
      var res2 = await supabase
        .from('vaccinations')
        .insert([payload])
        .select('id')
        .single()
      error = res2.error
      if (res2.data) savedVaxId = res2.data.id
    }

    if (error) {
      alert('Error saving vaccination: ' + error.message)
      setSavingVax(false)
      return
    }

    // ---- Handle cert photo upload / remove / replace ----
    try {
      if (pendingCertFile && savedVaxId) {
        // Upload (replace path: {groomer_id}/{pet_id}/{vax_id}_{timestamp}.{ext})
        setUploadingCert(true)
        var ext = pendingCertFile.name.split('.').pop().toLowerCase()
        var filePath = user.id + '/' + id + '/' + savedVaxId + '_' + Date.now() + '.' + ext
        var { error: uploadErr } = await supabase.storage
          .from('vax-certs')
          .upload(filePath, pendingCertFile, { upsert: false })
        if (uploadErr) throw uploadErr

        // Update the vaccination record with the new document_url
        var { error: updateErr } = await supabase
          .from('vaccinations')
          .update({ document_url: filePath, updated_at: new Date().toISOString() })
          .eq('id', savedVaxId)
        if (updateErr) throw updateErr

        // Best-effort cleanup of the old file if this was a replace
        if (originalDocUrl && originalDocUrl !== filePath) {
          await supabase.storage.from('vax-certs').remove([originalDocUrl])
        }
      } else if (editingVaxId && originalDocUrl && existingCertUrl === null) {
        // User cleared existing cert without picking a new one → remove it
        await supabase.storage.from('vax-certs').remove([originalDocUrl])
        await supabase
          .from('vaccinations')
          .update({ document_url: null, updated_at: new Date().toISOString() })
          .eq('id', editingVaxId)
      }
    } catch (uploadError) {
      alert('Vaccination saved, but cert photo upload failed: ' + (uploadError.message || uploadError))
    } finally {
      setUploadingCert(false)
    }

    setShowVaxModal(false)
    setEditingVaxId(null)
    setPendingCertFile(null)
    setExistingCertUrl(null)
    fetchVaccinations()
    setSavingVax(false)
  }

  async function handleDeleteVaccination(vaxId) {
    if (!confirm('Delete this vaccination record? This cannot be undone.')) return
    // Find the record so we can clean up its cert photo from storage too
    var record = vaccinations.find(function(v) { return v.id === vaxId })
    var { error } = await supabase.from('vaccinations').delete().eq('id', vaxId)
    if (error) {
      alert('Error deleting: ' + error.message)
    } else {
      if (record && record.document_url) {
        // Best-effort cert cleanup (ignore errors — record is already gone)
        await supabase.storage.from('vax-certs').remove([record.document_url])
      }
      fetchVaccinations()
    }
  }

  // ─── Mark pet as passed away (memorial) ───────────────────────────────
  // Sets is_memorial=true and memorial_date=now. Pet stays in DB with all
  // history intact, but gets hidden from active lists and shown in the
  // "🌈 Pets We Remember" section on the client profile.
  async function handleMarkMemorial() {
    if (!pet) return
    var msg = pet.is_memorial
      ? 'Restore ' + pet.name + ' as an active pet?'
      : 'Mark ' + pet.name + ' as passed away? 🌈\n\n' +
        pet.name + ' will move to the memorial section on ' +
        (client ? client.first_name : 'the owner') +
        '\'s profile. All photos and visit history will be preserved.\n\n' +
        'You can restore them later if needed.'
    if (!confirm(msg)) return

    var nowIso = new Date().toISOString()
    var { error } = await supabase
      .from('pets')
      .update({
        is_memorial: !pet.is_memorial,
        memorial_date: pet.is_memorial ? null : nowIso,
        updated_at: nowIso,
      })
      .eq('id', pet.id)
    if (error) {
      alert('Could not update: ' + error.message)
      return
    }
    // Refresh the local pet state so the banner + buttons update immediately
    setPet(Object.assign({}, pet, {
      is_memorial: !pet.is_memorial,
      memorial_date: pet.is_memorial ? null : nowIso,
    }))
  }

  // ─── Remove pet ───────────────────────────────────────────────────────
  // Two-step strategy:
  //   1. Try hard delete first. If pet has zero history (no appointments,
  //      no boarding, no payments) the row goes away cleanly.
  //   2. If FK constraint blocks the delete (pet has visit history),
  //      fall back to setting is_archived=true. Pet is then hidden from
  //      every view — active lists, memorial section, booking dropdowns,
  //      everywhere. Past appointments still work in the DB.
  // Either way, the user just sees "Removed" — no scary FK error.
  async function handleHardDeletePet() {
    if (!pet || !client) return
    var msg = '🗑️ Remove ' + pet.name + '?\n\n' +
      'This hides ' + pet.name + ' from your active pets, booking dropdowns, ' +
      'and the client portal. Past appointment history stays intact in the database.\n\n' +
      'Use "Mark as Passed Away" instead if you want a memorial section for grieving clients.\n\n' +
      'Type DELETE to confirm:'
    var typed = window.prompt(msg)
    if (typed !== 'DELETE') {
      if (typed !== null) alert('Cancelled — you must type DELETE exactly to confirm.')
      return
    }

    // 1) Try true hard delete
    var { error } = await supabase.from('pets').delete().eq('id', pet.id)

    if (!error) {
      // Pet had no history → fully gone. Bounce back to client profile.
      navigate('/clients/' + client.id)
      return
    }

    // 2) FK constraint blocked the delete (pet has appointments/boarding etc.)
    //    Fall back to archiving the pet so it disappears from all views.
    var { error: archErr } = await supabase
      .from('pets')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', pet.id)

    if (archErr) {
      // Both delete + archive failed — surface the original error.
      alert('Could not remove ' + pet.name + ': ' + archErr.message)
      return
    }

    // Archive succeeded → pet is hidden everywhere. Bounce back.
    navigate('/clients/' + client.id)
  }

  // Cert photo viewer: bucket is private, so we generate a short-lived signed URL on click.
  async function viewCertificate(path) {
    if (!path) return
    var { data, error } = await supabase.storage
      .from('vax-certs')
      .createSignedUrl(path, 60 * 60) // 1 hour
    if (error || !data) {
      alert('Could not open certificate: ' + (error && error.message ? error.message : 'unknown error'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
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

  function daysUntil(dateStr) {
    if (!dateStr) return null
    var exp = new Date(dateStr)
    var today = new Date()
    today.setHours(0, 0, 0, 0)
    exp.setHours(0, 0, 0, 0)
    return Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function getVaxRecordStatus(vax) {
    var d = daysUntil(vax.expiry_date)
    if (d === null) return 'unknown'
    if (d < 0) return 'expired'
    if (d <= 30) return 'due_soon'
    return 'current'
  }

  // Overall pet vax status — computed from the vaccinations table if we have any
  // records, otherwise falls back to the old pet-level vaccination_expiry column.
  function getVaxStatus() {
    if (vaccinations && vaccinations.length > 0) {
      var hasExpired = false
      var hasDueSoon = false
      for (var i = 0; i < vaccinations.length; i++) {
        var s = getVaxRecordStatus(vaccinations[i])
        if (s === 'expired') hasExpired = true
        if (s === 'due_soon') hasDueSoon = true
      }
      if (hasExpired) return 'expired'
      if (hasDueSoon) return 'due_soon'
      return 'current'
    }
    // Fallback — legacy pet-level vaccination_expiry
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
              {incidents.length > 0 && (
                <span
                  onClick={function () { setActiveTab('incidents') }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 10px', borderRadius: '999px',
                    background: '#fef2f2', color: '#991b1b',
                    border: '1px solid #fecaca', fontSize: '11px', fontWeight: '700',
                    cursor: 'pointer', letterSpacing: '0.02em',
                  }}
                  title="Click to view incident history"
                >
                  🚨 {incidents.length} INCIDENT{incidents.length === 1 ? '' : 'S'}
                </span>
              )}
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
                {client.phone && <span className="pd-owner-phone"> · 📱 {formatPhone(client.phone)}</span>}
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

      {/* Behavior tags banner — shown right at top so staff sees warnings first */}
      {pet.behavior_tags && pet.behavior_tags.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <BehaviorTagsRow tags={pet.behavior_tags} />
        </div>
      )}

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
                  <h3>
                    {vaxStatus === 'current' && 'Vaccinations Current'}
                    {vaxStatus === 'due_soon' && 'Vaccinations Due Soon'}
                    {vaxStatus === 'expired' && 'Vaccinations Expired'}
                    {vaxStatus === 'unknown' && 'No Vaccination Records'}
                  </h3>
                  <p>
                    {vaccinations.length > 0
                      ? vaccinations.length + ' vaccine record' + (vaccinations.length !== 1 ? 's' : '') + ' on file'
                      : 'Add individual shots below (Rabies, DHPP, Bordetella, etc.)'}
                  </p>
                </div>
              </div>
            </div>

            <div className="pd-vax-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
              <h3 className="pd-card-title" style={{ margin: 0 }}>💉 Vaccine Records</h3>
              <button className="pd-edit-btn" onClick={openAddVaxModal}>+ Add Vaccination</button>
            </div>

            {loadingTab ? (
              <div className="pd-tab-loading">Loading vaccinations...</div>
            ) : vaccinations.length === 0 ? (
              <div className="pd-empty">
                <div className="pd-empty-icon">💉</div>
                <h3>No vaccine records yet</h3>
                <p>Add Rabies, DHPP, Bordetella, and any other shots {pet.name} has received.</p>
                <button className="pd-edit-btn" onClick={openAddVaxModal} style={{ marginTop: '12px' }}>+ Add First Vaccination</button>
              </div>
            ) : (
              <div className="pd-vax-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {vaccinations.map(function(v) {
                  var info = getVaxTypeInfo(v.vaccine_type)
                  var status = getVaxRecordStatus(v)
                  var days = daysUntil(v.expiry_date)
                  var statusLabel = status === 'current' ? '✅ Current'
                                  : status === 'due_soon' ? '⚠️ Due in ' + days + ' day' + (days !== 1 ? 's' : '')
                                  : status === 'expired' ? '❌ Expired ' + Math.abs(days) + ' day' + (Math.abs(days) !== 1 ? 's' : '') + ' ago'
                                  : '❓ Unknown'
                  return (
                    <div key={v.id} className={'pd-vax-record pd-vax-card-' + status} style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '20px' }}>{info.emoji}</span>
                          <strong style={{ fontSize: '16px' }}>
                            {v.vaccine_type === 'other' && v.vaccine_label ? v.vaccine_label : info.label}
                          </strong>
                          <span className={'pd-vax-badge pd-vax-' + status} style={{ marginLeft: '8px' }}>{statusLabel}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#4b5563', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                          <span><strong>Expires:</strong> {formatDate(v.expiry_date)}</span>
                          {v.date_administered && <span><strong>Given:</strong> {formatDate(v.date_administered)}</span>}
                          {v.vet_clinic && <span><strong>Vet:</strong> {v.vet_clinic}</span>}
                        </div>
                        {v.notes && (
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
                            📝 {v.notes}
                          </div>
                        )}
                        {v.document_url && (
                          <div style={{ marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={function() { viewCertificate(v.document_url) }}
                              style={{ fontSize: '13px', color: '#2563eb', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              📎 View certificate
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button className="pd-edit-btn" onClick={function() { openEditVaxModal(v) }} style={{ padding: '6px 10px', fontSize: '13px' }}>✏️ Edit</button>
                        <button className="pd-edit-btn" onClick={function() { handleDeleteVaccination(v.id) }} style={{ padding: '6px 10px', fontSize: '13px', background: '#fee2e2', color: '#991b1b' }}>🗑 Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="pd-vax-vet" style={{ marginTop: '24px' }}>
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

            <div className="pd-vax-note" style={{ marginTop: '16px' }}>
              💡 Bordetella is a live vaccine — most boarding shops require it was given at least 7 days before boarding. That's why the <strong>date administered</strong> is required for bordetella.
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

        {/* Report Cards tab — full history, click to view + print */}
        {activeTab === 'reports' && (
          <div className="pd-tab-content">
            {reportCards.length === 0 ? (
              <div className="pd-empty-state">
                <h3>No report cards yet</h3>
                <p>Report cards are created from a grooming or boarding appointment popup once it's checked out.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {reportCards.map(function (rc) {
                  var rating = BEHAVIOR_DISPLAY[rc.behavior_rating]
                  var when = rc.created_at ? new Date(rc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
                  return (
                    <div
                      key={rc.id}
                      onClick={function () { setViewingReportCard(rc) }}
                      style={{
                        cursor: 'pointer',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderLeft: '4px solid #7c3aed',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        transition: 'box-shadow 0.15s',
                      }}
                      onMouseEnter={function (e) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                      onMouseLeave={function (e) { e.currentTarget.style.boxShadow = 'none' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
                            📋 {rc.service_type === 'grooming' ? 'Grooming' : 'Boarding'} Report — {when}
                          </div>
                          {rc.services_performed && (
                            <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '4px' }}>
                              ✂️ {rc.services_performed}
                            </div>
                          )}
                          {rc.groomer_name && (
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              By {rc.groomer_name}{rc.next_visit_weeks ? ' · See you in ' + rc.next_visit_weeks + ' weeks' : ''}
                            </div>
                          )}
                        </div>
                        {rating && (
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            background: rating.bg,
                            color: rating.color,
                            fontWeight: 700,
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                          }}>
                            {rating.emoji} {rating.label}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Report Card view modal — opens when a row is clicked */}
        {viewingReportCard && (
          <ReportCardModal
            mode="view"
            serviceType={viewingReportCard.service_type}
            petId={viewingReportCard.pet_id}
            clientId={viewingReportCard.client_id}
            petName={pet && pet.name}
            petBreed={pet && pet.breed}
            appointmentId={viewingReportCard.appointment_id}
            boardingReservationId={viewingReportCard.boarding_reservation_id}
            reportCard={viewingReportCard}
            onClose={function () { setViewingReportCard(null) }}
            onSaved={function () { fetchReportCards() }}
          />
        )}

        {/* ===== INCIDENTS TAB ===== */}
        {activeTab === 'incidents' && (
          <div>
            <div style={{ padding: '16px 18px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '15px' }}>🚨 Incident History</div>
                <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>
                  {incidents.length === 0
                    ? 'No incidents recorded for ' + (pet && pet.name ? pet.name : 'this pet') + '.'
                    : incidents.length + ' incident' + (incidents.length === 1 ? '' : 's') + ' on record.'}
                </div>
              </div>
              <button
                onClick={function () { setIncidentModal({ mode: 'new' }) }}
                style={{ padding: '10px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
              >
                🚨 Log Incident
              </button>
            </div>

            {loadingTab ? (
              <div className="pd-tab-loading">Loading incidents...</div>
            ) : incidents.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: '12px' }}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: '600' }}>No incidents recorded.</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Log any bites, injuries, medical events, or behavior concerns here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {incidents.map(function (inc) {
                  var sev = SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE.minor
                  var staffName = inc.staff_members ? (inc.staff_members.first_name + ' ' + (inc.staff_members.last_name || '')).trim() : null
                  return (
                    <div
                      key={inc.id}
                      style={{
                        background: '#fff', borderRadius: '12px',
                        borderLeft: '4px solid ' + sev.color,
                        border: '1px solid #e5e7eb', borderLeftWidth: '4px',
                        padding: '14px 16px',
                        cursor: 'pointer',
                      }}
                      onClick={function () { setIncidentModal({ mode: 'view', incident: inc }) }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px' }}>{INCIDENT_TYPE_LABELS[inc.incident_type] || inc.incident_type}</span>
                            <span style={{
                              padding: '2px 10px', fontSize: '11px', fontWeight: '700',
                              background: sev.bg, color: sev.color, border: '1px solid ' + sev.border,
                              borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.03em',
                            }}>{inc.severity}</span>
                            {inc.follow_up_needed && (
                              <span style={{
                                padding: '2px 10px', fontSize: '11px', fontWeight: '700',
                                background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
                                borderRadius: '999px',
                              }}>⚠️ FOLLOW-UP</span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px', lineHeight: '1.5' }}>
                            {inc.description && inc.description.length > 200 ? inc.description.slice(0, 200) + '…' : inc.description}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            📅 {new Date(inc.incident_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {inc.incident_time && ' · ' + inc.incident_time}
                            {staffName && ' · handled by ' + staffName}
                            {inc.client_notified && ' · ✅ client notified'}
                          </div>
                        </div>
                        {inc.photo_urls && inc.photo_urls.length > 0 && (
                          <img src={inc.photo_urls[0]} alt="incident" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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

      {/* ─── Danger Zone — Memorial + Remove ─────────────────────────────
          Two emotionally-distinct ways to take a pet off active lists:
          memorial preserves history, remove is permanent. */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        border: '1px solid #fecaca',
        background: '#fef2f2',
        borderRadius: '10px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Danger Zone
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
          Use these only if {pet.name} is no longer in {client ? client.first_name + '\'s' : 'the owner\'s'} care.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* Mark as Passed Away — toggle: same button restores if already memorial */}
          <button
            type="button"
            onClick={handleMarkMemorial}
            style={{
              padding: '10px 14px',
              background: pet.is_memorial ? '#10b981' : '#fff',
              color: pet.is_memorial ? '#fff' : '#7c3aed',
              border: '1px solid ' + (pet.is_memorial ? '#10b981' : '#7c3aed'),
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {pet.is_memorial ? '↩️ Restore as Active' : '🌈 Mark as Passed Away'}
          </button>

          {/* Hard delete — true removal. Hidden when pet is already memorial
              so groomers don't accidentally delete a memorial record. */}
          {!pet.is_memorial && (
            <button
              type="button"
              onClick={handleHardDeletePet}
              style={{
                padding: '10px 14px',
                background: '#fff',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🗑️ Remove Pet
            </button>
          )}
        </div>
        {pet.is_memorial && pet.memorial_date && (
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px', fontStyle: 'italic' }}>
            🌈 Marked as passed away on {new Date(pet.memorial_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                  <label className="sl-label">Weight (lbs) *</label>
                  <input type="number" className="sl-input" value={editForm.weight || ''} required min="0" step="0.1" placeholder="e.g. 45"
                    onChange={function(e) { setEditForm(Object.assign({}, editForm, { weight: e.target.value })) }}
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Age *</label>
                  <input type="text" className="sl-input" value={editForm.age || ''} required placeholder="e.g. 3 years"
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

              {/* Behavior tags — quick-pick warning pills shown on calendar/popup/kennel card */}
              <div className="sl-form-group">
                <label className="sl-label">Behavior Tags</label>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }}>
                  Click to toggle. Red/orange tags show as warnings on the calendar so staff sees them before handling.
                </p>
                <BehaviorTagsEditor
                  value={editForm.behavior_tags}
                  onChange={function (newTags) { setEditForm(Object.assign({}, editForm, { behavior_tags: newTags })) }}
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

      {/* Add / Edit Vaccination Modal */}
      {showVaxModal && (
        <div className="sl-modal-overlay" onClick={function(e) { if (e.target.className === 'sl-modal-overlay') setShowVaxModal(false) }}>
          <div className="sl-modal" style={{ maxWidth: '560px' }}>
            <div className="sl-modal-header">
              <h2>{editingVaxId ? '✏️ Edit Vaccination' : '💉 Add Vaccination'}</h2>
              <button className="sl-modal-close" onClick={function() { setShowVaxModal(false) }}>✕</button>
            </div>

            {/* 📸 TOP AUTO-READ BUTTON — big, prominent */}
            {!editingVaxId && (
              <div style={{ padding: '16px 20px 0', }}>
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  color: 'white',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                    🤖 Skip the typing — let Claude read it
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.95, marginBottom: '10px' }}>
                    Snap a photo of the vax cert and Claude will fill in the fields for you.
                  </div>
                  <input
                    ref={autoReadTopInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    onChange={function(e) {
                      var f = e.target.files && e.target.files[0]
                      if (f) handleAutoReadVaxCert(f)
                      e.target.value = ''   // allow re-selecting the same file
                    }}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    disabled={autoReadingVax}
                    onClick={function() { autoReadTopInputRef.current && autoReadTopInputRef.current.click() }}
                    style={{
                      background: 'white',
                      color: '#667eea',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: autoReadingVax ? 'wait' : 'pointer',
                      width: '100%',
                    }}
                  >
                    {autoReadingVax ? '🤖 Reading photo...' : '📸 Read Vax Cert Photo'}
                  </button>
                </div>

                {autoReadError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginTop: '10px' }}>
                    {autoReadError}
                  </div>
                )}
                {autoReadWarning && !autoReadError && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginTop: '10px' }}>
                    {autoReadWarning}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSaveVaccination} className="sl-form">
              <div className="sl-form-group">
                <label className="sl-label">Vaccine Type *</label>
                <select
                  className="sl-input"
                  value={vaxForm.vaccine_type}
                  onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { vaccine_type: e.target.value })) }}
                  required
                >
                  {VACCINE_TYPES.map(function(vt) {
                    var tag = vt.species === 'dog' ? ' (dog)' : vt.species === 'cat' ? ' (cat)' : ''
                    return (
                      <option key={vt.value} value={vt.value}>
                        {vt.emoji} {vt.label}{tag}
                      </option>
                    )
                  })}
                </select>
              </div>

              {vaxForm.vaccine_type === 'other' && (
                <div className="sl-form-group">
                  <label className="sl-label">Vaccine Name *</label>
                  <input
                    type="text"
                    className="sl-input"
                    value={vaxForm.vaccine_label}
                    onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { vaccine_label: e.target.value })) }}
                    placeholder="e.g. Giardia, Rattlesnake"
                    required
                  />
                </div>
              )}

              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Expiry Date *</label>
                  <input
                    type="date"
                    className="sl-input"
                    value={vaxForm.expiry_date}
                    onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { expiry_date: e.target.value })) }}
                    required
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">
                    Date Administered
                    {vaxForm.vaccine_type === 'bordetella' && <span style={{ color: '#dc2626' }}> *</span>}
                  </label>
                  <input
                    type="date"
                    className="sl-input"
                    value={vaxForm.date_administered}
                    onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { date_administered: e.target.value })) }}
                    required={vaxForm.vaccine_type === 'bordetella'}
                  />
                </div>
              </div>

              {vaxForm.vaccine_type === 'bordetella' && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: '#92400e', marginBottom: '12px' }}>
                  ⚠️ <strong>Bordetella is a live vaccine.</strong> Most boarding shops require it was given at least 7 days before boarding. Date administered is required so we can enforce the wait window.
                </div>
              )}

              <div className="sl-form-group">
                <label className="sl-label">Vet Clinic</label>
                <input
                  type="text"
                  className="sl-input"
                  value={vaxForm.vet_clinic}
                  onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { vet_clinic: e.target.value })) }}
                  placeholder="e.g. Banfield, All Pets Vet"
                />
              </div>

              <div className="sl-form-group">
                <label className="sl-label">Notes</label>
                <textarea
                  className="sl-input"
                  rows="2"
                  value={vaxForm.notes}
                  onChange={function(e) { setVaxForm(Object.assign({}, vaxForm, { notes: e.target.value })) }}
                  placeholder='e.g. "1-year rabies" vs "3-year rabies"'
                />
              </div>

              <div className="sl-form-group">
                <label className="sl-label">📎 Certificate Photo (optional)</label>
                {pendingCertFile ? (
                  <div style={{ fontSize: '13px', padding: '10px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#065f46', wordBreak: 'break-all' }}>📷 {pendingCertFile.name}</span>
                    <button
                      type="button"
                      onClick={function() { setPendingCertFile(null) }}
                      style={{ background: 'transparent', border: 'none', color: '#065f46', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', flexShrink: 0 }}
                    >
                      Remove
                    </button>
                  </div>
                ) : existingCertUrl ? (
                  <div style={{ fontSize: '13px', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#1e40af' }}>📄 Certificate on file</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={function() { viewCertificate(existingCertUrl) }}
                        style={{ background: 'transparent', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={function() {
                          if (confirm('Remove the current certificate photo? It will be deleted when you save.')) {
                            setExistingCertUrl(null)
                          }
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                      onChange={function(e) {
                        var f = e.target.files && e.target.files[0]
                        if (f) setPendingCertFile(f)
                      }}
                      style={{ fontSize: '13px' }}
                    />
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      JPG, PNG, WebP, HEIC, or PDF. 10 MB max.
                    </div>

                    {/* 📸 INLINE AUTO-READ BUTTON — smaller, next to upload field */}
                    <input
                      ref={autoReadInlineInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={function(e) {
                        var f = e.target.files && e.target.files[0]
                        if (f) handleAutoReadVaxCert(f)
                        e.target.value = ''
                      }}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={autoReadingVax}
                      onClick={function() { autoReadInlineInputRef.current && autoReadInlineInputRef.current.click() }}
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: autoReadingVax ? 'wait' : 'pointer',
                        marginTop: '8px',
                      }}
                    >
                      {autoReadingVax ? '🤖 Reading...' : '📸 Auto-read from photo with Claude'}
                    </button>
                  </div>
                )}
              </div>

              <div className="sl-form-actions">
                <button type="button" className="sl-btn-cancel" onClick={function() { setShowVaxModal(false) }}>Cancel</button>
                <button type="submit" className="sl-btn-save" disabled={savingVax || uploadingCert}>
                  {uploadingCert ? 'Uploading photo...' : savingVax ? 'Saving...' : (editingVaxId ? '💾 Save Changes' : '💉 Add Vaccination')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Incident Modal (log / view / edit) */}
      {incidentModal && pet && (
        <IncidentModal
          mode={incidentModal.mode}
          incident={incidentModal.incident}
          petId={id}
          clientId={pet.client_id}
          staffOptions={staffOptions}
          onClose={function () { setIncidentModal(null) }}
          onSaved={handleIncidentSaved}
        />
      )}
    </div>
  )
}
