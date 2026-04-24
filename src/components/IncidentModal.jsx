// =======================================================
// PetPro — Incident Log / Edit / View Modal
// =======================================================
// Reusable modal for logging a new incident, editing an existing one,
// or viewing with a Print option.
//
// Props:
//   mode           'new' | 'edit' | 'view'
//   petId          (required) pet this incident is about
//   clientId       (required) client who owns the pet
//   appointmentId  (optional) — ties the incident to an appointment
//   staffOptions   array of { id, first_name, last_name }
//   incident       (for edit/view) the existing incident row
//   onClose        () => void
//   onSaved        (savedIncident) => void
// =======================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

var INCIDENT_TYPES = [
  { value: 'bite',            label: '🦷 Bite' },
  { value: 'injury',          label: '🩹 Injury (nick, cut, burn)' },
  { value: 'medical',         label: '🏥 Medical (seizure, collapse, allergy)' },
  { value: 'behavior',        label: '⚠️ Aggressive Behavior' },
  { value: 'escape',          label: '🏃 Escape / Got Loose' },
  { value: 'property_damage', label: '💥 Property Damage' },
  { value: 'other',           label: '📋 Other' },
]

var SEVERITY_OPTIONS = [
  { value: 'minor',    label: 'Minor',    color: '#f59e0b' },
  { value: 'moderate', label: 'Moderate', color: '#ea580c' },
  { value: 'serious',  label: 'Serious',  color: '#dc2626' },
]

