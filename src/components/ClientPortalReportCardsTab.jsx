// =============================================================================
// ClientPortalReportCardsTab.jsx — Read-only Report Cards view for clients
// =============================================================================
// Lives inside the client portal as the "📋 Report Cards" tab.
//
// What clients see here:
//   • A list of every report card the groomer has filled out for any of
//     their pets (newest first), pulled directly from `report_cards`.
//   • Each card shows: date, pet name, services performed, products used,
//     coat condition, behavior rating, recommendations, recommended next
//     visit, and any photos.
//   • A 🖨️ Print button opens a clean printable version (mirrors the
//     groomer-side ReportCardModal print HTML so the doc looks the same
//     whether printed by groomer or client).
//
// RLS: the existing "Clients view own report cards" policy on the
// report_cards table already restricts to rows where client_id matches
// the authed user's clients.user_id. No new SQL needed.
//
// Props:
//   clientId  — the authed client's clients.id (required)
//   shopName  — groomer's shop name from shop_settings (for print header)
// =============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Friendly display labels for behavior_rating enum values
const BEHAVIOR_LABELS = {
  great:     { emoji: '⭐', label: 'Great', color: '#16a34a' },
  good:      { emoji: '👍', label: 'Good', color: '#22c55e' },
  okay:      { emoji: '😊', label: 'Okay', color: '#f59e0b' },
  anxious:   { emoji: '😟', label: 'A bit anxious', color: '#f97316' },
  difficult: { emoji: '😬', label: 'Difficult', color: '#dc2626' },
}

