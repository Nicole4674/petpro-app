// =============================================================================
// SmartBookModal.jsx — PetPro AI Smart Booking
// =============================================================================
// Modal that lets a groomer pick client → pet → service, then asks PetPro AI
// for the top 3 best appointment slots in the next N days. AI factors in:
//   • Pet's grooming history (last 5 visits — pattern matching)
//   • Pet's grooming notes, breed, behavior, allergies
//   • Open slots in the date range (no conflicts)
//   • Standard cadence (4-6 weeks for most coated breeds)
//   • Brain knowledge (anxious dogs, seniors, matted likely, etc.)
//
// When user clicks a suggested slot, this modal closes and the existing
// AddAppointmentModal opens pre-filled with all the picked values + the
// chosen date/time. That preserves the existing safety checks + multi-pet
// support without duplicating booking logic.
//
// Props:
//   - clients: full list of shop's clients (passed from Calendar)
//   - pets: full list of shop's pets (passed from Calendar)
//   - services: shop's services (passed from Calendar)
//   - staffMembers: shop's staff (passed from Calendar)
//   - onClose(): close without booking
//   - onSlotPicked({ client_id, pet_id, service_id, date, start_time, staff_id }):
//       called when user picks a suggested slot — Calendar opens
//       AddAppointmentModal pre-filled with these values
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function SmartBookModal({ clients, pets, services, staffMembers, onClose, onSlotPicked }) {
  // ─── Picker state ─────────────────────────────────────────────────────
  const [clientId, setClientId] = useState('')
  const [petId, setPetId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [staffId, setStaffId] = useState('')
  // Auto-pick the only active staff member if there's just one (1-groomer shop)
  useEffect(() => {
    const activeStaff = (staffMembers || []).filter((s) => s.status !== 'inactive' && s.status !== 'archived')
    if (activeStaff.length === 1 && !staffId) {
      setStaffId(activeStaff[0].id)
    }
  }, [staffMembers])
  const [daysAhead, setDaysAhead] = useState(14)
  const [timePreference, setTimePreference] = useState('any')
  const [clientSearch, setClientSearch] = useState('')

  // ─── Result state ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState(null) // null = haven't asked yet, [] = no slots, [...] = got results
  const [totalOpenSlots, setTotalOpenSlots] = useState(0)

  // ─── Filter pets by selected client ────────────────────────────────────
  const filteredPets = useMemo(() => {
    if (!clientId) return []
    return (pets || []).filter(
      (p) => p.client_id === clientId && !p.is_memorial && !p.is_archived
    )
  }, [clientId, pets])

  // Auto-clear pet when client changes
  useEffect(() => { setPetId('') }, [clientId])

  // ─── Filter clients by search query ────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return (clients || []).slice(0, 20) // show first 20 by default
    return (clients || []).filter((c) => {
      const name = (c.first_name + ' ' + c.last_name).toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    }).slice(0, 30)
  }, [clientSearch, clients])

  const selectedClient = useMemo(
    () => (clients || []).find((c) => c.id === clientId),
    [clientId, clients]
  )

  // ─── Find best slots — calls the edge function ─────────────────────────
  async function handleFindSlots() {
    if (!clientId || !petId || !serviceId) {
      setError('Please pick a client, pet, and service first.')
      return
    }
    if (!staffId) {
      setError("Please pick a specific groomer — that way PetPro AI checks their actual schedule and you don't risk a double-book.")
      return
    }
    setLoading(true)
    setError('')
    setSuggestions(null)

    try {
      const body = {
        client_id: clientId,
        pet_id: petId,
        service_id: serviceId,
        days_ahead: daysAhead,
        time_of_day_preference: timePreference,
      }
      if (staffId) body.preferred_staff_id = staffId

      const { data, error: fnError } = await supabase.functions.invoke('petpro-smart-book', { body })

      if (fnError) throw new Error(fnError.message || 'Edge function error')
      if (data?.error) throw new Error(data.error)

      setSuggestions(data.suggestions || [])
      setTotalOpenSlots(data.total_open_slots || 0)
      if ((data.suggestions || []).length === 0 && data.reason) {
        setError(data.reason)
      }
    } catch (err) {
      console.error('[SmartBookModal] error:', err)
      setError('Could not find slots: ' + (err.message || 'unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // ─── User picked a suggested slot — pass back to Calendar ─────────────
  function pickSlot(slot) {
    onSlotPicked({
      client_id: clientId,
      pet_id: petId,
      service_id: serviceId,
      staff_id: staffId || null,
      date: slot.appointment_date,
      start_time: slot.start_time,
    })
  }

  // ─── Format helpers ────────────────────────────────────────────────────
  function formatTime12(hhmm) {
    if (!hhmm) return ''
    const [hStr, m] = hhmm.split(':')
    const h = parseInt(hStr, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${m} ${ampm}`
  }

  function formatDateLong(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '24px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🪄 Smart Book
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', fontSize: '24px',
              cursor: 'pointer', color: '#6b7280', padding: '4px 10px',
            }}
          >×</button>
        </div>
        <p style={{ margin: '0 0 18px', color: '#6b7280', fontSize: '13px', lineHeight: 1.5 }}>
          Pick the client, pet, and service. PetPro AI will find the best 3 slots based on their history, breed, and your schedule.
        </p>

        {/* ─── PICKERS ─────────────────────────────────────────── */}

        {/* Client search + picker */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
            Client *
          </label>
          {!clientId ? (
            <>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search by name or phone..."
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '6px',
                }}
              />
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                {filteredClients.length === 0 ? (
                  <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px' }}>No clients found.</div>
                ) : filteredClients.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setClientId(c.id)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer', fontSize: '13px',
                      borderBottom: '1px solid #f3f4f6', color: '#1f2937',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3e8ff' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                  >
                    <strong>{c.first_name} {c.last_name}</strong>
                    {c.phone && <span style={{ marginLeft: '8px', color: '#6b7280' }}>· {c.phone}</span>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: '#f3e8ff', border: '1px solid #c4b5fd',
              borderRadius: '8px', fontSize: '14px',
            }}>
              <div>
                <strong>{selectedClient?.first_name} {selectedClient?.last_name}</strong>
                {selectedClient?.phone && <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '13px' }}>· {selectedClient.phone}</span>}
              </div>
              <button
                onClick={() => { setClientId(''); setPetId(''); setSuggestions(null); setError('') }}
                style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
              >Change</button>
            </div>
          )}
        </div>

        {/* Pet picker — only shows when client picked */}
        {clientId && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
              Pet *
            </label>
            <select
              value={petId}
              onChange={(e) => setPetId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: '8px', fontSize: '14px', background: '#fff',
              }}
            >
              <option value="">— Pick a pet —</option>
              {filteredPets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.breed ? ` (${p.breed})` : ''}
                </option>
              ))}
            </select>
            {filteredPets.length === 0 && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#b45309' }}>
                This client has no active pets on file.
              </p>
            )}
          </div>
        )}

        {/* Service + Staff + Date Range row */}
        {petId && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                  Service *
                </label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', background: '#fff',
                  }}
                >
                  <option value="">— Pick a service —</option>
                  {(services || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.service_name} ({s.time_block_minutes || 60}m · ${s.price})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                  Groomer *
                </label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: '1px solid ' + (!staffId ? '#fca5a5' : '#d1d5db'),
                    borderRadius: '8px', fontSize: '14px', background: '#fff',
                  }}
                >
                  <option value="">— Pick a groomer —</option>
                  {(staffMembers || []).filter((s) => s.status !== 'inactive' && s.status !== 'archived').map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name || ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', lineHeight: 1.3 }}>
                  Required — AI checks THIS groomer's actual schedule (no double-booking).
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                  Look ahead
                </label>
                <select
                  value={daysAhead}
                  onChange={(e) => setDaysAhead(parseInt(e.target.value))}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', background: '#fff',
                  }}
                >
                  <option value={7}>Next 7 days</option>
                  <option value={14}>Next 14 days</option>
                  <option value={30}>Next 30 days</option>
                  <option value={60}>Next 60 days</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>
                  Time of day
                </label>
                <select
                  value={timePreference}
                  onChange={(e) => setTimePreference(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', background: '#fff',
                  }}
                >
                  <option value="any">Anytime</option>
                  <option value="morning">Morning only</option>
                  <option value="afternoon">Afternoon only</option>
                  <option value="evening">Evening only</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleFindSlots}
              disabled={loading || !serviceId || !staffId}
              style={{
                width: '100%', padding: '12px',
                background: (loading || !serviceId || !staffId) ? '#a78bfa' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px',
                cursor: (loading || !serviceId || !staffId) ? 'not-allowed' : 'pointer', marginBottom: '14px',
              }}
            >
              {loading ? '🤖 PetPro AI is thinking…' : '🪄 Find Best Slots'}
            </button>
          </>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', color: '#b91c1c', fontSize: '13px', marginBottom: '14px',
          }}>
            {error}
          </div>
        )}

        {/* ─── RESULTS ─────────────────────────────────────────── */}
        {suggestions && suggestions.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 600 }}>
              ✨ TOP {suggestions.length} BEST SLOTS · Tap to book
            </div>
            {suggestions.map((slot, idx) => (
              <div
                key={idx}
                onClick={() => pickSlot(slot)}
                style={{
                  padding: '14px',
                  marginBottom: '10px',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#7c3aed'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
                    #{idx + 1} · {formatDateLong(slot.appointment_date)}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aed' }}>
                    {formatTime12(slot.start_time)} – {formatTime12(slot.end_time)}
                  </div>
                </div>
                {slot.reasoning && (
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5, marginBottom: slot.warnings?.length ? '6px' : 0 }}>
                    💡 {slot.reasoning}
                  </div>
                )}
                {slot.warnings && slot.warnings.length > 0 && (
                  <div style={{ fontSize: '12px', color: '#b45309', lineHeight: 1.4 }}>
                    {slot.warnings.map((w, i) => (
                      <div key={i}>⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
              {totalOpenSlots} total open slots in this range. PetPro AI picked the best 3 based on this pet's history + Brain knowledge.
            </p>
          </div>
        )}

        {suggestions && suggestions.length === 0 && !error && (
          <div style={{
            padding: '14px', background: '#fef9c3', border: '1px solid #fde047',
            borderRadius: '8px', color: '#854d0e', fontSize: '13px', lineHeight: 1.5,
          }}>
            PetPro AI couldn't find good slots in that range. Try expanding the date range or removing the time-of-day filter.
          </div>
        )}
      </div>
    </div>
  )
}
