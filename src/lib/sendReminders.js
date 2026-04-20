// =======================================================
// PetPro — Auto Appointment Reminders Engine
// Scans tomorrow's grooming appointments + boarding check-ins
// and sends reminders to the in-app messaging inbox.
// Used by:
//   1) "Send today's reminders now" button in ChatSettings
//   2) (later) Vercel cron job that runs daily
// =======================================================
import { supabase } from './supabase'

var REMINDER_THREAD_SUBJECT = 'Appointment Reminders'

// -------------------------------------------------------
// Main entry — send all pending reminders for a groomer.
// Returns: { success, groomingSent, boardingSent, errors[] }
// -------------------------------------------------------
export async function sendRemindersForGroomer(userId) {
  var result = {
    success: true,
    groomingSent: 0,
    boardingSent: 0,
    errors: [],
  }

  try {
    // 1) Load the shop's AI personalization (templates + address style)
    var { data: aiSettings, error: aiErr } = await supabase
      .from('ai_personalization')
      .select('*')
      .eq('groomer_id', userId)
      .maybeSingle()

    if (aiErr) {
      result.errors.push('Failed to load Chat Settings: ' + aiErr.message)
      result.success = false
      return result
    }

    if (!aiSettings) {
      result.errors.push('No Chat Settings found. Save your Chat Settings once before using reminders.')
      result.success = false
      return result
    }

    var timezone = aiSettings.reminder_send_timezone || 'America/Chicago'
    var tomorrowStr = getTomorrowDateStr(timezone)

    // 2) GROOMING reminders
    if (aiSettings.reminder_enabled) {
      var groomingResult = await sendGroomingReminders(userId, tomorrowStr, aiSettings)
      result.groomingSent += groomingResult.sent
      result.errors = result.errors.concat(groomingResult.errors)
    }

    // 3) BOARDING reminders
    if (aiSettings.boarding_reminder_enabled) {
      var boardingResult = await sendBoardingReminders(userId, tomorrowStr, aiSettings)
      result.boardingSent += boardingResult.sent
      result.errors = result.errors.concat(boardingResult.errors)
    }

    return result
  } catch (e) {
    console.error('sendRemindersForGroomer failed:', e)
    result.success = false
    result.errors.push(e.message || 'Unknown error')
    return result
  }
}

// -------------------------------------------------------
// GROOMING — send reminders for tomorrow's appointments
// -------------------------------------------------------
async function sendGroomingReminders(userId, tomorrowStr, aiSettings) {
  var out = { sent: 0, errors: [] }

  var { data: appts, error: apptsErr } = await supabase
    .from('appointments')
    .select(
      'id, appointment_date, start_time, client_id, pet_id, service_id, status, ' +
      'clients:client_id(first_name, last_name), ' +
      'pets:pet_id(name), ' +
      'services:service_id(service_name)'
    )
    .eq('groomer_id', userId)
    .eq('appointment_date', tomorrowStr)
    .is('reminder_sent_at', null)

  if (apptsErr) {
    out.errors.push('Grooming query failed: ' + apptsErr.message)
    return out
  }
  if (!appts || appts.length === 0) return out

  // Skip cancelled
  var toRemind = appts.filter(function (a) { return a.status !== 'cancelled' })

  for (var i = 0; i < toRemind.length; i++) {
    var appt = toRemind[i]
    if (!appt.client_id) {
      out.errors.push('Appointment ' + appt.id + ' has no client_id — skipped')
      continue
    }

    try {
      var ownerName = formatOwnerName(appt.clients, aiSettings.address_style || 'first_name')
      var petName = (appt.pets && appt.pets.name) ? appt.pets.name : 'your pet'
      var serviceName = (appt.services && appt.services.service_name) ? appt.services.service_name : 'appointment'
      var timeStr = formatTime12h(appt.start_time)

      var text = aiSettings.reminder_template || ''
      text = text
        .replace(/\{owner_name\}/g, ownerName)
        .replace(/\{pet_name\}/g, petName)
        .replace(/\{service\}/g, serviceName)
        .replace(/\{time\}/g, timeStr)

      var threadId = await findOrCreateReminderThread(userId, appt.client_id)
      if (!threadId) {
        out.errors.push('Could not find/create thread for client ' + appt.client_id)
        continue
      }

      var nowIso = new Date().toISOString()

      // Insert message
      var { error: insertErr } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          groomer_id: userId,
          client_id: appt.client_id,
          sender_type: 'groomer',
          text: text,
          read_by_groomer: true,
          read_by_client: false,
        })

      if (insertErr) {
        out.errors.push('Insert failed for appt ' + appt.id + ': ' + insertErr.message)
        continue
      }

      // Bump thread last_message_at
      await supabase
        .from('threads')
        .update({ last_message_at: nowIso })
        .eq('id', threadId)

      // Mark reminder_sent_at so we never double-send
      await supabase
        .from('appointments')
        .update({ reminder_sent_at: nowIso })
        .eq('id', appt.id)

      out.sent += 1
    } catch (e) {
      out.errors.push('Grooming send error for appt ' + appt.id + ': ' + (e.message || e))
    }
  }

  return out
}