export default function ClientPortalReportCardsTab({ clientId, shopName }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!clientId) { setLoading(false); return }
      try {
        // Pull report cards + linked pet name + linked appointment/boarding date.
        // Newest first so the most recent visit is at the top.
        const { data, error } = await supabase
          .from('report_cards')
          .select(`
            *,
            pets(name, breed),
            appointments(appointment_date, start_time),
            boarding_reservations(start_date, end_date)
          `)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!cancelled) setCards(data || [])
      } catch (e) {
        console.error('[ClientPortal Report Cards] load error:', e)
        if (!cancelled) setCards([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  // Print a single report card. Mirrors ReportCardModal's print HTML so
  // the printed doc looks identical whether triggered by groomer or client.
  function printReportCard(card) {
    const visitDate = getVisitDate(card)
    const petName = card.pets?.name || 'Pet'
    const breed = card.pets?.breed ? ' · ' + card.pets.breed : ''
    const beh = card.behavior_rating ? BEHAVIOR_LABELS[card.behavior_rating] : null

    let html = `
<!DOCTYPE html>
<html><head>
<title>Report Card — ${escapeHtml(petName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px; color: #1f2937; }
  .header { text-align: center; padding-bottom: 16px; border-bottom: 3px solid #7c3aed; margin-bottom: 24px; }
  .shop { font-size: 12px; color: #6b7280; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
  h1 { margin: 0; font-size: 26px; color: #7c3aed; }
  .pet-info { font-size: 16px; color: #6b7280; margin-top: 4px; }
  .visit-date { font-size: 13px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 18px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #7c3aed; }
  .section-title { font-weight: 700; color: #7c3aed; margin-bottom: 6px; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; }
  .field { font-size: 14px; line-height: 1.6; color: #374151; }
  .behavior { display: inline-block; padding: 4px 12px; border-radius: 16px; background: #ede9fe; color: #5b21b6; font-weight: 700; font-size: 13px; }
  .next-visit { display: inline-block; padding: 4px 12px; border-radius: 16px; background: #fef3c7; color: #92400e; font-weight: 700; font-size: 13px; }
  .photos { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
  .photos img { width: 100%; border-radius: 8px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af; }
  @media print { body { padding: 16px; } .section { background: #f9fafb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  ${shopName ? `<div class="shop">${escapeHtml(shopName)}</div>` : ''}
  <h1>📋 ${escapeHtml(petName)}'s Report Card</h1>
  <div class="pet-info">${escapeHtml(petName)}${escapeHtml(breed)}</div>
  ${visitDate ? `<div class="visit-date">${escapeHtml(visitDate)}</div>` : ''}
</div>`

    if (card.services_performed) {
      html += `<div class="section"><div class="section-title">✂️ Services Performed</div><div class="field">${escapeHtml(card.services_performed).replace(/\n/g, '<br>')}</div></div>`
    }
    if (card.products_used) {
      html += `<div class="section"><div class="section-title">🧴 Products Used</div><div class="field">${escapeHtml(card.products_used).replace(/\n/g, '<br>')}</div></div>`
    }
    if (card.coat_condition) {
      html += `<div class="section"><div class="section-title">🐕 Coat Condition</div><div class="field">${escapeHtml(card.coat_condition).replace(/\n/g, '<br>')}</div></div>`
    }
    if (beh) {
      html += `<div class="section"><div class="section-title">🐾 Behavior</div><div class="field"><span class="behavior">${beh.emoji} ${escapeHtml(beh.label)}</span>`
      if (card.behavior_notes) html += `<div style="margin-top:8px;">${escapeHtml(card.behavior_notes).replace(/\n/g, '<br>')}</div>`
      html += `</div></div>`
    }
    if (card.recommendations) {
      html += `<div class="section"><div class="section-title">💡 Recommendations</div><div class="field">${escapeHtml(card.recommendations).replace(/\n/g, '<br>')}</div></div>`
    }
    if (card.next_visit_weeks) {
      html += `<div class="section"><div class="section-title">📅 Next Visit</div><div class="field"><span class="next-visit">In ${card.next_visit_weeks} week${card.next_visit_weeks === 1 ? '' : 's'}</span></div></div>`
    }
    if (card.photo_urls && card.photo_urls.length > 0) {
      html += `<div class="section"><div class="section-title">📸 Photos</div><div class="photos">`
      for (const url of card.photo_urls) {
        html += `<img src="${escapeHtml(url)}" alt="Report photo" />`
      }
      html += `</div></div>`
    }
    if (card.groomer_name) {
      html += `<div class="footer">— ${escapeHtml(card.groomer_name)}</div>`
    }
    html += `</body></html>`

    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) {
      alert('Please allow popups to print the report card.')
      return
    }
    w.document.write(html)
    w.document.close()
    setTimeout(() => { w.print() }, 300)
  }

  function getVisitDate(card) {
    if (card.appointments?.appointment_date) {
      const d = new Date(card.appointments.appointment_date + 'T00:00:00')
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (card.boarding_reservations?.start_date) {
      const s = new Date(card.boarding_reservations.start_date + 'T00:00:00')
      const e = card.boarding_reservations.end_date ? new Date(card.boarding_reservations.end_date + 'T00:00:00') : null
      const sFmt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      if (!e || s.toDateString() === e.toDateString()) return sFmt
      const eFmt = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return sFmt + ' – ' + eFmt
    }
    if (card.created_at) {
      return new Date(card.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    return ''
  }

  if (loading) {
    return <div className="cp-card" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading report cards…</div>
  }

  if (cards.length === 0) {
    return (
      <div className="cp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>📋</div>
        <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#111827' }}>No report cards yet</h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          When your groomer fills out a report card after a visit, it'll show up here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="cp-card">
        <h3 className="cp-card-title">📋 Report Cards ({cards.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {cards.map(card => {
            const beh = card.behavior_rating ? BEHAVIOR_LABELS[card.behavior_rating] : null
            const petName = card.pets?.name || 'Pet'
            return (
              <div
                key={card.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  background: '#fff',
                  borderLeft: '4px solid #7c3aed',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#111827' }}>
                      🐾 {petName}
                      {card.pets?.breed && (
                        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500, marginLeft: '8px' }}>
                          · {card.pets.breed}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      {getVisitDate(card)}
                      {card.service_type === 'boarding' && <span style={{ marginLeft: '8px', padding: '1px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '10px', fontSize: '10px', fontWeight: 700 }}>BOARDING</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => printReportCard(card)}
                    style={{
                      padding: '8px 14px',
                      background: '#7c3aed',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🖨️ Print
                  </button>
                </div>

                {/* Behavior pill (top-of-card visual cue) */}
                {beh && (
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '16px', background: '#ede9fe', color: beh.color, fontWeight: 700, fontSize: '12px' }}>
                      {beh.emoji} {beh.label}
                    </span>
                    {card.next_visit_weeks && (
                      <span style={{ marginLeft: '6px', display: 'inline-block', padding: '4px 12px', borderRadius: '16px', background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '12px' }}>
                        📅 Next visit in {card.next_visit_weeks} week{card.next_visit_weeks === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                )}

                {/* Content sections */}
                {card.services_performed && (
                  <Section icon="✂️" title="Services Performed" body={card.services_performed} />
                )}
                {card.products_used && (
                  <Section icon="🧴" title="Products Used" body={card.products_used} />
                )}
                {card.coat_condition && (
                  <Section icon="🐕" title="Coat Condition" body={card.coat_condition} />
                )}
                {card.behavior_notes && (
                  <Section icon="📝" title="Behavior Notes" body={card.behavior_notes} />
                )}
                {card.recommendations && (
                  <Section icon="💡" title="Recommendations" body={card.recommendations} />
                )}

                {/* Photos */}
                {card.photo_urls && card.photo_urls.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>📸 Photos</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                      {card.photo_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="Report" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', cursor: 'zoom-in' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Groomer signature */}
                {card.groomer_name && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f3f4f6', fontSize: '11px', color: '#9ca3af', textAlign: 'right', fontStyle: 'italic' }}>
                    — {card.groomer_name}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Reusable little block for each labeled content section in a card
function Section({ icon, title, body }) {
  return (
    <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f9fafb', borderRadius: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{body}</div>
    </div>
  )
}

// Tiny HTML escaper for the print page (we're inserting raw user input into innerHTML).
function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
