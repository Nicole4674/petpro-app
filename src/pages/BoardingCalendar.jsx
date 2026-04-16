import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
  const [kennelCardLoading, setKennelCardLoading] = useState(false)

  // New reservation form
  const [newRes, setNewRes] = useState({
    client_id: '',
    pet_ids: [],
    start_date: '',
    end_date: '',
    start_time: '08:00',
    end_time: '12:00',
    notes: '',
    status: 'confirmed'
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
    return d.toISOString().split('T')[0]
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

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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
      case 'confirmed': return '#7c3aed'
      case 'checked_in': return '#16a34a'
      case 'pending': return '#f59e0b'
      case 'checked_out': return '#94a3b8'
      default: return '#7c3aed'
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'confirmed': return 'Confirmed'
      case 'checked_in': return 'Checked In'
      case 'pending': return 'Pending'
      case 'checked_out': return 'Checked Out'
      default: return status
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
    if (!clientSearch.trim()) return clients.slice(0, 10)
    const search = clientSearch.toLowerCase()
    return clients.filter(c =>
      (c.first_name + ' ' + c.last_name).toLowerCase().includes(search) ||
      (c.phone || '').includes(search)
    ).slice(0, 10)
  }

  function getPetsForClient(clientId) {
    return pets.filter(p => p.client_id === clientId)
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
            pets:pet_id ( id, name, breed, weight, age, sex, allergies, medications, vaccination_status, vaccination_expiry, is_spayed_neutered )
          ),
          clients:client_id ( id, first_name, last_name, phone, email, address, preferred_contact, notes ),
          kennels:kennel_id ( name ),
          boarding_addons ( id, addon_type, description, price, scheduled_for, completed )
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
    } catch (err) {
      console.error('Error loading kennel card:', err)
    } finally {
      setKennelCardLoading(false)
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

  function getDaysBetween(start, end) {
    const s = new Date(start)
    const e = new Date(end)
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24))
    return diff + 1
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
        return '<tr><td style="padding:4px;border:1px solid #d1d5db;">' + d.toISOString().split('T')[0] + '</td>' + '<td style="padding:4px;border:1px solid #d1d5db;"></td>'.repeat(7) + '<td style="padding:4px;border:1px solid #d1d5db;"></td></tr>'
      }).join('') +
      '</table></div>')
    : ''

    const blankWelfareTable =
      '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;">✍️ DAILY WELFARE CHECKS (Handwritten)</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:' + (isClipboard ? '12' : '11') + 'px;"><tr style="background:#f1f5f9;"><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Date</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Bkfst</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Lunch</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Dinner</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Water</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">BM</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Pee</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Vomit</th><th style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;">Behavior / Notes</th></tr>' +
      Array.from({ length: Math.max(getDaysBetween(res.start_date, res.end_date), 3) }, (_, i) => {
        const d = new Date(res.start_date); d.setDate(d.getDate() + i)
        return '<tr><td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;font-size:' + (isClipboard ? '11' : '10') + 'px;">' + d.toISOString().split('T')[0] + '</td>' + ('<td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;height:' + (isClipboard ? '28' : '20') + 'px;"></td>').repeat(7) + '<td style="padding:' + (isClipboard ? '6' : '4') + 'px;border:1px solid #d1d5db;min-width:80px;"></td></tr>'
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
    <div><div class="stay-label">🌙 Nights</div><div class="stay-value">${getDaysBetween(res.start_date, res.end_date)}</div></div>
  </div>
  ${petSections}
  <div style="margin-top:16px;">
    <div class="section-title">👤 Owner Contact</div>
    <div class="owner-box">
      <div class="owner-name">${client.first_name || ''} ${client.last_name || ''}</div>
      ${client.phone ? '<div class="owner-detail">📱 ' + client.phone + '</div>' : ''}
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
                        return (
                          <div
                            key={formatDate(day)}
                            className={'cal-cell cal-cell-occupied' + (isToday(day) ? ' cal-cell-today' : '')}
                            style={{ borderLeftColor: isStart ? getStatusColor(res.status) : 'transparent', cursor: 'pointer' }}
                            title={getPetNames(res) + ' — ' + getClientName(res) + ' (' + getStatusLabel(res.status) + ') · Click for details'}
                            onClick={() => openKennelCard(res)}
                          >
                            <div className="cal-cell-bar" style={{ background: getStatusColor(res.status) }}>
                              {isStart && (
                                <span className="cal-cell-pet">{getPetNames(res)}</span>
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
      {selectedReservation && (
        <div className="cal-modal-overlay" onClick={() => setSelectedReservation(null)}>
          <div className="kc-modal" onClick={e => e.stopPropagation()}>
            {/* Header with status badge */}
            <div className="kc-header">
              <div className="kc-header-left">
                <h2>🐾 Kennel Card</h2>
                <span className="kc-status-badge" style={{ background: getStatusColor(selectedReservation.status) }}>
                  {getStatusLabel(selectedReservation.status)}
                </span>
              </div>
              <button className="cal-modal-close" onClick={() => setSelectedReservation(null)}>✕</button>
            </div>

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
                  <span className="kc-stay-value">{getDaysBetween(selectedReservation.start_date, selectedReservation.end_date)}</span>
                </div>
              </div>

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
                      </div>
                    </div>

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
                        <div className="kc-owner-row">📱 {selectedReservation.clients.phone}</div>
                      )}
                      {selectedReservation.clients.email && (
                        <div className="kc-owner-row">📧 {selectedReservation.clients.email}</div>
                      )}
                      {selectedReservation.clients.address && (
                        <div className="kc-owner-row">📍 {selectedReservation.clients.address}</div>
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

              {/* Client Search */}
              <div className="boarding-field">
                <label className="boarding-label">Client *</label>
                <input
                  className="boarding-input"
                  placeholder="Search by name or phone..."
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
                    {getFilteredClients().map(client => (
                      <div
                        key={client.id}
                        className="cal-dropdown-item"
                        onClick={() => {
                          setNewRes(prev => ({ ...prev, client_id: client.id, pet_ids: [] }))
                          setClientSearch(client.first_name + ' ' + client.last_name)
                          setShowClientDropdown(false)
                        }}
                      >
                        <strong>{client.first_name} {client.last_name}</strong>
                        {client.phone && <span className="cal-dropdown-sub"> — {client.phone}</span>}
                      </div>
                    ))}
                    {getFilteredClients().length === 0 && (
                      <div className="cal-dropdown-empty">No clients found</div>
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

              {/* Dates */}
              <div className="boarding-field-row" style={{ marginTop: '12px' }}>
                <div className="boarding-field">
                  <label className="boarding-label">Check-In Date *</label>
                  <input type="date" className="boarding-input"
                    value={newRes.start_date}
                    onChange={e => setNewRes(prev => ({ ...prev, start_date: e.target.value }))} />
                </div>
                <div className="boarding-field">
                  <label className="boarding-label">Check-Out Date *</label>
                  <input type="date" className="boarding-input"
                    value={newRes.end_date}
                    onChange={e => setNewRes(prev => ({ ...prev, end_date: e.target.value }))} />
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
                  placeholder="Special instructions, dietary needs, etc." />
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
    </div>
  )
}
