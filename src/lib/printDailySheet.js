// ====================================================================
// PetPro — Printable Daily Schedule Sheet
// ====================================================================
// Generates a clean printable sheet showing:
//   • All grooming appointments for the chosen day
//   • Boarding CHECK-INS today
//   • Boarding CHECK-OUTS today
//
// Used by both Calendar.jsx + BoardingCalendar.jsx via a "🖨️ Print
// Today" button. Opens a new browser window with formatted HTML and
// triggers window.print() so the front desk gets a clean morning
// print-out.
// ====================================================================

import { supabase } from './supabase'
import { formatPhone } from './phone'
import { resolveBehaviorTags } from './behaviorTags'

// Format a HH:MM time into "9:00 AM"
function fmtTime(t) {
  if (!t) return ''
  var parts = t.split(':')
  var h = parseInt(parts[0], 10)
  var m = (parts[1] || '00').slice(0, 2)
  var ampm = h >= 12 ? 'PM' : 'AM'
  var h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

// Format YYYY-MM-DD into "Saturday, April 26, 2026"
function fmtDate(dateStr) {
  if (!dateStr) return ''
  var d = new Date(dateStr + 'T00:00:00')
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
}

function escapeHtml(s) {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tagPills(tagKeys) {
  var resolved = resolveBehaviorTags(tagKeys || [])
  if (resolved.length === 0) return ''
  return resolved.map(function (t) {
    return '<span class="tag" style="background:' + t.bg + ';color:' + t.color + ';border:1px solid ' + t.color + '33;">' +
      t.emoji + ' ' + escapeHtml(t.label) + '</span>'
  }).join(' ')
}

export async function printDailySheet(dateStr, shopNameOverride) {
  // Fetch the OWNER's user id for filtering
  var { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    alert('Please log in first.')
    return
  }
  var ownerId = user.id

  // Resolve shop name — caller can override; otherwise look it up
  var shopName = shopNameOverride
  if (!shopName) {
    var { data: shop } = await supabase
      .from('shop_settings')
      .select('shop_name')
      .eq('groomer_id', ownerId)
      .maybeSingle()
    shopName = (shop && shop.shop_name) || 'Today\'s Schedule'
  }

  // ── 1. Grooming appointments for this date ──
  var { data: appts } = await supabase
    .from('appointments')
    .select(`
      id, start_time, end_time, status, checked_in_at, checked_out_at,
      clients:client_id ( first_name, last_name, phone ),
      pets:pet_id ( name, breed, behavior_tags, allergies, medications ),
      services:service_id ( service_name ),
      staff_members:staff_id ( first_name, last_name ),
      appointment_pets (
        pets:pet_id ( name, breed, behavior_tags, allergies, medications ),
        services:service_id ( service_name ),
        appointment_pet_addons ( services:service_id ( service_name ) )
      )
    `)
    .eq('groomer_id', ownerId)
    .eq('appointment_date', dateStr)
    .not('status', 'in', '(cancelled,rescheduled)')
    .order('start_time', { ascending: true })

  // ── 2. Boarding reservations — check-ins today ──
  var { data: checkIns } = await supabase
    .from('boarding_reservations')
    .select(`
      id, start_date, end_date, start_time, end_time, status, notes,
      clients:client_id ( first_name, last_name, phone ),
      kennels:kennel_id ( name )
    `)
    .eq('groomer_id', ownerId)
    .eq('start_date', dateStr)
    .not('status', 'in', '(cancelled)')
    .order('start_time', { ascending: true })

  // ── 3. Boarding reservations — check-outs today ──
  var { data: checkOuts } = await supabase
    .from('boarding_reservations')
    .select(`
      id, start_date, end_date, start_time, end_time, status, notes,
      clients:client_id ( first_name, last_name, phone ),
      kennels:kennel_id ( name )
    `)
    .eq('groomer_id', ownerId)
    .eq('end_date', dateStr)
    .not('status', 'in', '(cancelled)')
    .order('end_time', { ascending: true })

  // ── 4. Boarding pets (separate query — multi-pet boarding) ──
  // For both check-ins + check-outs we need pet info per reservation
  var allBoardingIds = [].concat(
    (checkIns || []).map(function (r) { return r.id }),
    (checkOuts || []).map(function (r) { return r.id })
  )
  var petsByResId = {}
  if (allBoardingIds.length > 0) {
    var { data: brPets } = await supabase
      .from('boarding_reservation_pets')
      .select('reservation_id, pets:pet_id ( name, breed, behavior_tags, allergies, medications )')
      .in('reservation_id', allBoardingIds)
    ;(brPets || []).forEach(function (rp) {
      if (!petsByResId[rp.reservation_id]) petsByResId[rp.reservation_id] = []
      if (rp.pets) petsByResId[rp.reservation_id].push(rp.pets)
    })
  }

  // ── Build HTML ──
  var html = ''
  html += '<!DOCTYPE html><html><head><title>Today\'s Schedule — ' + fmtDate(dateStr) + '</title>'
  html += '<style>'
  html += '* { box-sizing: border-box; }'
  html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }'
  html += 'h1 { margin: 0 0 4px; font-size: 22px; }'
  html += 'h2 { margin: 24px 0 8px; font-size: 16px; padding-bottom: 4px; border-bottom: 2px solid #111827; }'
  html += '.meta { color: #6b7280; font-size: 13px; margin-bottom: 18px; }'
  html += '.row { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 6px; page-break-inside: avoid; }'
  html += '.row-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }'
  html += '.time { font-weight: 800; font-size: 14px; color: #111827; min-width: 78px; }'
  html += '.pet-name { font-weight: 700; font-size: 15px; color: #111827; }'
  html += '.client { color: #4b5563; font-size: 13px; }'
  html += '.phone { color: #4b5563; font-size: 12px; margin-left: 6px; }'
  html += '.meta-line { font-size: 12px; color: #4b5563; margin: 2px 0; }'
  html += '.alerts { font-size: 11px; color: #b91c1c; font-weight: 700; margin-top: 4px; }'
  html += '.tag { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; margin-right: 4px; margin-top: 4px; }'
  html += '.empty { color: #9ca3af; font-style: italic; padding: 8px 0; }'
  html += '.checked-in { background: #dcfce7; }'
  html += '.checked-out { opacity: 0.55; text-decoration: line-through; }'
  html += '@media print { body { margin: 12px; } .no-print { display: none; } }'
  html += '.print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }'
  html += '</style></head><body>'

  html += '<button class="print-btn no-print" onclick="window.print()">🖨️ Print this page</button>'

  html += '<h1>🐾 ' + escapeHtml(shopName || 'Today\'s Schedule') + '</h1>'
  html += '<div class="meta">' + fmtDate(dateStr) + '</div>'

  // ── GROOMING ──
  html += '<h2>✂️ Grooming &nbsp;<span style="color:#6b7280;font-weight:500;font-size:13px;">(' + (appts || []).length + ' appointment' + ((appts || []).length === 1 ? '' : 's') + ')</span></h2>'
  if (!appts || appts.length === 0) {
    html += '<div class="empty">No grooming appointments today.</div>'
  } else {
    appts.forEach(function (a) {
      var apPets = a.appointment_pets && a.appointment_pets.length > 0 ? a.appointment_pets : null
      var petNames = apPets
        ? apPets.map(function (ap) { return ap.pets && ap.pets.name }).filter(Boolean).join(', ')
        : (a.pets && a.pets.name) || 'Unknown pet'
      var breed = apPets && apPets[0] && apPets[0].pets && apPets[0].pets.breed
        ? apPets[0].pets.breed
        : (a.pets && a.pets.breed) || ''
      var clientName = a.clients ? (a.clients.first_name || '') + ' ' + (a.clients.last_name || '') : ''
      var phone = a.clients && a.clients.phone ? formatPhone(a.clients.phone) : ''
      var groomer = a.staff_members ? a.staff_members.first_name : 'Unassigned'

      // Services list (primary + add-ons across all pets)
      var serviceNames = []
      if (apPets) {
        apPets.forEach(function (ap) {
          if (ap.services && ap.services.service_name) serviceNames.push(ap.services.service_name)
          ;(ap.appointment_pet_addons || []).forEach(function (addon) {
            if (addon.services && addon.services.service_name) serviceNames.push(addon.services.service_name)
          })
        })
      } else if (a.services && a.services.service_name) {
        serviceNames.push(a.services.service_name)
      }

      // Behavior tags + allergies/meds across all pets
      var tagKeys = []
      var alerts = []
      var petsToCheck = apPets ? apPets.map(function (ap) { return ap.pets }) : (a.pets ? [a.pets] : [])
      petsToCheck.forEach(function (p) {
        if (!p) return
        if (Array.isArray(p.behavior_tags)) {
          p.behavior_tags.forEach(function (k) { if (tagKeys.indexOf(k) === -1) tagKeys.push(k) })
        }
        if (p.allergies) alerts.push('Allergies: ' + p.allergies)
        if (p.medications) alerts.push('Meds: ' + p.medications)
      })

      var rowClass = 'row'
      if (a.checked_out_at) rowClass += ' checked-out'
      else if (a.checked_in_at) rowClass += ' checked-in'

      html += '<div class="' + rowClass + '">'
      html += '<div class="row-head">'
      html += '<span class="time">' + fmtTime(a.start_time) + ' – ' + fmtTime(a.end_time) + '</span>'
      html += '<span class="pet-name">' + escapeHtml(petNames) + '</span>'
      if (breed) html += '<span class="client">(' + escapeHtml(breed) + ')</span>'
      html += '</div>'
      html += '<div class="meta-line"><strong>Owner:</strong> ' + escapeHtml(clientName.trim() || 'Unknown') +
              (phone ? '<span class="phone">📱 ' + escapeHtml(phone) + '</span>' : '') + '</div>'
      if (serviceNames.length > 0) {
        html += '<div class="meta-line"><strong>Service:</strong> ' + serviceNames.map(escapeHtml).join(' · ') + '</div>'
      }
      html += '<div class="meta-line"><strong>Groomer:</strong> ' + escapeHtml(groomer) + '</div>'
      if (alerts.length > 0) {
        html += '<div class="alerts">⚠️ ' + alerts.map(escapeHtml).join(' · ') + '</div>'
      }
      var pillsHtml = tagPills(tagKeys)
      if (pillsHtml) html += '<div>' + pillsHtml + '</div>'
      html += '</div>'
    })
  }

  // ── BOARDING CHECK-INS ──
  html += '<h2>🏠 Boarding — Check In Today &nbsp;<span style="color:#6b7280;font-weight:500;font-size:13px;">(' + (checkIns || []).length + ')</span></h2>'
  if (!checkIns || checkIns.length === 0) {
    html += '<div class="empty">No check-ins today.</div>'
  } else {
    checkIns.forEach(function (r) {
      var pets = petsByResId[r.id] || []
      var petNames = pets.map(function (p) { return p.name }).filter(Boolean).join(', ') || 'Unknown'
      var breeds = pets.map(function (p) { return p.breed }).filter(Boolean).join(' / ')
      var clientName = r.clients ? (r.clients.first_name || '') + ' ' + (r.clients.last_name || '') : ''
      var phone = r.clients && r.clients.phone ? formatPhone(r.clients.phone) : ''
      var kennelName = r.kennels ? r.kennels.name : '—'
      // nights
      var s = new Date(r.start_date + 'T00:00:00')
      var e = new Date(r.end_date + 'T00:00:00')
      var nights = Math.max(1, Math.round((e - s) / 86400000))

      // tags + alerts across all pets
      var tagKeys = []
      var alerts = []
      pets.forEach(function (p) {
        if (Array.isArray(p.behavior_tags)) {
          p.behavior_tags.forEach(function (k) { if (tagKeys.indexOf(k) === -1) tagKeys.push(k) })
        }
        if (p.allergies) alerts.push('Allergies: ' + p.allergies)
        if (p.medications) alerts.push('Meds: ' + p.medications)
      })

      html += '<div class="row">'
      html += '<div class="row-head">'
      html += '<span class="time">IN ' + fmtTime(r.start_time) + '</span>'
      html += '<span class="pet-name">' + escapeHtml(petNames) + '</span>'
      if (breeds) html += '<span class="client">(' + escapeHtml(breeds) + ')</span>'
      html += '</div>'
      html += '<div class="meta-line"><strong>Owner:</strong> ' + escapeHtml(clientName.trim() || 'Unknown') +
              (phone ? '<span class="phone">📱 ' + escapeHtml(phone) + '</span>' : '') + '</div>'
      html += '<div class="meta-line"><strong>Kennel:</strong> ' + escapeHtml(kennelName) +
              ' &nbsp;·&nbsp; <strong>' + nights + ' night' + (nights === 1 ? '' : 's') + '</strong></div>'
      if (r.notes) html += '<div class="meta-line"><strong>Notes:</strong> ' + escapeHtml(r.notes) + '</div>'
      if (alerts.length > 0) html += '<div class="alerts">⚠️ ' + alerts.map(escapeHtml).join(' · ') + '</div>'
      var pillsHtml = tagPills(tagKeys)
      if (pillsHtml) html += '<div>' + pillsHtml + '</div>'
      html += '</div>'
    })
  }

  // ── BOARDING CHECK-OUTS ──
  html += '<h2>🚪 Boarding — Check Out Today &nbsp;<span style="color:#6b7280;font-weight:500;font-size:13px;">(' + (checkOuts || []).length + ')</span></h2>'
  if (!checkOuts || checkOuts.length === 0) {
    html += '<div class="empty">No check-outs today.</div>'
  } else {
    checkOuts.forEach(function (r) {
      var pets = petsByResId[r.id] || []
      var petNames = pets.map(function (p) { return p.name }).filter(Boolean).join(', ') || 'Unknown'
      var clientName = r.clients ? (r.clients.first_name || '') + ' ' + (r.clients.last_name || '') : ''
      var phone = r.clients && r.clients.phone ? formatPhone(r.clients.phone) : ''
      var kennelName = r.kennels ? r.kennels.name : '—'

      html += '<div class="row">'
      html += '<div class="row-head">'
      html += '<span class="time">OUT ' + fmtTime(r.end_time) + '</span>'
      html += '<span class="pet-name">' + escapeHtml(petNames) + '</span>'
      html += '</div>'
      html += '<div class="meta-line"><strong>Owner:</strong> ' + escapeHtml(clientName.trim() || 'Unknown') +
              (phone ? '<span class="phone">📱 ' + escapeHtml(phone) + '</span>' : '') + '</div>'
      html += '<div class="meta-line"><strong>Kennel:</strong> ' + escapeHtml(kennelName) + '</div>'
      html += '</div>'
    })
  }

  html += '<div style="margin-top:32px;color:#9ca3af;font-size:11px;text-align:center;">'
  html += 'Printed from PetPro · ' + new Date().toLocaleString()
  html += '</div>'

  html += '</body></html>'

  // Open in new window and trigger print
  var w = window.open('', '_blank', 'width=900,height=900')
  if (!w) {
    alert('Could not open print window — please allow pop-ups for this site.')
    return
  }
  w.document.write(html)
  w.document.close()
  // Trigger print after the new window loads
  setTimeout(function () { try { w.focus(); w.print() } catch (e) { /* ignore */ } }, 350)
}
