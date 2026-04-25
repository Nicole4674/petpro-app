// ====================================================================
// PetPro — Report Card Modal
// ====================================================================
// Used after a grooming appt OR boarding stay is checked-out. Lets the
// groomer fill out a per-pet summary the owner gets at pickup.
//
// Props:
//   mode            — 'new' | 'edit' | 'view'
//   serviceType     — 'grooming' | 'boarding'
//   petId, clientId — required for new
//   petName, petBreed, petPhoto — display
//   appointmentId OR boardingReservationId — link
//   reportCard      — for edit/view mode (existing row)
//   onClose, onSaved
// ====================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BEHAVIOR_OPTIONS = [
  { key: 'great',     label: '🌟 Great',     desc: 'Perfect dog — a dream to work with',         color: '#16a34a', bg: '#dcfce7' },
  { key: 'good',      label: '👍 Good',      desc: 'Minor wiggles, easy overall',                color: '#65a30d', bg: '#ecfccb' },
  { key: 'okay',      label: '😐 Okay',      desc: 'Needed some patience, manageable',           color: '#ca8a04', bg: '#fef9c3' },
  { key: 'anxious',   label: '😰 Anxious',   desc: 'Scared / nervous, took extra time',          color: '#ea580c', bg: '#ffedd5' },
  { key: 'difficult', label: '⚠️ Difficult', desc: 'Bites / fights — special handling needed',  color: '#dc2626', bg: '#fee2e2' },
]

const NEXT_VISIT_OPTIONS = [
  { weeks: 2,  label: '2 weeks (very short coats)' },
  { weeks: 4,  label: '4 weeks (short)' },
  { weeks: 6,  label: '6 weeks (most common)' },
  { weeks: 8,  label: '8 weeks (medium)' },
  { weeks: 12, label: '12 weeks (long-stretch)' },
]