export default function IncidentModal({ mode, petId, clientId, appointmentId, staffOptions, incident, onClose, onSaved }) {
  var initialMode = mode || 'new'
  var [currentMode, setCurrentMode] = useState(initialMode)
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')

  // Form state
  var [form, setForm] = useState({
    incident_type: 'injury',
    severity: 'minor',
    incident_date: new Date().toISOString().slice(0, 10),
    incident_time: new Date().toTimeString().slice(0, 5),
    staff_id: '',
    description: '',
    action_taken: '',
    client_notified: false,
    client_notified_by: '',
    follow_up_needed: false,
    follow_up_notes: '',
    photo_urls: [],
  })

  // Pet + client info for the header (loaded fresh)
  var [petInfo, setPetInfo] = useState(null)
  var [clientInfo, setClientInfo] = useState(null)
  var [shopInfo, setShopInfo] = useState(null)

  useEffect(function () {
    // Load pet + client + shop info for the header/print view
    loadContext()
    // If editing or viewing an existing incident, populate form
    if (incident) {
      setForm({
        incident_type: incident.incident_type || 'injury',
        severity: incident.severity || 'minor',
        incident_date: incident.incident_date || new Date().toISOString().slice(0, 10),
        incident_time: incident.incident_time || '',
        staff_id: incident.staff_id || '',
        description: incident.description || '',
        action_taken: incident.action_taken || '',
        client_notified: !!incident.client_notified,
        client_notified_by: incident.client_notified_by || '',
        follow_up_needed: !!incident.follow_up_needed,
        follow_up_notes: incident.follow_up_notes || '',
        photo_urls: incident.photo_urls || [],
      })
    }
  }, [])

  async function loadContext() {
    var results = await Promise.all([
      supabase.from('pets').select('id, name, breed, weight, age, color').eq('id', petId).maybeSingle(),
      supabase.from('clients').select('id, first_name, last_name, phone, email').eq('id', clientId).maybeSingle(),
      supabase.auth.getUser().then(function (res) {
        var uid = res && res.data && res.data.user && res.data.user.id
        if (!uid) return { data: null }
        return supabase.from('shop_settings').select('shop_name, address, phone').eq('groomer_id', uid).maybeSingle()
      }),
    ])
    setPetInfo(results[0].data)
    setClientInfo(results[1].data)
    setShopInfo(results[2].data)
  }

  async function handlePhotoUpload(e) {
    var files = e.target.files
    if (!files || files.length === 0) return
    setSaving(true)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      var uploaded = []
      for (var i = 0; i < files.length; i++) {
        var f = files[i]
        var path = user.id + '/incidents/' + Date.now() + '-' + f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        var { data, error: upErr } = await supabase.storage.from('incident-photos').upload(path, f, { upsert: false })
        if (upErr) {
          // Fallback: try a public bucket if incident-photos doesn't exist yet
          var fb = await supabase.storage.from('vax-certs').upload('incidents/' + path, f, { upsert: false })
          if (fb.error) { console.error(fb.error); continue }
          var { data: pub } = supabase.storage.from('vax-certs').getPublicUrl('incidents/' + path)
          uploaded.push(pub.publicUrl)
        } else {
          var { data: pub2 } = supabase.storage.from('incident-photos').getPublicUrl(data.path)
          uploaded.push(pub2.publicUrl)
        }
      }
      setForm(function (f) { return Object.assign({}, f, { photo_urls: (f.photo_urls || []).concat(uploaded) }) })
    } catch (err) {
      setError('Photo upload failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function removePhoto(url) {
    setForm(function (f) { return Object.assign({}, f, { photo_urls: f.photo_urls.filter(function (u) { return u !== url }) }) })
  }

  async function handleSave() {
    setError('')
    if (!form.description.trim()) { setError('Description is required.'); return }

    setSaving(true)
    var { data: { user } } = await supabase.auth.getUser()
    var reporterName = 'Owner'
    // Try to get the reporter's staff name
    var { data: reporterStaff } = await supabase
      .from('staff_members')
      .select('first_name, last_name')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (reporterStaff) reporterName = (reporterStaff.first_name + ' ' + (reporterStaff.last_name || '')).trim()

    var payload = {
      groomer_id: user.id,
      pet_id: petId,
      client_id: clientId,
      appointment_id: appointmentId || null,
      staff_id: form.staff_id || null,
      incident_type: form.incident_type,
      severity: form.severity,
      incident_date: form.incident_date,
      incident_time: form.incident_time || null,
      description: form.description.trim(),
      action_taken: form.action_taken.trim() || null,
      client_notified: form.client_notified,
      client_notified_at: form.client_notified ? new Date().toISOString() : null,
      client_notified_by: form.client_notified ? (form.client_notified_by.trim() || reporterName) : null,
      follow_up_needed: form.follow_up_needed,
      follow_up_notes: form.follow_up_notes.trim() || null,
      photo_urls: form.photo_urls,
      reported_by_auth_id: user.id,
      reported_by_name: reporterName,
    }

    var result
    if (incident && incident.id) {
      result = await supabase.from('incidents').update(payload).eq('id', incident.id).select().single()
    } else {
      result = await supabase.from('incidents').insert(payload).select().single()
    }

    if (result.error) {
      setError('Save failed: ' + result.error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    if (onSaved) onSaved(result.data)
    onClose()
  }

  function handlePrint() {
    window.print()
  }

  var selectedType = INCIDENT_TYPES.find(function (t) { return t.value === form.incident_type })
  var selectedSev = SEVERITY_OPTIONS.find(function (s) { return s.value === form.severity })
  var selectedStaff = (staffOptions || []).find(function (s) { return s.id === form.staff_id })
  var isView = currentMode === 'view'
  var isEdit = currentMode === 'edit'
  var isNew = currentMode === 'new'

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .incident-print-area, .incident-print-area * { visibility: visible !important; }
          .incident-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto',
        }}
        className="no-print"
      >
        <div
          onClick={function (e) { e.stopPropagation() }}
          className="incident-print-area"
          style={{
            background: '#fff', color: '#111827', borderRadius: '16px',
            maxWidth: '680px', width: '100%', padding: '28px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '800' }}>
                🚨 {isNew ? 'Log New Incident' : isEdit ? 'Edit Incident' : 'Incident Report'}
              </h2>
              {shopInfo && shopInfo.shop_name && (
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {shopInfo.shop_name}{shopInfo.address ? ' · ' + shopInfo.address : ''}
                </div>
              )}
            </div>
            <div className="no-print" style={{ display: 'flex', gap: '6px' }}>
              {isView && (
                <>
                  <button
                    onClick={handlePrint}
                    style={{ padding: '8px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
                  >
                    🖨️ Print
                  </button>
                  <button
                    onClick={function () { setCurrentMode('edit') }}
                    style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
                  >
                    ✏️ Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Pet + Client header (always visible, great for print) */}
          {petInfo && clientInfo && (
            <div style={{ padding: '14px 16px', background: '#f9fafb', borderRadius: '10px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', fontSize: '13px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Pet</div>
                  <div style={{ fontWeight: '700' }}>{petInfo.name}</div>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>
                    {[petInfo.breed, petInfo.weight ? petInfo.weight + ' lbs' : null, petInfo.age ? petInfo.age + ' yrs' : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Owner</div>
                  <div style={{ fontWeight: '700' }}>{clientInfo.first_name} {clientInfo.last_name}</div>
                  <div style={{ color: '#6b7280', fontSize: '12px' }}>{clientInfo.phone || clientInfo.email || ''}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Date & Time</div>
                  <div style={{ fontWeight: '700' }}>
                    {new Date(form.incident_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {form.incident_time && ' · ' + form.incident_time}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', color: '#991b1b', marginBottom: '14px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* Form body */}
          <div style={{ display: 'grid', gap: '14px' }}>
            {/* Type + Severity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Incident Type *</label>
                {isView ? (
                  <div style={readStyle}>{selectedType && selectedType.label}</div>
                ) : (
                  <select
                    value={form.incident_type}
                    onChange={function (e) { setForm(Object.assign({}, form, { incident_type: e.target.value })) }}
                    style={inputStyle}
                  >
                    {INCIDENT_TYPES.map(function (t) { return <option key={t.value} value={t.value}>{t.label}</option> })}
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Severity *</label>
                {isView ? (
                  <div style={Object.assign({}, readStyle, { color: selectedSev && selectedSev.color, fontWeight: '700' })}>
                    {selectedSev && selectedSev.label}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {SEVERITY_OPTIONS.map(function (s) {
                      var selected = form.severity === s.value
                      return (
                        <button
                          key={s.value} type="button"
                          onClick={function () { setForm(Object.assign({}, form, { severity: s.value })) }}
                          style={{
                            flex: 1, padding: '10px 6px', fontSize: '13px', fontWeight: '700',
                            background: selected ? s.color : '#fff',
                            color: selected ? '#fff' : s.color,
                            border: '1px solid ' + s.color,
                            borderRadius: '8px', cursor: 'pointer',
                          }}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Date + Time + Staff */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Date</label>
                {isView ? (
                  <div style={readStyle}>{new Date(form.incident_date + 'T00:00:00').toLocaleDateString()}</div>
                ) : (
                  <input type="date" value={form.incident_date}
                    onChange={function (e) { setForm(Object.assign({}, form, { incident_date: e.target.value })) }}
                    style={inputStyle}
                  />
                )}
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                {isView ? (
                  <div style={readStyle}>{form.incident_time || '—'}</div>
                ) : (
                  <input type="time" value={form.incident_time}
                    onChange={function (e) { setForm(Object.assign({}, form, { incident_time: e.target.value })) }}
                    style={inputStyle}
                  />
                )}
              </div>
              <div>
                <label style={labelStyle}>Staff Involved</label>
                {isView ? (
                  <div style={readStyle}>{selectedStaff ? (selectedStaff.first_name + ' ' + (selectedStaff.last_name || '')) : '—'}</div>
                ) : (
                  <select value={form.staff_id}
                    onChange={function (e) { setForm(Object.assign({}, form, { staff_id: e.target.value })) }}
                    style={inputStyle}
                  >
                    <option value="">— select —</option>
                    {(staffOptions || []).map(function (s) {
                      return <option key={s.id} value={s.id}>{s.first_name} {s.last_name || ''}</option>
                    })}
                  </select>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>What Happened? *</label>
              {isView ? (
                <div style={Object.assign({}, readStyle, { whiteSpace: 'pre-wrap', minHeight: '60px' })}>{form.description || '—'}</div>
              ) : (
                <textarea
                  value={form.description}
                  onChange={function (e) { setForm(Object.assign({}, form, { description: e.target.value })) }}
                  rows={4}
                  placeholder="Describe the incident in detail..."
                  style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'inherit' })}
                />
              )}
            </div>

            {/* Action taken */}
            <div>
              <label style={labelStyle}>Action Taken</label>
              {isView ? (
                <div style={Object.assign({}, readStyle, { whiteSpace: 'pre-wrap', minHeight: '40px' })}>{form.action_taken || '—'}</div>
              ) : (
                <textarea
                  value={form.action_taken}
                  onChange={function (e) { setForm(Object.assign({}, form, { action_taken: e.target.value })) }}
                  rows={2}
                  placeholder="First aid given, vet called, client picked up early, etc."
                  style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'inherit' })}
                />
              )}
            </div>

            {/* Client notified */}
            <div style={{ padding: '12px', background: '#faf5ff', borderRadius: '10px', border: '1px solid #ddd6fe' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={form.client_notified}
                  disabled={isView}
                  onChange={function (e) { setForm(Object.assign({}, form, { client_notified: e.target.checked })) }}
                />
                Client was notified
              </label>
              {form.client_notified && (
                <div style={{ marginTop: '8px' }}>
                  <label style={Object.assign({}, labelStyle, { fontSize: '11px' })}>Notified by</label>
                  {isView ? (
                    <div style={readStyle}>{form.client_notified_by || '—'}</div>
                  ) : (
                    <input
                      type="text"
                      value={form.client_notified_by}
                      onChange={function (e) { setForm(Object.assign({}, form, { client_notified_by: e.target.value })) }}
                      placeholder="Who called/texted the client?"
                      style={inputStyle}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Follow-up */}
            <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={form.follow_up_needed}
                  disabled={isView}
                  onChange={function (e) { setForm(Object.assign({}, form, { follow_up_needed: e.target.checked })) }}
                />
                ⚠️ Follow-up needed
              </label>
              {form.follow_up_needed && (
                <div style={{ marginTop: '8px' }}>
                  <label style={Object.assign({}, labelStyle, { fontSize: '11px' })}>Follow-up details</label>
                  {isView ? (
                    <div style={Object.assign({}, readStyle, { whiteSpace: 'pre-wrap' })}>{form.follow_up_notes || '—'}</div>
                  ) : (
                    <textarea
                      value={form.follow_up_notes}
                      onChange={function (e) { setForm(Object.assign({}, form, { follow_up_notes: e.target.value })) }}
                      rows={2}
                      placeholder="Vet appt needed? Insurance claim? Requires muzzle next visit?"
                      style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'inherit' })}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Photos */}
            <div>
              <label style={labelStyle}>Photos ({form.photo_urls.length})</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {form.photo_urls.map(function (url) {
                  return (
                    <div key={url} style={{ position: 'relative' }}>
                      <img src={url} alt="incident" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      {!isView && (
                        <button
                          type="button"
                          onClick={function () { removePhoto(url) }}
                          style={{
                            position: 'absolute', top: '-6px', right: '-6px',
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: '#dc2626', color: '#fff', border: 'none',
                            fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}
                        >×</button>
                      )}
                    </div>
                  )
                })}
              </div>
              {!isView && (
                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ fontSize: '12px' }} />
              )}
            </div>
          </div>

          {/* Footer — reported by signature line */}
          {(incident && (incident.reported_by_name || incident.created_at)) && (
            <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280' }}>
              Reported by <strong>{incident.reported_by_name || '—'}</strong>
              {incident.created_at && ' on ' + new Date(incident.created_at).toLocaleString()}
            </div>
          )}

          {/* Actions */}
          <div className="no-print" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
            >
              {isView ? 'Close' : 'Cancel'}
            </button>
            {!isView && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : (isEdit ? 'Save Changes' : '🚨 Log Incident')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

var labelStyle = {
  display: 'block', fontSize: '12px', fontWeight: '600',
  color: '#6b7280', marginBottom: '4px',
  textTransform: 'uppercase', letterSpacing: '0.03em',
}
var inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', fontSize: '14px',
  border: '1px solid #d1d5db', borderRadius: '8px',
  background: '#fff',
}
var readStyle = {
  padding: '10px 12px', fontSize: '14px',
  background: '#f9fafb', borderRadius: '8px',
  border: '1px solid #e5e7eb', color: '#111827',
}