// -------------------------------------------------------
// BOARDING — send reminders for tomorrow's check-ins
// -------------------------------------------------------
async function sendBoardingReminders(userId, tomorrowStr, aiSettings) {
  var out = { sent: 0, errors: [] }

  var { data: resvs, error: resvErr } = await supabase
    .from('boarding_reservations')
    .select(
      'id, start_date, end_date, client_id, status, ' +
      'clients:client_id(first_name, last_name), ' +
      'boarding_reservation_pets(pet_id, pets:pet_id(name))'
    )
    .eq('groomer_id', userId)
    .eq('start_date', tomorrowStr)
    .is('reminder_sent_at', null)

  if (resvErr) {
    out.errors.push('Boarding query failed: ' + resvErr.message)
    return out
  }
  if (!resvs || resvs.length === 0) return out

  var toRemind = resvs.filter(function (r) { return r.status !== 'cancelled' })

  for (var i = 0; i < toRemind.length; i++) {
    var resv = toRemind[i]
    if (!resv.client_id) {
      out.errors.push('Reservation ' + resv.id + ' has no client_id — skipped')
      continue
    }

    try {
      var ownerName = formatOwnerName(resv.clients, aiSettings.address_style || 'first_name')

      var petNames = (resv.boarding_reservation_pets || [])
        .map(function (brp) { return brp.pets ? brp.pets.name : null })
        .filter(function (n) { return n })
        .join(' & ')
      if (!petNames) petNames = 'your pet'

      var startDateStr = formatDateShort(resv.start_date)
      var endDateStr = formatDateShort(resv.end_date)

      var text = aiSettings.boarding_reminder_template || ''
      text = text
        .replace(/\{owner_name\}/g, ownerName)
        .replace(/\{pet_names\}/g, petNames)
        .replace(/\{start_date\}/g, startDateStr)
        .replace(/\{end_date\}/g, endDateStr)

      var threadId = await findOrCreateReminderThread(userId, resv.client_id)
      if (!threadId) {
        out.errors.push('Could not find/create thread for client ' + resv.client_id)
        continue
      }

      var nowIso = new Date().toISOString()

      var { error: insertErr } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          groomer_id: userId,
          client_id: resv.client_id,
          sender_type: 'groomer',
          text: text,
          read_by_groomer: true,
          read_by_client: false,
        })

      if (insertErr) {
        out.errors.push('Insert failed for reservation ' + resv.id + ': ' + insertErr.message)
        continue
      }

      await supabase
        .from('threads')
        .update({ last_message_at: nowIso })
        .eq('id', threadId)

      await supabase
        .from('boarding_reservations')
        .update({ reminder_sent_at: nowIso })
        .eq('id', resv.id)

      out.sent += 1
    } catch (e) {
      out.errors.push('Boarding send error for reservation ' + resv.id + ': ' + (e.message || e))
    }
  }

  return out
}

// -------------------------------------------------------
// Thread utility — find existing "Appointment Reminders"
// thread for this (groomer, client) pair, or create one.
// This is the permanent stacking thread per Q2B.
// -------------------------------------------------------
async function findOrCreateReminderThread(groomerId, clientId) {
  var { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('groomer_id', groomerId)
    .eq('client_id', clientId)
    .eq('subject', REMINDER_THREAD_SUBJECT)
    .maybeSingle()

  if (existing && existing.id) return existing.id

  var { data: created, error: createErr } = await supabase
    .from('threads')
    .insert({
      groomer_id: groomerId,
      client_id: clientId,
      subject: REMINDER_THREAD_SUBJECT,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (createErr) {
    console.error('Create reminder thread failed:', createErr)
    return null
  }
  return created.id
}

// -------------------------------------------------------
// Date/time helpers
// -------------------------------------------------------
function getTomorrowDateStr(timezone) {
  var now = new Date()
  var todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }) // 'YYYY-MM-DD'
  var parts = todayStr.split('-')
  var y = parseInt(parts[0], 10)
  var m = parseInt(parts[1], 10)
  var d = parseInt(parts[2], 10)
  var tomorrow = new Date(y, m - 1, d + 1)
  var yy = tomorrow.getFullYear()
  var mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
  var dd = String(tomorrow.getDate()).padStart(2, '0')
  return yy + '-' + mm + '-' + dd
}

function formatTime12h(timeStr) {
  if (!timeStr) return ''
  var parts = String(timeStr).split(':')
  var h = parseInt(parts[0], 10)
  var m = parts[1] || '00'
  var ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return h + ':' + m + ' ' + ampm
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  var d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatOwnerName(client, style) {
  if (!client) return 'there'
  var first = (client.first_name || '').trim()
  var last = (client.last_name || '').trim()
  if (style === 'mr_mrs_last') return 'Mr./Mrs. ' + (last || first || 'there')
  if (style === 'full_name') return (first + ' ' + last).trim() || 'there'
  return first || 'there'
}