export default function ReportCardModal({
  mode, serviceType, petId, clientId, petName, petBreed, petPhoto,
  appointmentId, boardingReservationId, reportCard, onClose, onSaved,
  clientView, // when true: hide Edit button (clients can view + print only)
}) {
  const initial = reportCard || {}
  const [servicesPerformed, setServicesPerformed] = useState(initial.services_performed || '')
  const [behaviorRating, setBehaviorRating] = useState(initial.behavior_rating || '')
  const [behaviorNotes, setBehaviorNotes] = useState(initial.behavior_notes || '')
  const [recommendations, setRecommendations] = useState(initial.recommendations || '')
  const [nextVisitWeeks, setNextVisitWeeks] = useState(initial.next_visit_weeks || '')
  const [photoUrls, setPhotoUrls] = useState(initial.photo_urls || [])
  const [groomerName, setGroomerName] = useState(initial.groomer_name || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(mode === 'new' || mode === 'edit')

  // Auto-suggest groomer name from auth on new
  useEffect(() => {
    if (mode === 'new' && !groomerName) {
      ;(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        // Try staff_members first (if logged-in user is staff), then users.full_name
        const { data: staffRow } = await supabase
          .from('staff_members')
          .select('first_name, last_name')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        if (staffRow) {
          setGroomerName((staffRow.first_name + ' ' + (staffRow.last_name || '')).trim())
        }
      })()
    }
  }, [mode])

  async function handleUploadPhotos(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const newUrls = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const path = user.id + '/report-cards/' + Date.now() + '-' + i + '-' + f.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const { error: upErr } = await supabase.storage.from('vax-certs').upload(path, f, { upsert: false })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('vax-certs').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
      setPhotoUrls([...photoUrls, ...newUrls])
    } catch (err) {
      setError('Photo upload failed: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removePhoto(idx) {
    setPhotoUrls(photoUrls.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const row = {
        groomer_id: user.id,
        pet_id: petId,
        client_id: clientId,
        appointment_id: appointmentId || null,
        boarding_reservation_id: boardingReservationId || null,
        service_type: serviceType,
        services_performed: servicesPerformed.trim() || null,
        behavior_rating: behaviorRating || null,
        behavior_notes: behaviorNotes.trim() || null,
        recommendations: recommendations.trim() || null,
        next_visit_weeks: nextVisitWeeks ? parseInt(nextVisitWeeks) : null,
        photo_urls: photoUrls,
        groomer_name: groomerName.trim() || null,
      }

      if (mode === 'edit' && reportCard?.id) {
        const { error: upErr } = await supabase
          .from('report_cards')
          .update(row)
          .eq('id', reportCard.id)
        if (upErr) throw upErr
      } else {
        const { error: insErr } = await supabase
          .from('report_cards')
          .insert(row)
        if (insErr) throw insErr
      }

      if (onSaved) onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    const ratingMeta = BEHAVIOR_OPTIONS.find(o => o.key === behaviorRating)
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) { alert('Allow pop-ups to print.'); return }

    const next = nextVisitWeeks ? parseInt(nextVisitWeeks) : null
    const photosHtml = (photoUrls || []).map(u =>
      '<img src="' + u + '" style="max-width:48%;border-radius:8px;border:1px solid #e5e7eb;" />'
    ).join('')

    let html = '<!DOCTYPE html><html><head><title>Report Card — ' + (petName || 'Pet') + '</title>'
    html += '<style>'
    html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 30px auto; color: #111827; padding: 0 24px; }'
    html += '.hero { text-align: center; padding: 28px 20px; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; border-radius: 16px; margin-bottom: 24px; }'
    html += '.hero h1 { margin: 0 0 4px; font-size: 26px; }'
    html += '.hero .pet { font-size: 32px; font-weight: 800; margin: 8px 0 4px; }'
    html += '.hero .breed { opacity: 0.85; font-size: 14px; }'
    html += '.section { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; page-break-inside: avoid; }'
    html += '.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7c3aed; font-weight: 700; margin-bottom: 8px; }'
    html += '.behavior-pill { display: inline-block; padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 14px; }'
    html += '.field { font-size: 14px; line-height: 1.55; color: #374151; }'
    html += '.signature { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 13px; }'
    html += '.print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }'
    html += '@media print { .no-print { display: none; } body { margin: 0; padding: 14px; } }'
    html += '</style></head><body>'
    html += '<button class="print-btn no-print" onclick="window.print()">🖨️ Print</button>'
    html += '<div class="hero">'
    html += '<h1>📋 ' + (serviceType === 'grooming' ? 'Grooming' : 'Boarding') + ' Report Card</h1>'
    html += '<div class="pet">' + (petName || 'Pet') + '</div>'
    html += petBreed ? '<div class="breed">' + petBreed + '</div>' : ''
    html += '<div class="breed" style="margin-top:8px;">' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>'
    html += '</div>'

    if (servicesPerformed) {
      html += '<div class="section"><div class="section-title">✂️ Services Performed</div><div class="field">' + servicesPerformed.replace(/\n/g, '<br>') + '</div></div>'
    }

    if (ratingMeta) {
      html += '<div class="section"><div class="section-title">😊 How They Did</div>'
      html += '<span class="behavior-pill" style="background:' + ratingMeta.bg + ';color:' + ratingMeta.color + ';">'
      html += ratingMeta.label + '</span>'
      html += '<div class="field" style="font-style:italic;color:#6b7280;margin-top:6px;">' + ratingMeta.desc + '</div>'
      if (behaviorNotes) html += '<div class="field" style="margin-top:10px;">' + behaviorNotes.replace(/\n/g, '<br>') + '</div>'
      html += '</div>'
    } else if (behaviorNotes) {
      html += '<div class="section"><div class="section-title">😊 Behavior Notes</div><div class="field">' + behaviorNotes.replace(/\n/g, '<br>') + '</div></div>'
    }

    if (recommendations) {
      html += '<div class="section"><div class="section-title">💡 Recommendations</div><div class="field">' + recommendations.replace(/\n/g, '<br>') + '</div></div>'
    }

    if (next) {
      html += '<div class="section"><div class="section-title">📅 See You Next</div><div class="field" style="font-weight:700;">In about <span style="color:#7c3aed;">' + next + ' weeks</span></div></div>'
    }

    if (photosHtml) {
      html += '<div class="section"><div class="section-title">📸 Photos</div><div style="display:flex;flex-wrap:wrap;gap:8px;">' + photosHtml + '</div></div>'
    }

    html += '<div class="signature">'
    html += groomerName ? 'Cared for by <strong>' + groomerName + '</strong><br>' : ''
    html += 'Thanks for trusting us with ' + (petName || 'your pet') + '! 🐾'
    html += '</div>'
    html += '</body></html>'

    w.document.write(html)
    w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch (e) {} }, 350)
  }

  // ── Styles ──
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }
  const readStyle = { padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#111827', whiteSpace: 'pre-wrap' }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '620px', maxHeight: '92vh',
        background: '#fff', color: '#111827', borderRadius: '16px',
        padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
              📋 {mode === 'new' ? 'New' : mode === 'edit' ? 'Edit' : ''} Report Card
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              {petName} {petBreed ? '· ' + petBreed : ''} · {serviceType === 'grooming' ? 'Grooming' : 'Boarding'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Form */}
        {editing ? (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Services Performed</label>
              <textarea value={servicesPerformed} onChange={e => setServicesPerformed(e.target.value)}
                placeholder="e.g. Full groom, dematting, dremel, ear cleaning..."
                rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>How They Did</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {BEHAVIOR_OPTIONS.map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => setBehaviorRating(opt.key)}
                    style={{
                      padding: '10px 12px',
                      background: behaviorRating === opt.key ? opt.bg : '#fff',
                      color: behaviorRating === opt.key ? opt.color : '#4b5563',
                      border: '1.5px solid ' + (behaviorRating === opt.key ? opt.color : '#e5e7eb'),
                      borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                    }}>
                    <div style={{ fontWeight: 700 }}>{opt.label}</div>
                    <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 400 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Behavior Notes (optional)</label>
              <textarea value={behaviorNotes} onChange={e => setBehaviorNotes(e.target.value)}
                placeholder="e.g. Got nervous during dryer, did better when I worked slowly..."
                rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Recommendations (optional)</label>
              <textarea value={recommendations} onChange={e => setRecommendations(e.target.value)}
                placeholder="e.g. Brush twice a week to prevent mats, use a slip-on harness next time, dental chews..."
                rows={2} style={{ ...inputStyle, fontFamily: 'inherit' }} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>See You Next (optional)</label>
              <select value={nextVisitWeeks} onChange={e => setNextVisitWeeks(e.target.value)} style={inputStyle}>
                <option value="">— No specific recommendation —</option>
                {NEXT_VISIT_OPTIONS.map(o => (
                  <option key={o.weeks} value={o.weeks}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Groomer (your name)</label>
              <input type="text" value={groomerName} onChange={e => setGroomerName(e.target.value)}
                placeholder="e.g. Nicole" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Photos {photoUrls.length > 0 ? '(' + photoUrls.length + ')' : ''}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {photoUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: '90px', height: '90px' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    <button type="button" onClick={() => removePhoto(i)}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>×</button>
                  </div>
                ))}
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '90px', height: '90px',
                  border: '2px dashed #c4b5fd', borderRadius: '8px',
                  cursor: 'pointer', color: '#7c3aed', fontSize: '12px', fontWeight: 700, textAlign: 'center', padding: '6px',
                }}>
                  {uploading ? '⏳ Uploading...' : '📸 Add Photo'}
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadPhotos} disabled={uploading} />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={onClose} disabled={saving}
                style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: '14px' }}>
                {saving ? 'Saving…' : '✓ Save Report Card'}
              </button>
            </div>
          </>
        ) : (
          // ── VIEW MODE ──
          <>
            {servicesPerformed && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>✂️ Services Performed</label>
                <div style={readStyle}>{servicesPerformed}</div>
              </div>
            )}

            {behaviorRating && (() => {
              const opt = BEHAVIOR_OPTIONS.find(o => o.key === behaviorRating)
              if (!opt) return null
              return (
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>😊 How They Did</label>
                  <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '999px', background: opt.bg, color: opt.color, fontWeight: 700, fontSize: '14px' }}>
                    {opt.label}
                  </div>
                  {behaviorNotes && <div style={{ ...readStyle, marginTop: '8px' }}>{behaviorNotes}</div>}
                </div>
              )
            })()}

            {recommendations && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>💡 Recommendations</label>
                <div style={readStyle}>{recommendations}</div>
              </div>
            )}

            {nextVisitWeeks && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>📅 See You Next</label>
                <div style={readStyle}>In about <strong>{nextVisitWeeks} weeks</strong></div>
              </div>
            )}

            {photoUrls.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>📸 Photos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {photoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {groomerName && (
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
                Cared for by <strong style={{ color: '#111827' }}>{groomerName}</strong>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={onClose}
                style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                Close
              </button>
              {!clientView && (
                <button onClick={() => setEditing(true)}
                  style={{ padding: '10px 18px', background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                  ✏️ Edit
                </button>
              )}
              <button onClick={handlePrint}
                style={{ padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                🖨️ Print
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
