// ============================================================
// PetPro — Client Portal Claude (client-chat-command)
// Scoped to ONE client. Can only book/reschedule/cancel their own stuff.
// Respects per-groomer toggles on ai_personalization.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

var supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

var claudeKey = Deno.env.get('CLAUDE_API_KEY') ?? ''

// ============================================================
// PUSH NOTIFICATION HELPER — fires a browser push to a user.
// Fire-and-forget: we NEVER want a push failure to block a
// user's action (like booking). All errors are logged + swallowed.
// ============================================================
async function sendPushToUser(userId: string, title: string, body: string, url: string, tag?: string) {
  if (!userId || !title) return
  try {
    var supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    var serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      console.warn('[push] SUPABASE_URL or SERVICE_ROLE_KEY missing — skipping push')
      return
    }
    var res = await fetch(supabaseUrl + '/functions/v1/send-push', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        title: title,
        body: body || '',
        url: url || '/',
        tag: tag || undefined,
      }),
    })
    if (!res.ok) {
      var txt = await res.text().catch(function () { return '' })
      console.warn('[push] send-push returned', res.status, txt)
    }
  } catch (err) {
    console.warn('[push] sendPushToUser failed (non-fatal):', err)
  }
}

// Format a 24h "HH:MM" time into "h:MM am/pm" for notification previews
function formatTimeForPush(hhmm: string): string {
  if (!hhmm) return ''
  var p = String(hhmm).split(':')
  var h = parseInt(p[0], 10)
  var m = parseInt(p[1] || '0', 10)
  var ampm = h >= 12 ? 'pm' : 'am'
  var h12 = h % 12 === 0 ? 12 : h % 12
  var mm = m < 10 ? '0' + m : String(m)
  return h12 + ':' + mm + ampm
}

// Format a YYYY-MM-DD into a short "Mon Apr 22" style label
function formatDateForPush(ymd: string): string {
  if (!ymd) return ''
  var parts = String(ymd).split('-')
  if (parts.length !== 3) return ymd
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var mIdx = parseInt(parts[1], 10) - 1
  if (mIdx < 0 || mIdx > 11) return ymd
  return months[mIdx] + ' ' + parseInt(parts[2], 10)
}

// ============================================================
// WAITLIST RESPONSE HANDLER — Task #84 Step 5
// ------------------------------------------------------------
// When the Waitlist Auto-Notify edge function offers a client
// an open slot, the client replies in chat. This helper checks
// if there's a pending offer for this client. If yes, it uses
// Claude Haiku to classify the reply (yes/no/unclear) and:
//   - YES + auto_book setting  -> creates the appointment
//   - YES + notify_groomer     -> marks 'accepted', pings groomer
//   - NO                        -> releases the entry back to 'waiting'
//   - unclear                   -> returns null (falls through to normal chat)
// All groomer-facing copy says "PetPro AI" (global branding rule).
// ============================================================
async function classifyWaitlistReply(messageText: string): Promise<string> {
  // Cheap local heuristic first — skip Haiku if reply is obviously yes/no
  var t = (messageText || '').trim().toLowerCase()
  if (!t) return 'unclear'
  var literalYes = ['y', 'yes', 'yes!', 'yep', 'yeah', 'yup', 'sure', 'ok', 'okay']
  var literalNo = ['n', 'no', 'no!', 'nope', 'nah', 'pass', 'cant', "can't"]
  if (literalYes.indexOf(t) >= 0) return 'yes'
  if (literalNo.indexOf(t) >= 0) return 'no'

  // Fallback: ask Haiku
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: 'You are classifying a reply to an appointment-slot offer. The client was asked if they want an open grooming slot. Reply with EXACTLY one word, lowercase, no punctuation: "yes" if they accept the slot, "no" if they decline it, or "unclear" if the reply is a question, confusion, or anything else.',
        messages: [{ role: 'user', content: messageText }],
      }),
    })
    if (!resp.ok) return 'unclear'
    var data = await resp.json()
    var out = ''
    if (data && data.content) {
      for (var b of data.content) { if (b.type === 'text') out += b.text }
    }
    out = (out || '').trim().toLowerCase().replace(/[^a-z]/g, '')
    if (out === 'yes' || out === 'no' || out === 'unclear') return out
    return 'unclear'
  } catch (err) {
    console.warn('[waitlist] classify failed (non-fatal):', err)
    return 'unclear'
  }
}

// Format ISO timestamp (e.g. "2026-04-27T10:00:00") into a friendly
// "Mon Apr 27 at 10:00am" string for client-facing reply copy.
function formatSlotForReply(isoStr: string): string {
  if (!isoStr) return ''
  var datePart = isoStr.split('T')[0] || ''
  var timePart = (isoStr.split('T')[1] || '').slice(0, 5)
  return formatDateForPush(datePart) + ' at ' + formatTimeForPush(timePart)
}

async function handleWaitlistResponse(
  clientId: string,
  groomerId: string,
  messageText: string
): Promise<{ text: string } | null> {
  try {
    // 1) Is there a pending waitlist offer for this client?
    var nowIso = new Date().toISOString()
    var { data: offers } = await supabaseAdmin
      .from('grooming_waitlist')
      .select('id, pet_id, service_id, offered_slot_start, offered_slot_end, expires_at, pets:pet_id(name), clients:client_id(first_name, last_name, user_id)')
      .eq('client_id', clientId)
      .eq('groomer_id', groomerId)
      .eq('status', 'notified')
      .gt('expires_at', nowIso)
      .order('notified_at', { ascending: false })
      .limit(1)

    if (!offers || offers.length === 0) return null
    var offer = offers[0]
    if (!offer.offered_slot_start || !offer.offered_slot_end) return null

    // 2) Classify the reply
    var verdict = await classifyWaitlistReply(messageText)
    if (verdict === 'unclear') return null  // let normal chat handle it

    var petName = (offer.pets && offer.pets.name) || 'your pet'
    var clientFirst = (offer.clients && offer.clients.first_name) || 'Client'
    var clientLast = (offer.clients && offer.clients.last_name) || ''
    var slotLabel = formatSlotForReply(offer.offered_slot_start)

    // -----------------------------------------------------------
    // CLIENT SAID NO — release entry back to the waitlist
    // -----------------------------------------------------------
    if (verdict === 'no') {
      await supabaseAdmin
        .from('grooming_waitlist')
        .update({
          status: 'waiting',
          expires_at: null,
          offered_slot_start: null,
          offered_slot_end: null,
          offered_appointment_id: null,
        })
        .eq('id', offer.id)

      // Heads-up push to groomer (non-blocking)
      sendPushToUser(
        groomerId,
        'ℹ️ Waitlist pass',
        clientFirst + ' ' + clientLast + ' passed on the ' + slotLabel + ' slot — back on the waitlist.',
        '/waitlist',
        'waitlist-pass-' + offer.id
      )

      return { text: 'No worries! You\'re still on the waitlist for the next opening 🐾' }
    }

    // -----------------------------------------------------------
    // CLIENT SAID YES — check groomer's on-yes preference
    // -----------------------------------------------------------
    var { data: prefs } = await supabaseAdmin
      .from('ai_personalization')
      .select('waitlist_on_yes_action')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    var onYes = (prefs && prefs.waitlist_on_yes_action) || 'notify_groomer'

    // --- Mode A: AUTO-BOOK the appointment ---
    if (onYes === 'auto_book') {
      var slotStart = offer.offered_slot_start   // ISO
      var slotEnd = offer.offered_slot_end
      var apptDate = slotStart.split('T')[0]
      var startTime = (slotStart.split('T')[1] || '').slice(0, 8) || (slotStart.split('T')[1] || '').slice(0, 5)
      var endTime = (slotEnd.split('T')[1] || '').slice(0, 8) || (slotEnd.split('T')[1] || '').slice(0, 5)

      var { data: newAppt, error: apptErr } = await supabaseAdmin
        .from('appointments')
        .insert({
          groomer_id: groomerId,
          client_id: clientId,
          pet_id: offer.pet_id,
          service_id: offer.service_id,
          appointment_date: apptDate,
          start_time: startTime,
          end_time: endTime,
          status: 'confirmed',
          service_notes: 'Auto-booked from waitlist by PetPro AI',
        })
        .select('id')
        .single()

      if (apptErr) {
        console.error('[waitlist] auto-book insert failed:', apptErr)
        // Fall back to notify_groomer flow so we still capture the YES
        await supabaseAdmin
          .from('grooming_waitlist')
          .update({ status: 'accepted' })
          .eq('id', offer.id)

        sendPushToUser(
          groomerId,
          '🎉 Waitlist YES — needs manual booking',
          clientFirst + ' ' + clientLast + ' said YES to ' + slotLabel + ' (auto-book failed, please book manually)',
          '/portal/messages',
          'waitlist-yes-' + offer.id
        )

        return { text: 'Got it! The groomer will confirm your booking shortly 🐾' }
      }

      // Success — mark waitlist done and ping groomer
      await supabaseAdmin
        .from('grooming_waitlist')
        .update({ status: 'booked' })
        .eq('id', offer.id)

      sendPushToUser(
        groomerId,
        '✅ Waitlist auto-booked!',
        clientFirst + ' ' + clientLast + ' (' + petName + ') is on the books for ' + slotLabel,
        '/calendar',
        'waitlist-book-' + offer.id
      )

      return { text: 'You\'re all set! ' + petName + ' is booked for ' + slotLabel + '. See you then 🐾' }
    }

    // --- Mode B: NOTIFY GROOMER (default, safer) ---
    await supabaseAdmin
      .from('grooming_waitlist')
      .update({ status: 'accepted' })
      .eq('id', offer.id)

    sendPushToUser(
      groomerId,
      '🎉 Waitlist YES!',
      clientFirst + ' ' + clientLast + ' (' + petName + ') said YES to ' + slotLabel + ' — tap to book',
      '/portal/messages',
      'waitlist-yes-' + offer.id
    )

    return { text: 'Awesome! The groomer has been notified and will confirm your ' + slotLabel + ' spot shortly 🐾' }
  } catch (err) {
    console.error('[waitlist] handleWaitlistResponse failed:', err)
    return null  // never block normal chat on waitlist errors
  }
}

// ============================================================
// BOOKING RULES CHECKER — enforces shop_settings.booking_rules
// Mirror of /src/lib/bookingRules.js for this edge function runtime.
// Phase 6 Step 3c.
// ============================================================
var RULE_DEFAULT_MESSAGES = {
  weight: "Thanks for reaching out! I'll need to run this by the groomer first — she'll text you within 24 hours to confirm.",
  breed_block: "Unfortunately we don't currently service this breed. Please call the shop if you have any questions.",
  breed_approval: "Thanks for booking! I'll run this by the groomer and she'll text you within 24 hours to confirm.",
  first_time: "Welcome! Since you're new to us, the groomer will review your booking and text you within 24 hours to confirm your appointment.",
  vax: "Quick note — I'll need to double-check vaccination records with the groomer before confirming. She'll text you within 24 hours.",
  aggression_block: "Unfortunately we're not able to take dogs with aggression concerns. Please call the shop if you'd like to discuss.",
  aggression_approval: "Thanks for booking! I'll check with the groomer since there's some handling notes on file — she'll text you shortly.",
  cutoff_block: "Sorry — we're not taking any more bookings for today. Please try tomorrow or later in the week!",
  cutoff_approval: "Got it! Since this is short notice, I'll run it by the groomer and she'll text you shortly to confirm.",
  daily_cap: "Sorry — we're fully booked that day! Would another day work?",
  generic_hold: "Got it — I'll check with the groomer and she'll text you shortly to confirm.",
}

function ruleMatchesBreed(petBreed: string, blockedList: string[]): boolean {
  if (!petBreed) return false
  if (!blockedList || !blockedList.length) return false
  var needle = String(petBreed).trim().toLowerCase()
  for (var i = 0; i < blockedList.length; i++) {
    var hay = String(blockedList[i]).trim().toLowerCase()
    if (!hay) continue
    if (needle === hay) return true
    if (needle.indexOf(hay) !== -1) return true
    if (hay.indexOf(needle) !== -1) return true
  }
  return false
}

function checkBookingAgainstRules(opts: any) {
  opts = opts || {}
  var breed = opts.breed || ''
  var weight = opts.weight ? Number(opts.weight) : null
  var isFirstTime = !!opts.isFirstTime
  var vaccinationExpiry = opts.vaccinationExpiry || null
  var dogAggressive = !!opts.dogAggressive
  var rules = opts.rules || {}

  var flags: any[] = []
  var action = 'allow'
  var messages: string[] = []

  // RULE 1: Weight limit (approval)
  var wl = rules.weight_limit
  if (wl && wl.enabled && weight && weight > (wl.max_lbs || 100)) {
    flags.push({ level: 'warning', rule: 'weight_limit', message: 'Over weight limit: ' + weight + ' lbs (max ' + (wl.max_lbs || 100) + ' lbs)' })
    if (action === 'allow') action = 'needs_approval'
    messages.push(wl.decline_message || RULE_DEFAULT_MESSAGES.weight)
  }

  // RULE 2: Breed blocks
  var bb = rules.breed_blocks
  if (bb && bb.enabled && ruleMatchesBreed(breed, bb.breeds)) {
    if (bb.mode === 'block') {
      flags.push({ level: 'danger', rule: 'breed_block', message: 'Breed "' + breed + '" is on the blocked list' })
      return { action: 'block', message: bb.decline_message || RULE_DEFAULT_MESSAGES.breed_block, flags: flags }
    } else {
      flags.push({ level: 'warning', rule: 'breed_approval', message: 'Breed "' + breed + '" needs groomer approval' })
      if (action === 'allow') action = 'needs_approval'
      messages.push(bb.decline_message || RULE_DEFAULT_MESSAGES.breed_approval)
    }
  }

  // RULE 3: First-time client approval
  var ft = rules.first_time_approval
  if (ft && ft.enabled && isFirstTime) {
    flags.push({ level: 'info', rule: 'first_time_approval', message: 'First-time client — needs groomer approval' })
    if (action === 'allow') action = 'needs_approval'
    messages.push(ft.decline_message || RULE_DEFAULT_MESSAGES.first_time)
  }

  // RULE 4: Vaccinations required (approval only)
  var vax = rules.vaccinations_required
  if (vax && vax.enabled) {
    var vaxMissing = false
    var vaxExpired = false
    if (!vaccinationExpiry) {
      vaxMissing = true
    } else {
      var expiryDate = new Date(vaccinationExpiry)
      var todayMidnight = new Date()
      todayMidnight.setHours(0, 0, 0, 0)
      if (!isNaN(expiryDate.getTime()) && expiryDate < todayMidnight) {
        vaxExpired = true
      }
    }
    if (vaxMissing || vaxExpired) {
      flags.push({
        level: 'warning',
        rule: 'vaccinations_required',
        message: vaxMissing ? 'No vaccination expiry on file' : 'Vaccinations expired (' + vaccinationExpiry + ')',
      })
      if (action === 'allow') action = 'needs_approval'
      messages.push(vax.decline_message || RULE_DEFAULT_MESSAGES.vax)
    }
  }

  // RULE 6: Aggression flag (block OR approval)
  var agg = rules.aggression_flag
  if (agg && agg.enabled && dogAggressive) {
    if (agg.mode === 'block') {
      flags.push({ level: 'danger', rule: 'aggression_block', message: 'Pet is flagged dog-aggressive' })
      return { action: 'block', message: agg.decline_message || RULE_DEFAULT_MESSAGES.aggression_block, flags: flags }
    } else {
      flags.push({ level: 'warning', rule: 'aggression_approval', message: 'Pet is flagged dog-aggressive — needs groomer approval' })
      if (action === 'allow') action = 'needs_approval'
      messages.push(agg.decline_message || RULE_DEFAULT_MESSAGES.aggression_approval)
    }
  }

  // RULE 7: Same-day cutoff (block OR approval)
  var cf = rules.same_day_cutoff
  if (cf && cf.enabled && opts.appointmentDate && opts.startTime) {
    var tdStr = opts.todayDateStr
    var curHour = (typeof opts.currentHour === 'number') ? opts.currentHour : new Date().getHours()
    var hoursUntil = opts.hoursUntilBooking
    if (typeof hoursUntil !== 'number') {
      var bParts = String(opts.startTime).split(':')
      var bDateParts = String(opts.appointmentDate).split('-')
      var bDate = new Date(
        parseInt(bDateParts[0], 10),
        parseInt(bDateParts[1], 10) - 1,
        parseInt(bDateParts[2], 10),
        parseInt(bParts[0], 10),
        parseInt(bParts[1] || '0', 10)
      )
      hoursUntil = (bDate.getTime() - Date.now()) / (1000 * 60 * 60)
    }

    var cfTripped = false
    var cfReason = ''
    var ch = cf.cutoff_hour
    if (ch && ch > 0 && tdStr && opts.appointmentDate === tdStr && curHour >= ch) {
      cfTripped = true
      cfReason = 'Same-day cutoff: it is already past ' + ch + ':00'
    }
    var lh = cf.lead_hours
    if (lh && lh > 0 && hoursUntil < lh) {
      cfTripped = true
      if (!cfReason) {
        cfReason = 'Less than ' + lh + ' hours of lead time (' + (Math.round(hoursUntil * 10) / 10) + ' hrs ahead)'
      }
    }

    if (cfTripped) {
      if (cf.mode === 'block') {
        flags.push({ level: 'danger', rule: 'same_day_cutoff', message: cfReason })
        return { action: 'block', message: cf.decline_message || RULE_DEFAULT_MESSAGES.cutoff_block, flags: flags }
      } else {
        flags.push({ level: 'warning', rule: 'same_day_cutoff', message: cfReason + ' — needs approval' })
        if (action === 'allow') action = 'needs_approval'
        messages.push(cf.decline_message || RULE_DEFAULT_MESSAGES.cutoff_approval)
      }
    }
  }

  // RULE 9: Daily pet cap (block only)
  var dc = rules.daily_cap
  if (dc && dc.enabled) {
    var petsAdding = Number(opts.petsBeingAdded || 1)
    if (petsAdding < 1) petsAdding = 1
    var dayCount = Number(opts.existingCountForDay || 0)
    var staffCount = Number(opts.existingCountForStaff || 0)

    var capTripped = false
    var capReason = ''
    var swMax = Number(dc.shop_wide_max || 0)
    if (swMax > 0 && dayCount + petsAdding > swMax) {
      capTripped = true
      capReason = 'Shop-wide daily cap (' + swMax + ') exceeded: ' + dayCount + ' booked + ' + petsAdding + ' requested > ' + swMax
    }
    if (!capTripped && opts.assignedStaffId && dc.staff_caps) {
      var sCap = Number(dc.staff_caps[opts.assignedStaffId] || 0)
      if (sCap > 0 && staffCount + petsAdding > sCap) {
        capTripped = true
        capReason = 'Staff daily cap (' + sCap + ') exceeded: ' + staffCount + ' booked + ' + petsAdding + ' requested > ' + sCap
      }
    }

    if (capTripped) {
      flags.push({ level: 'danger', rule: 'daily_cap', message: capReason })
      return { action: 'block', message: dc.decline_message || RULE_DEFAULT_MESSAGES.daily_cap, flags: flags }
    }
  }

  if (action === 'allow') return { action: 'allow', message: '', flags: [] }

  var finalMessage = ''
  for (var j = 0; j < messages.length; j++) {
    if (messages[j] && messages[j].trim()) { finalMessage = messages[j]; break }
  }
  if (!finalMessage) finalMessage = RULE_DEFAULT_MESSAGES.generic_hold

  return { action: action, message: finalMessage, flags: flags }
}

// ============================================================
// TOOL DEFINITIONS (client-scoped, tightly guardrailed)
// ============================================================
var toolDefinitions = [
  {
    name: 'client_book_appointment',
    description: 'Book a grooming appointment for the CURRENT client\'s own pet. If auto-book is on and client has no spam flags, creates as scheduled. Otherwise creates as pending for groomer approval.',
    input_schema: {
      type: 'object',
      properties: {
        pet_id: { type: 'string', description: 'Must be one of the client\'s own pets (see MY PETS in context).' },
        appointment_date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM 24-hour' },
        service_id: { type: 'string', description: 'REQUIRED. Which service from SERVICES OFFERED. Must ask the client which service (bath, full haircut, face/feet trim + bath, nails, etc.) before booking — DO NOT GUESS or leave blank.' },
        duration_minutes: { type: 'number', description: 'Default 60.' },
        service_notes: { type: 'string', description: 'Any special requests for the groomer.' },
      },
      required: ['pet_id', 'appointment_date', 'start_time', 'service_id'],
    },
  },
  {
    name: 'client_reschedule_appointment',
    description: 'Move an existing appointment for the CURRENT client to a new date/time. Only works on their own appointments. If groomer has reschedule toggle off, this tool will refuse.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string', description: 'Must be one of the client\'s own appointments.' },
        new_date: { type: 'string', description: 'YYYY-MM-DD' },
        new_start_time: { type: 'string', description: 'HH:MM 24-hour' },
      },
      required: ['appointment_id', 'new_date', 'new_start_time'],
    },
  },
  {
    name: 'client_cancel_appointment',
    description: 'Cancel an existing appointment for the CURRENT client. Only works on their own appointments. If groomer has cancel toggle off, this tool will refuse.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'client_list_my_appointments',
    description: 'Show the current client\'s own upcoming appointments. Useful for "what\'s coming up?" or before rescheduling.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'client_check_availability',
    description: 'REQUIRED before suggesting a specific time to a client. Returns the list of ALREADY-BOOKED time slots on a given date so you can pick a time that does not overlap. Shop hours default to 8 AM - 5 PM. Any time NOT in booked_slots is available.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD — use the DATE REFERENCE table in the system prompt to compute this.' },
        duration_minutes: { type: 'number', description: 'How long the service will take. Default 60.' },
      },
      required: ['date'],
    },
  },
]

// ============================================================
// TOOL EXECUTION
// ============================================================
async function executeTool(toolName: string, toolInput: any, ctx: any) {
  var clientId = ctx.clientId
  var groomerId = ctx.groomerId
  var toggles = ctx.toggles

  try {
    switch (toolName) {
      // --- BOOK ---
      case 'client_book_appointment': {
        console.log('[BOOK] tool input:', JSON.stringify(toolInput))
        if (!toolInput.pet_id || !toolInput.appointment_date || !toolInput.start_time) {
          console.error('[BOOK] missing required fields:', JSON.stringify(toolInput))
          return { success: false, error: 'pet_id, appointment_date, and start_time required' }
        }

        // Verify pet belongs to this client (also pulls fields needed for rule check)
        var { data: petCheck, error: petErr } = await supabaseAdmin
          .from('pets')
          .select('id, name, breed, weight, vaccination_expiry, dog_aggressive')
          .eq('id', toolInput.pet_id)
          .eq('client_id', clientId)
          .maybeSingle()
        if (petErr) console.error('[BOOK] pet check error:', petErr.message)
        if (!petCheck) {
          console.error('[BOOK] pet not found for client:', toolInput.pet_id, 'clientId:', clientId)
          return { success: false, error: 'That pet isn\'t on your profile.' }
        }

        // =====================================================
        // BOOKING RULES CHECK (Phase 6 Step 3c)
        // Enforces shop_settings.booking_rules before booking.
        // =====================================================
        var { data: rulesRow } = await supabaseAdmin
          .from('shop_settings')
          .select('booking_rules')
          .eq('groomer_id', groomerId)
          .maybeSingle()
        var bookingRules = (rulesRow && rulesRow.booking_rules) || {}

        // Figure out if this client is first-time (only if that rule is enabled)
        var isFirstTimeClient = false
        if (bookingRules.first_time_approval && bookingRules.first_time_approval.enabled) {
          var { data: priorAppts } = await supabaseAdmin
            .from('appointments')
            .select('id')
            .eq('client_id', clientId)
            .eq('groomer_id', groomerId)
            .neq('status', 'cancelled')
            .limit(1)
          isFirstTimeClient = !priorAppts || priorAppts.length === 0
        }

        // ---- Look up regular staff BEFORE rule check (daily cap needs it) ----
        var regularStaffId: string | null = null
        var { data: lastAppt } = await supabaseAdmin
          .from('appointments')
          .select('staff_id')
          .eq('client_id', clientId)
          .eq('groomer_id', groomerId)
          .not('staff_id', 'is', null)
          .order('appointment_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lastAppt && lastAppt.staff_id) {
          regularStaffId = lastAppt.staff_id
          console.log('[BOOK] assigning to regular staff:', regularStaffId)
        } else {
          console.log('[BOOK] no prior staff found, leaving unassigned')
        }

        // ---- Compute Chicago-TZ timestamps for Rule 7 (same-day cutoff) ----
        var chiParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Chicago',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(new Date())
        var chi: any = {}
        for (var cp of chiParts) { if (cp.type !== 'literal') chi[cp.type] = cp.value }
        if (chi.hour === '24') chi.hour = '00'
        var todayStrShop = chi.year + '-' + chi.month + '-' + chi.day
        var currentHourShop = parseInt(chi.hour, 10)
        // Compute hours-until by treating both "now in Chicago" and "booking in Chicago"
        // as naive wall-clock and subtracting — same TZ cancels out.
        var nowChiEpoch = Date.UTC(
          parseInt(chi.year, 10), parseInt(chi.month, 10) - 1, parseInt(chi.day, 10),
          parseInt(chi.hour, 10), parseInt(chi.minute, 10)
        )
        var bDPts = String(toolInput.appointment_date).split('-')
        var bTPts = String(toolInput.start_time).split(':')
        var bookChiEpoch = Date.UTC(
          parseInt(bDPts[0], 10), parseInt(bDPts[1], 10) - 1, parseInt(bDPts[2], 10),
          parseInt(bTPts[0], 10), parseInt(bTPts[1] || '0', 10)
        )
        var hoursUntilShop = (bookChiEpoch - nowChiEpoch) / (1000 * 60 * 60)

        // ---- Count pets on that day for Rule 9 (daily cap) if enabled ----
        var capDayCount = 0
        var capStaffCount = 0
        if (bookingRules.daily_cap && bookingRules.daily_cap.enabled) {
          var { data: dayAppts } = await supabaseAdmin
            .from('appointments')
            .select('id, staff_id')
            .eq('groomer_id', groomerId)
            .eq('appointment_date', toolInput.appointment_date)
            .neq('status', 'cancelled')
          if (dayAppts && dayAppts.length > 0) {
            var allApptIds = dayAppts.map(function (a: any) { return a.id })
            var { data: apptPetRows } = await supabaseAdmin
              .from('appointment_pets')
              .select('appointment_id')
              .in('appointment_id', allApptIds)
            var petsByAppt: any = {}
            for (var ap of (apptPetRows || [])) {
              petsByAppt[ap.appointment_id] = (petsByAppt[ap.appointment_id] || 0) + 1
            }
            for (var da of dayAppts) {
              var petsOnAppt = petsByAppt[da.id] || 1 // fallback: treat legacy single-pet appt as 1
              capDayCount += petsOnAppt
              if (regularStaffId && da.staff_id === regularStaffId) {
                capStaffCount += petsOnAppt
              }
            }
          }
          console.log('[BOOK] cap counts — day:', capDayCount, 'staff:', capStaffCount)
        }

        var ruleCheck = checkBookingAgainstRules({
          breed: petCheck.breed,
          weight: petCheck.weight,
          isFirstTime: isFirstTimeClient,
          vaccinationExpiry: petCheck.vaccination_expiry,
          dogAggressive: petCheck.dog_aggressive,
          appointmentDate: toolInput.appointment_date,
          startTime: toolInput.start_time,
          todayDateStr: todayStrShop,
          currentHour: currentHourShop,
          hoursUntilBooking: hoursUntilShop,
          assignedStaffId: regularStaffId,
          existingCountForDay: capDayCount,
          existingCountForStaff: capStaffCount,
          petsBeingAdded: 1, // client portal books one pet at a time
          rules: bookingRules,
        })

        console.log('[BOOK] rule check result:', JSON.stringify(ruleCheck))

        // Hard block — refuse the booking outright
        if (ruleCheck.action === 'block') {
          return {
            success: false,
            error: ruleCheck.message,
            rule_blocked: true,
            rule_flags: ruleCheck.flags,
          }
        }

        // Compute end time
        var dur = toolInput.duration_minutes || 60
        var parts = toolInput.start_time.split(':')
        var startMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
        var endMin = startMin + dur
        var endHH = String(Math.floor(endMin / 60)).padStart(2, '0')
        var endMM = String(endMin % 60).padStart(2, '0')
        var endTime = endHH + ':' + endMM

        // ================================================================
        // CONFLICT CHECK — prevent double-booking
        // Query existing non-cancelled appointments on the same date and
        // refuse if any overlap the requested time slot (same groomer_id,
        // same or unassigned staff).
        // ================================================================
        var { data: dayApptsForConflict } = await supabaseAdmin
          .from('appointments')
          .select('id, start_time, end_time, staff_id, pets:pet_id(name)')
          .eq('groomer_id', groomerId)
          .eq('appointment_date', toolInput.appointment_date)
          .neq('status', 'cancelled')

        var conflicts: any[] = []
        for (var existing of (dayApptsForConflict || [])) {
          var exStartParts = String(existing.start_time).split(':')
          var exEndParts = String(existing.end_time).split(':')
          var exStartMin = parseInt(exStartParts[0], 10) * 60 + parseInt(exStartParts[1], 10)
          var exEndMin = parseInt(exEndParts[0], 10) * 60 + parseInt(exEndParts[1], 10)
          // Overlap: new starts before existing ends AND new ends after existing starts
          if (startMin < exEndMin && endMin > exStartMin) {
            // Distinct staff assigned → different groomer, no conflict
            if (regularStaffId && existing.staff_id && regularStaffId !== existing.staff_id) {
              continue
            }
            conflicts.push(existing)
          }
        }

        if (conflicts.length > 0) {
          var conflictTimes = conflicts.map(function (c: any) {
            return c.start_time + '-' + c.end_time
          }).join(', ')
          console.log('[BOOK] CONFLICT — refusing. Existing:', conflictTimes)
          return {
            success: false,
            error: 'That time is already booked (' + conflictTimes + '). Please pick another time — call client_check_availability to see open slots.',
            conflict: true,
            conflicting_slots: conflicts.map(function (c: any) {
              return { start: c.start_time, end: c.end_time }
            }),
          }
        }

        // Spam check: count this client's non-recurring appointments in last 30 days
        var thirtyAgo = new Date()
        thirtyAgo.setDate(thirtyAgo.getDate() - 30)
        var thirtyStr = thirtyAgo.toISOString().split('T')[0]
        var { data: recentAppts } = await supabaseAdmin
          .from('appointments')
          .select('id, recurring_series_id, status')
          .eq('client_id', clientId)
          .eq('groomer_id', groomerId)
          .gte('appointment_date', thirtyStr)
          .is('recurring_series_id', null)
          .neq('status', 'cancelled')

        var nonRecurringCount = (recentAppts || []).length
        var isSpamFlagged = nonRecurringCount >= 1

        // Decide: auto-book (clean) vs flag for groomer review (flag_status='pending')
        var shouldAutoBook = toggles.client_auto_book_enabled && !isSpamFlagged

        // (regularStaffId was already looked up earlier, before the rule check)

        // Always 'confirmed' so it shows on the calendar. Flagged bookings get
        // flag_status='pending' so they appear on the Flagged Bookings page for review.
        var apptPayload: any = {
          groomer_id: groomerId,
          client_id: clientId,
          pet_id: toolInput.pet_id,
          appointment_date: toolInput.appointment_date,
          start_time: toolInput.start_time,
          end_time: endTime,
          status: 'confirmed',
          service_notes: toolInput.service_notes || null,
        }
        if (regularStaffId) apptPayload.staff_id = regularStaffId

        // If a rule demands approval, force the booking into pending mode
        if (ruleCheck.action === 'needs_approval') {
          shouldAutoBook = false
        }

        if (!shouldAutoBook) {
          apptPayload.flag_status = 'pending'
          apptPayload.has_flags = true

          // Combine rule flags + spam flag (if any) into flag_details
          var combinedFlags: any[] = []
          if (ruleCheck.flags && ruleCheck.flags.length) {
            for (var rfIdx = 0; rfIdx < ruleCheck.flags.length; rfIdx++) {
              combinedFlags.push(ruleCheck.flags[rfIdx])
            }
          }
          if (isSpamFlagged) {
            combinedFlags.push({
              level: 'warning',
              rule: 'spam_check',
              message: 'Client has ' + nonRecurringCount + ' recent non-recurring bookings in last 30 days',
            })
          }
          if (combinedFlags.length) {
            apptPayload.flag_details = JSON.stringify(combinedFlags)
          }

          var flagNote: string
          if (ruleCheck.flags && ruleCheck.flags.length) {
            var ruleNames: string[] = []
            for (var rnIdx = 0; rnIdx < ruleCheck.flags.length; rnIdx++) {
              ruleNames.push(ruleCheck.flags[rnIdx].rule)
            }
            flagNote = '[Rule check: ' + ruleNames.join(', ') + ']'
          } else if (isSpamFlagged) {
            flagNote = '[AI flagged: client has ' + nonRecurringCount + ' recent non-recurring bookings in last 30 days]'
          } else {
            flagNote = '[AI flagged: auto-book disabled, needs groomer approval]'
          }
          apptPayload.service_notes = (apptPayload.service_notes ? apptPayload.service_notes + ' ' : '') + flagNote
        }
        if (toolInput.service_id) apptPayload.service_id = toolInput.service_id

        console.log('[BOOK] inserting appointment:', JSON.stringify(apptPayload))
        var { data: newAppt, error: createErr } = await supabaseAdmin
          .from('appointments')
          .insert(apptPayload)
          .select('id')
          .single()
        if (createErr) {
          console.error('[BOOK] insert error:', createErr.message, 'details:', JSON.stringify(createErr))
          return { success: false, error: createErr.message }
        }

        // Multi-pet junction row (single pet booking)
        var { error: junctionErr } = await supabaseAdmin
          .from('appointment_pets')
          .insert({
            appointment_id: newAppt.id,
            pet_id: toolInput.pet_id,
            service_id: toolInput.service_id || null,
          })
        if (junctionErr) console.error('[BOOK] junction insert error:', junctionErr.message)

        // ================================================================
        // PUSH NOTIFY GROOMER — Triggers #2 (new booking) + #4 (AI flagged)
        // Fire-and-forget: swallow all errors so push never blocks booking.
        // ================================================================
        try {
          // Look up client first name + service name for a nice preview
          var { data: clientRowForPush } = await supabaseAdmin
            .from('clients')
            .select('first_name, last_name')
            .eq('id', clientId)
            .maybeSingle()
          var clientNameForPush = clientRowForPush
            ? ((clientRowForPush.first_name || '') + (clientRowForPush.last_name ? ' ' + clientRowForPush.last_name : '')).trim()
            : ''
          if (!clientNameForPush) clientNameForPush = 'A client'

          var serviceNameForPush = ''
          if (toolInput.service_id) {
            var { data: svcRowForPush } = await supabaseAdmin
              .from('services')
              .select('service_name')
              .eq('id', toolInput.service_id)
              .maybeSingle()
            serviceNameForPush = (svcRowForPush && svcRowForPush.service_name) || ''
          }

          var petNameForPush = (petCheck && petCheck.name) || 'pet'
          var whenForPush = formatDateForPush(toolInput.appointment_date) + ' @ ' + formatTimeForPush(toolInput.start_time)

          var pushTitle: string
          var pushUrl: string
          var pushTag: string
          if (shouldAutoBook) {
            pushTitle = '🐾 New booking — ' + clientNameForPush
            pushUrl = '/calendar'
            pushTag = 'booking-' + newAppt.id
          } else {
            pushTitle = '⚠️ PetPro AI flagged a booking'
            pushUrl = '/flagged'
            pushTag = 'flagged-' + newAppt.id
          }
          var pushBody = petNameForPush
            + (serviceNameForPush ? ' — ' + serviceNameForPush : '')
            + ' — ' + whenForPush

          await sendPushToUser(groomerId, pushTitle, pushBody, pushUrl, pushTag)
        } catch (pushErr) {
          console.warn('[push] notify groomer of booking failed (non-fatal):', pushErr)
        }

        return {
          success: true,
          appointment_id: newAppt.id,
          auto_booked: shouldAutoBook,
          needs_groomer_review: !shouldAutoBook,
          spam_flagged: isSpamFlagged,
          recent_bookings_count: nonRecurringCount,
          rule_triggered: ruleCheck.action === 'needs_approval',
          rule_hold_message: ruleCheck.action === 'needs_approval' ? ruleCheck.message : '',
          rule_flags: ruleCheck.flags || [],
        }
      }

      // --- RESCHEDULE ---
      case 'client_reschedule_appointment': {
        if (!toggles.client_can_reschedule) {
          return { success: false, error: 'This shop doesn\'t allow rescheduling through chat. Please message the shop directly.' }
        }
        if (!toolInput.appointment_id || !toolInput.new_date || !toolInput.new_start_time) {
          return { success: false, error: 'appointment_id, new_date, new_start_time required' }
        }

        // Verify appointment belongs to this client
        var { data: apptCheck, error: apptErr } = await supabaseAdmin
          .from('appointments')
          .select('id, start_time, end_time, status')
          .eq('id', toolInput.appointment_id)
          .eq('client_id', clientId)
          .eq('groomer_id', groomerId)
          .maybeSingle()
        if (apptErr) console.error('[RESCHED] appt lookup error:', apptErr.message)
        if (!apptCheck) return { success: false, error: 'That appointment isn\'t yours or doesn\'t exist.' }
        if (apptCheck.status === 'cancelled' || apptCheck.status === 'completed') {
          return { success: false, error: 'That appointment is already ' + apptCheck.status + '.' }
        }

        // Compute duration from existing start/end times, then new end
        var oldStartParts = String(apptCheck.start_time).split(':')
        var oldEndParts = String(apptCheck.end_time).split(':')
        var oldStartMin = parseInt(oldStartParts[0], 10) * 60 + parseInt(oldStartParts[1], 10)
        var oldEndMin = parseInt(oldEndParts[0], 10) * 60 + parseInt(oldEndParts[1], 10)
        var rDur = oldEndMin - oldStartMin
        if (rDur <= 0) rDur = 60

        var rParts = toolInput.new_start_time.split(':')
        var rStartMin = parseInt(rParts[0], 10) * 60 + parseInt(rParts[1], 10)
        var rEndMin = rStartMin + rDur
        var rEndHH = String(Math.floor(rEndMin / 60)).padStart(2, '0')
        var rEndMM = String(rEndMin % 60).padStart(2, '0')
        var rEndTime = rEndHH + ':' + rEndMM

        // ================================================================
        // CONFLICT CHECK — prevent reschedule into a busy slot
        // Exclude the appointment BEING RESCHEDULED (it would match itself).
        // ================================================================
        var { data: resDayAppts } = await supabaseAdmin
          .from('appointments')
          .select('id, start_time, end_time, staff_id')
          .eq('groomer_id', groomerId)
          .eq('appointment_date', toolInput.new_date)
          .neq('status', 'cancelled')
          .neq('id', toolInput.appointment_id)

        var resConflicts: any[] = []
        for (var rex of (resDayAppts || [])) {
          var rexSP = String(rex.start_time).split(':')
          var rexEP = String(rex.end_time).split(':')
          var rexSM = parseInt(rexSP[0], 10) * 60 + parseInt(rexSP[1], 10)
          var rexEM = parseInt(rexEP[0], 10) * 60 + parseInt(rexEP[1], 10)
          if (rStartMin < rexEM && rEndMin > rexSM) {
            resConflicts.push(rex)
          }
        }
        if (resConflicts.length > 0) {
          var resConflictTimes = resConflicts.map(function (c: any) {
            return c.start_time + '-' + c.end_time
          }).join(', ')
          console.log('[RESCHED] CONFLICT — refusing. Existing:', resConflictTimes)
          return {
            success: false,
            error: 'That new time is already booked (' + resConflictTimes + '). Please pick a different time — call client_check_availability to see open slots.',
            conflict: true,
            conflicting_slots: resConflicts.map(function (c: any) {
              return { start: c.start_time, end: c.end_time }
            }),
          }
        }

        // If auto-book is off, flag the reschedule for groomer review
        var resUpdate: any = {
          appointment_date: toolInput.new_date,
          start_time: toolInput.new_start_time,
          end_time: rEndTime,
        }
        if (!toggles.client_auto_book_enabled) {
          resUpdate.flag_status = 'pending'
        }

        console.log('[RESCHED] updating appt:', toolInput.appointment_id, JSON.stringify(resUpdate))
        var { error: updErr } = await supabaseAdmin
          .from('appointments')
          .update(resUpdate)
          .eq('id', toolInput.appointment_id)
          .eq('client_id', clientId)
        if (updErr) {
          console.error('[RESCHED] update error:', updErr.message)
          return { success: false, error: updErr.message }
        }

        return {
          success: true,
          appointment_id: toolInput.appointment_id,
          needs_groomer_review: !toggles.client_auto_book_enabled,
        }
      }

      // --- CANCEL ---
      case 'client_cancel_appointment': {
        if (!toggles.client_can_cancel) {
          return { success: false, error: 'This shop doesn\'t allow cancelling through chat. Please message the shop directly.' }
        }
        if (!toolInput.appointment_id) return { success: false, error: 'appointment_id required' }

        // Verify ownership
        var { data: cancelCheck } = await supabaseAdmin
          .from('appointments')
          .select('id, status')
          .eq('id', toolInput.appointment_id)
          .eq('client_id', clientId)
          .eq('groomer_id', groomerId)
          .maybeSingle()
        if (!cancelCheck) return { success: false, error: 'That appointment isn\'t yours or doesn\'t exist.' }
        if (cancelCheck.status === 'cancelled') return { success: false, error: 'Already cancelled.' }

        var { error: cancelErr } = await supabaseAdmin
          .from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', toolInput.appointment_id)
          .eq('client_id', clientId)
        if (cancelErr) return { success: false, error: cancelErr.message }

        return { success: true, appointment_id: toolInput.appointment_id }
      }

      // --- LIST ---
      case 'client_list_my_appointments': {
        var todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
        var { data: mineList } = await supabaseAdmin
          .from('appointments')
          .select('id, appointment_date, start_time, end_time, status, service_notes, pets:pet_id(name), services:service_id(service_name)')
          .eq('client_id', clientId)
          .eq('groomer_id', groomerId)
          .gte('appointment_date', todayStr)
          .neq('status', 'cancelled')
          .order('appointment_date', { ascending: true })
          .order('start_time', { ascending: true })

        return {
          success: true,
          count: (mineList || []).length,
          appointments: (mineList || []).map(function(a){
            return {
              id: a.id,
              date: a.appointment_date,
              time: a.start_time,
              pet: a.pets ? a.pets.name : '?',
              service: a.services ? a.services.service_name : 'Service TBD',
              status: a.status,
              notes: a.service_notes,
            }
          }),
        }
      }

      // --- CHECK AVAILABILITY ---
      case 'client_check_availability': {
        if (!toolInput.date) return { success: false, error: 'date required' }
        var { data: availDayAppts } = await supabaseAdmin
          .from('appointments')
          .select('start_time, end_time, staff_id')
          .eq('groomer_id', groomerId)
          .eq('appointment_date', toolInput.date)
          .neq('status', 'cancelled')
          .order('start_time', { ascending: true })

        // Also pull shop hours if configured
        var { data: shopHoursRow } = await supabaseAdmin
          .from('shop_settings')
          .select('shop_open_time, shop_close_time')
          .eq('groomer_id', groomerId)
          .maybeSingle()
        var openT = (shopHoursRow && shopHoursRow.shop_open_time) || '08:00'
        var closeT = (shopHoursRow && shopHoursRow.shop_close_time) || '17:00'

        var bookedSlots = (availDayAppts || []).map(function (a: any) {
          return { start: a.start_time, end: a.end_time }
        })

        return {
          success: true,
          date: toolInput.date,
          shop_open: openT,
          shop_close: closeT,
          booked_slots: bookedSlots,
          booked_count: bookedSlots.length,
          note: 'These are the time ranges ALREADY BOOKED. Any time that does NOT overlap these is available. Shop hours are ' + openT + ' to ' + closeT + '. Pick a time within shop hours that does not overlap any booked slot.',
        }
      }

      default:
        return { success: false, error: 'Unknown tool: ' + toolName }
    }
  } catch (err) {
    console.error('Tool error (' + toolName + '):', err)
    return { success: false, error: String(err && err.message ? err.message : err) }
  }
}

// ============================================================
// HTTP HANDLER
// ============================================================
Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // --- Auth: get client from token, NEVER trust the body ---
    var authHeader = req.headers.get('Authorization') || ''
    var token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ text: 'Please sign in first.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    var { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !authData || !authData.user) {
      return new Response(JSON.stringify({ text: 'Your session expired — please sign in again.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    var authUser = authData.user

    // Look up the client record for this auth user
    var { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('id, groomer_id, first_name, last_name, phone')
      .eq('user_id', authUser.id)
      .maybeSingle()
    if (!clientRow) {
      return new Response(JSON.stringify({ text: 'No client profile found on your account. Please contact your shop.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    var clientId = clientRow.id
    var groomerId = clientRow.groomer_id
    var body = await req.json()

    // --- Waitlist YES/NO intercept (Task #84 Step 5) ---
    // If the client has a pending waitlist offer, handle the reply
    // directly instead of running full chat. Unclear replies fall
    // through to normal chat.
    var waitlistResult = await handleWaitlistResponse(clientId, groomerId, body.message || '')
    if (waitlistResult) {
      return new Response(JSON.stringify({ text: waitlistResult.text }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Pull groomer's toggles ---
    var { data: personalizationRow } = await supabaseAdmin
      .from('ai_personalization')
      .select('client_claude_enabled, client_auto_book_enabled, client_can_reschedule, client_can_cancel, shop_name, tone, emoji_level, custom_instructions')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    var toggles = {
      client_claude_enabled: personalizationRow ? (personalizationRow.client_claude_enabled !== false) : true,
      client_auto_book_enabled: personalizationRow ? (personalizationRow.client_auto_book_enabled !== false) : true,
      client_can_reschedule: personalizationRow ? (personalizationRow.client_can_reschedule !== false) : true,
      client_can_cancel: personalizationRow ? (personalizationRow.client_can_cancel !== false) : true,
    }

    // Master kill switch: if groomer turned off client Claude, return canned response
    if (!toggles.client_claude_enabled) {
      return new Response(JSON.stringify({
        text: 'Hi! Booking through chat isn\'t set up for this shop. Please use the Messages tab to contact the shop directly. 🐾'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Returning-client gate: must have at least 1 past or current appointment ---
    var { data: historyCheck } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('client_id', clientId)
      .eq('groomer_id', groomerId)
      .limit(1)
    var isReturning = historyCheck && historyCheck.length > 0
    if (!isReturning) {
      return new Response(JSON.stringify({
        text: 'Welcome to the shop! Since this is your first appointment, please use the Messages tab to book directly with the groomer. Once you\'ve been in, I\'ll be able to handle future bookings for you here. 🐾'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Preload context ---
    var { data: myPets } = await supabaseAdmin
      .from('pets')
      .select('id, name, breed, weight, allergies, medications, vaccination_expiry, dog_aggressive')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })

    var todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    var todayLabel = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Build an explicit 14-day date map so Claude can't drift on day/date mapping.
    // Each row = weekday name + M/D/YYYY + YYYY-MM-DD.
    var dateMapRows: string[] = []
    for (var i = 0; i < 14; i++) {
      var d = new Date()
      d.setUTCDate(d.getUTCDate() + i)
      // Get the Chicago-TZ components for this date
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
      }).formatToParts(d)
      var obj: any = {}
      for (var p of parts) { if (p.type !== 'literal') obj[p.type] = p.value }
      var iso = obj.year + '-' + obj.month + '-' + obj.day
      var pretty = obj.weekday + ', ' + obj.month + '/' + obj.day + '/' + obj.year + ' (' + iso + ')'
      var tag = ''
      if (i === 0) tag = ' ← TODAY'
      else if (i === 1) tag = ' ← TOMORROW'
      dateMapRows.push(pretty + tag)
    }

    var { data: myUpcoming } = await supabaseAdmin
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, service_notes, checked_out_at, pets:pet_id(name), services:service_id(service_name, price)')
      .eq('client_id', clientId)
      .eq('groomer_id', groomerId)
      .gte('appointment_date', todayStr)
      .neq('status', 'cancelled')
      .is('checked_out_at', null)
      .order('appointment_date', { ascending: true })

    var { data: servicesList } = await supabaseAdmin
      .from('services')
      .select('id, service_name, price, price_type, price_max, weight_min, weight_max, time_block_minutes')
      .eq('groomer_id', groomerId)
      .eq('is_active', true)

    var { data: shopInfo } = await supabaseAdmin
      .from('shop_settings')
      .select('shop_name, hours, phone, booking_rules')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    // Business hours for suggesting times
    var { data: shopHours } = await supabaseAdmin
      .from('shop_settings')
      .select('business_hours_start, business_hours_end')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    // ===========================================================
    // PRE-CHECK: Evaluate each pet against booking rules BEFORE
    // chat starts, so Claude can refuse blocked pets immediately
    // instead of walking the client through booking first.
    // ===========================================================
    var bookingRulesCtx = (shopInfo && shopInfo.booking_rules) || {}

    var isFirstTimeClientCtx = false
    if (bookingRulesCtx.first_time_approval && bookingRulesCtx.first_time_approval.enabled) {
      var { data: anyPriorAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('client_id', clientId)
        .eq('groomer_id', groomerId)
        .neq('status', 'cancelled')
        .limit(1)
      isFirstTimeClientCtx = !anyPriorAppts || anyPriorAppts.length === 0
    }

    // --- Build system prompt ---
    var shopName = (shopInfo && shopInfo.shop_name) || (personalizationRow && personalizationRow.shop_name) || 'the shop'
    var tone = (personalizationRow && personalizationRow.tone) || 'friendly'
    var emojiLevel = (personalizationRow && personalizationRow.emoji_level) || 'sometimes'
    var customInstructions = (personalizationRow && personalizationRow.custom_instructions) || ''

    var toneText =
      tone === 'professional' ? 'Professional but warm — polite, full sentences.' :
      tone === 'casual'       ? 'Casual and chill — contractions, relaxed.' :
                                'Friendly and warm.'
    var emojiLevelText =
      emojiLevel === 'never' ? 'NEVER use emojis.' :
      emojiLevel === 'often' ? 'Use emojis generously (🐾 ✂️ 🐕).' :
                               'Use emojis sparingly — maybe one pet emoji every other message.'

    var contextParts: string[] = []
    contextParts.push('CLIENT: ' + clientRow.first_name + ' ' + clientRow.last_name)
    contextParts.push('SHOP: ' + shopName)
    contextParts.push('TODAY: ' + todayLabel + ' (date: ' + todayStr + ', Central Time)')
    contextParts.push('')
    contextParts.push('=== DATE REFERENCE (USE THIS EXACTLY — DO NOT GUESS DATES) ===')
    contextParts.push('The shop is on Central Time. The list below is the ONLY source of truth for what date each weekday is.')
    for (var dr of dateMapRows) {
      contextParts.push('  ' + dr)
    }
    contextParts.push('RULES:')
    contextParts.push('  - When the client says "tomorrow," use the TOMORROW row above. Do NOT use any other date.')
    contextParts.push('  - When the client says a weekday like "Monday" or "Saturday," find that weekday in the list above and use THAT exact date (M/D/YYYY).')
    contextParts.push('  - If the chat history shows you previously used a different date, IGNORE THAT. The list above is always current and always right.')
    contextParts.push('  - Never invent or calculate dates yourself — only use dates that appear in the list above.')
    contextParts.push('')

    contextParts.push('=== MY PETS (only these IDs are valid for booking) ===')
    if (myPets && myPets.length > 0) {
      for (var p of myPets) {
        var pl = p.id + ' | ' + p.name + (p.breed ? ' (' + p.breed + ')' : '')
        if (p.allergies) pl += ' | allergies: ' + p.allergies
        if (p.medications) pl += ' | meds: ' + p.medications

        // Run this pet through the shop's booking rules for pre-screening
        var petEligibility = checkBookingAgainstRules({
          breed: p.breed,
          weight: p.weight,
          isFirstTime: isFirstTimeClientCtx,
          vaccinationExpiry: p.vaccination_expiry,
          dogAggressive: p.dog_aggressive,
          rules: bookingRulesCtx,
        })
        if (petEligibility.action === 'block') {
          pl += ' | ⛔ BLOCKED — Shop message: "' + petEligibility.message + '"'
        } else if (petEligibility.action === 'needs_approval') {
          pl += ' | ⚠ NEEDS APPROVAL (booking will auto-route to groomer)'
        }

        contextParts.push(pl)
      }
    } else {
      contextParts.push('No pets on file yet. Tell the client to add a pet in the portal first.')
    }
    contextParts.push('')

    contextParts.push('=== MY UPCOMING APPOINTMENTS ===')
    if (myUpcoming && myUpcoming.length > 0) {
      for (var ua of myUpcoming) {
        var ual = 'ID:' + ua.id + ' | ' + ua.appointment_date + ' ' + ua.start_time
        ual += ' | ' + (ua.pets ? ua.pets.name : '?')
        ual += ' | ' + (ua.services ? ua.services.service_name : 'TBD')
        ual += ' | ' + ua.status
        contextParts.push(ual)
      }
    } else {
      contextParts.push('No upcoming appointments.')
    }
    contextParts.push('')

    contextParts.push('=== SERVICES OFFERED ===')
    if (servicesList && servicesList.length > 0) {
      for (var s of servicesList) {
        var priceStr = ''
        var ptype = s.price_type || 'fixed'
        if (ptype === 'range' && s.price != null && s.price_max != null) {
          var wMin = s.weight_min != null ? s.weight_min : '?'
          var wMax = s.weight_max != null ? s.weight_max : '?'
          priceStr = 'RANGE $' + s.price + '-$' + s.price_max + ' (for weights ' + wMin + '-' + wMax + ' lbs, linear scale)'
        } else if (ptype === 'starting_at' && s.price != null) {
          priceStr = 'STARTING_AT $' + s.price
        } else {
          priceStr = 'FIXED $' + (s.price != null ? s.price : '?')
        }
        contextParts.push(s.id + ' | ' + s.service_name + ' | ' + priceStr + ' | ' + (s.time_block_minutes || 60) + ' min')
      }
    } else {
      contextParts.push('No services listed.')
    }
    contextParts.push('')

    contextParts.push('=== SHOP HOURS ===')
    if (shopHours && shopHours.business_hours_start) {
      contextParts.push('Open ' + shopHours.business_hours_start + ' - ' + shopHours.business_hours_end)
    } else {
      contextParts.push('Hours not set. Assume 9 AM - 5 PM.')
    }
    contextParts.push('')

    contextParts.push('=== FEATURE TOGGLES (what you can/can\'t do) ===')
    contextParts.push('Reschedule allowed: ' + toggles.client_can_reschedule)
    contextParts.push('Cancel allowed: ' + toggles.client_can_cancel)
    contextParts.push('Auto-book: ' + toggles.client_auto_book_enabled + ' (if false, bookings go to pending/approval)')

    var systemPrompt = [
      'You are PetPro AI — a helpful booking assistant for ' + shopName + '. You are talking to ' + clientRow.first_name + ' ' + clientRow.last_name + ', one of the shop\'s clients.',
      '',
      'YOUR JOB:',
      '- Help THIS client book, reschedule, or cancel their OWN grooming appointments.',
      '- Nothing else. You are NOT a general assistant or info line.',
      '',
      'TONE (SOUND HUMAN, NOT ROBOTIC — THIS MATTERS):',
      '- ' + toneText,
      '- ' + emojiLevelText,
      '- Short, warm messages. 2-3 sentences typically.',
      '- Talk like a friendly person at the front desk — NOT like an AI. Use casual contractions (I\'m, you\'re, let\'s, that\'s), natural phrasing, and a little warmth. It\'s okay to laugh ("haha", "lol") when the client is joking. It\'s okay to be playful with pet names ("aww Bella is such a sweetheart!").',
      '- Mirror the client\'s vibe. If they\'re chill and casual, be chill. If they\'re formal, be polite but still warm.',
      '- NEVER say robotic phrases like "I understand your request," "I am an AI assistant," "Processing your request," "How may I assist you today?", "I\'d be happy to assist," or anything that sounds corporate. Kill those phrases.',
      '- Instead, sound like a real human: "Oh yeah, totally can help with that!", "Aww Bella is due for some pampering 🐾", "Got it — let me check what times are open", "Haha no worries, happens all the time!"',
      '- Compliments on pets are welcome and natural: "Aww a Shih Tzu, those fluff balls are adorable!" "A doodle? So cute!" — makes the client feel seen.',
      '- Light humor is welcome when appropriate. If the client cracks a joke, laugh with them ("haha"). Don\'t force it, just don\'t be stiff.',
      '- If the client apologizes or hesitates ("sorry, I don\'t know how this works"), reassure them like a friend: "No worries at all! Walk me through what you\'re thinking and I\'ll help you figure it out."',
      '- BAD (robotic): "I have successfully booked your appointment. Is there anything else I can assist you with?"',
      '- GOOD (human): "All set! Bella\'s booked Saturday at 10 AM 🐾 anything else you need?"',
      '',
      'PRE-BOOK SCREENING (READ THIS FIRST — applies to your VERY FIRST reply):',
      '- Look at MY PETS carefully. Some pets may have a ⛔ BLOCKED tag with a "Shop message" in quotes.',
      '- If the client mentions booking / scheduling / availability / an appointment for a pet tagged ⛔ BLOCKED — IMMEDIATELY deliver the shop\'s message (the text in quotes after "Shop message:") VERBATIM. Do NOT say "I\'d be happy to help you book!" Do NOT ask what service, date, or time. Do NOT offer alternatives for the blocked pet. Do NOT apologize repeatedly. Just deliver the exact shop message.',
      '- If the client has OTHER pets that are NOT blocked, you may gently offer to help with those instead AFTER delivering the block message.',
      '- If a pet is tagged ⚠ NEEDS APPROVAL — proceed with booking normally. The booking tool will route the booking to the groomer for approval. Never tell the client WHY approval is needed.',
      '',
      'HARD RULES:',
      '- You can ONLY use these tools: client_book_appointment, client_reschedule_appointment, client_cancel_appointment, client_list_my_appointments.',
      '- You can ONLY book pets that appear in MY PETS. Never make up a pet_id.',
      '- You can ONLY reschedule/cancel appointments that appear in MY UPCOMING APPOINTMENTS. Never make up an appointment_id.',
      '- If the client asks about other clients, staff, pricing policies, shop revenue, or anything beyond booking their OWN pets, politely say: "That\'s a question for the shop — try the Messages tab to reach them directly!"',
      '- If they ask you to do something the toggles don\'t allow (e.g., reschedule when client_can_reschedule is false), tell them the tool is turned off and to use Messages.',
      '- NEVER quote prices outside what\'s in SERVICES OFFERED.',
      '- NEVER share phone numbers, addresses, or personal info about other clients or staff.',
      '- NEVER call client_book_appointment without a service_id. If the client hasn\'t specified a service yet, ASK first.',
      '',
      'PRICING & QUOTING (CRITICAL — READ CAREFULLY):',
      '- Each service in SERVICES OFFERED is tagged as FIXED, RANGE, or STARTING_AT. Quote based on that tag.',
      '- FIXED $X → quote the exact price: "Face/Feet/Trim is $45."',
      '- RANGE $A-$B (for weights W_min-W_max lbs) → the price scales linearly with the pet\'s weight. You MUST give a weight-scaled estimate, not just the bottom of the range.',
      '  • Formula: estimate = A + (B - A) * (pet_weight - W_min) / (W_max - W_min)',
      '  • Clamp: if pet_weight <= W_min, estimate = A. If pet_weight >= W_max, estimate = B.',
      '  • Round to the nearest whole dollar.',
      '  • Phrasing: "Face/Feet/Trim for Lilly (65 lbs) is estimated around $58 — the groomer will confirm the exact quote."',
      '  • If the pet\'s weight is NOT in MY PETS, ask the client for the pet\'s weight BEFORE quoting. Do NOT quote the low end as the answer.',
      '- STARTING_AT $X → "starts at $X — final price depends on size, coat, and condition. The groomer will give you an exact quote."',
      '- NEVER quote only the low end of a range as if it were the price. This is the most important rule in this section.',
      '- If a service has no price listed at all, say "the shop will confirm the exact price."',
      '- Always include the disclaimer "the groomer will confirm the exact quote" on any RANGE or STARTING_AT quote.',
      '',
      'AVAILABILITY CHECKING (CRITICAL — PREVENT DOUBLE BOOKINGS):',
      '- You DO NOT automatically see the shop\'s schedule. To see what times are already booked on a given day, you MUST call the `client_check_availability` tool.',
      '- ALWAYS call `client_check_availability` BEFORE you suggest a specific time OR call `client_book_appointment`. No exceptions.',
      '- The tool returns `booked_slots` (times already taken) and `shop_open` / `shop_close` (shop hours). Pick a time within shop hours that does NOT overlap ANY booked slot.',
      '- If the client asks for a specific time (e.g., "9 AM tomorrow"), call `client_check_availability` first. If 9 AM overlaps a booked slot, tell them honestly: "9 AM is already booked — I have [list 2-3 actual open times] if any of those work?"',
      '- If `client_book_appointment` returns `conflict: true`, the slot just got taken. Apologize briefly, call `client_check_availability` again, and offer a real open time.',
      '- NEVER tell a client "the shop will let you know if there\'s a conflict" — that is WRONG. The system will NOT catch it later; you must prevent the conflict NOW by using the availability tool.',
      '- NEVER say "I can\'t see the current schedule" — you CAN see it by calling `client_check_availability`. Always use the tool.',
      '',
      'SERVICE QUESTIONS (CRITICAL — ASK BEFORE BOOKING):',
      '- The word "grooming" or "appointment" is vague. Different dogs need different services. ALWAYS ask which service they want before booking.',
      '- If the client says "book a groom" or similar without a service, ask something like: "Happy to help! For [pet name], would you like a full body haircut, a face-and-feet trim with a bath, or just a bath and nails?"',
      '- Pay attention to breed to guide the question:',
      '  • Poodles, Shih Tzus, Doodles, Yorkies, Maltese, Bichons, Cocker Spaniels, Schnauzers — usually want a full haircut OR face/feet trim + bath.',
      '  • Labs, Chihuahuas, Pit Bulls, Beagles, Boxers, Huskies, Shepherds — usually just a bath with nails. Haircuts don\'t really apply.',
      '  • Double-coated breeds (Huskies, Golden Retrievers, German Shepherds) — NEVER suggest a "shave" — offer bath + de-shed instead.',
      '- Match the service they describe to one of the services in SERVICES OFFERED. Use the service_id from that list.',
      '- If they say "the usual" or "same as last time" and their pet has past appointments, you can offer to rebook the same service — but still confirm out loud before booking.',
      '',
      'BOOKING RULES:',
      '- Always confirm: which pet, what service (must be chosen from SERVICES OFFERED), what date, what time — BEFORE calling the tool.',
      '- Default duration: 60 minutes unless the service\'s time_block_minutes says otherwise.',
      '- If auto-book is OFF or the client has been booking a lot recently, the system will auto-flag the booking for groomer approval. Let them know: "Booked! The shop will confirm this shortly." (Do NOT tell them WHY it\'s pending — just that the shop will confirm.)',
      '- After a successful booking, confirm with: pet name, date in a friendly format ("Saturday, April 26"), time in 12-hour format ("10 AM"), service if known.',
      '- If the booking tool returns auto_booked: false, say "The shop will confirm shortly" instead of "You\'re booked!"',
      '',
      'SHOP-RULE ENFORCEMENT (CRITICAL):',
      '- If the booking tool returns success: false AND rule_blocked: true — the shop has a hard rule against this booking (breed/etc). You MUST relay the tool\'s `error` field to the client VERBATIM, word-for-word. Do NOT soften it, do NOT suggest workarounds, do NOT offer another time or pet. Do NOT apologize at length. Just deliver the shop\'s exact message, then stop. Do not call the booking tool again for this pet.',
      '- If the booking tool returns success: true AND rule_triggered: true — the booking was placed but the shop has a rule requiring groomer approval. Relay the tool\'s `rule_hold_message` field to the client VERBATIM. Do NOT say "you\'re booked" or "confirmed". Do NOT reveal which rule fired or why.',
      '- These shop rules are non-negotiable. No means no. Never try to re-book the same pet by changing date/time if a breed or weight rule triggered a block — the rule is about the dog, not the schedule.',
      '',
      'RESCHEDULE RULES:',
      '- Only reschedule appointments from MY UPCOMING APPOINTMENTS. Look up the appointment_id from there.',
      '- Confirm the change in 12-hour format before calling the tool.',
      '- Same auto-book toggle applies — if it\'s off, the reschedule goes to pending.',
      '',
      'CANCEL RULES:',
      '- Always confirm: "Cancel your Saturday 10 AM for Bella?" before calling the tool.',
      '- Acknowledge the cancellation and say "Hope we\'ll see you soon!"',
      '',
      'EDGE CASES:',
      '- If they ask about a pet NOT in MY PETS, say "I don\'t see that pet on your profile — add them in the portal and I can help book."',
      '- If they ask to book for someone else, say "I can only book for your own pets."',
      '',
      'APP NAVIGATION HELP (IMPORTANT — be friendly, not dismissive):',
      '- If the client asks where something is in the PetPro portal or how to use the app, HELP them. Do NOT redirect or repeat "welcome." Plain language only.',
      '- Here\'s the portal layout so you can point them to the right place:',
      '  • "Messages" — tab in the portal to text the shop directly. Use this for questions only the groomer can answer.',
      '  • "My Pets" — where they add/edit pets, upload vaccination info, set allergies or meds.',
      '  • "My Appointments" — list of upcoming bookings; they can ask me (the AI) to reschedule or cancel here too.',
      '  • "Book" / chat with me — to schedule a new grooming appointment.',
      '  • "Profile" / account settings — update their name, phone, email, password.',
      '- Examples of good answers:',
      '  • User: "where are the messages?" → "The Messages tab is in the main menu — tap it to send a note directly to the shop. Want me to help with anything booking-related while you\'re here?"',
      '  • User: "how do I add a pet?" → "Go to My Pets and tap + Add Pet — you can upload their info there. Once they\'re added I can help book for them."',
      '  • User: "I can\'t find my appointments" → "Tap My Appointments in the menu — all your upcoming bookings live there. Want me to list them for you now?"',
      '- If they ask about things OUTSIDE the PetPro app (general tech help, life advice, weather, random chat), politely say: "I\'m the shop\'s booking helper — I can help with appointments and the PetPro app. For anything else, try Messages to reach the shop directly."',
      '',
      customInstructions && customInstructions.trim().length > 0
        ? 'SHOP\'S CUSTOM INSTRUCTIONS (follow these if they apply to booking, ignore if not):\n' + customInstructions
        : '',
      '',
      'CURRENT DATA:',
      contextParts.join('\n'),
    ].filter(function(s){ return s !== '' }).join('\n')

    // --- Build messages ---
    var messages: any[] = []
    if (body.history && Array.isArray(body.history) && body.history.length > 0) {
      for (var h of body.history) {
        messages.push({ role: 'user', content: h.user })
        messages.push({ role: 'assistant', content: h.assistant })
      }
    }

    // Support image attachments — if body.images is an array of { media_type, data (base64) },
    // send them as a mixed content array alongside the text message.
    if (body.images && Array.isArray(body.images) && body.images.length > 0) {
      var userContent = []
      for (var img of body.images) {
        if (img && img.data && img.media_type) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.media_type,
              data: img.data,
            },
          })
        }
      }
      userContent.push({ type: 'text', text: body.message || 'Please look at this image.' })
      messages.push({ role: 'user', content: userContent })
    } else {
      messages.push({ role: 'user', content: body.message || '' })
    }

    // --- Tool loop ---
    var maxLoops = 6
    var finalText = ''
    var toolCtx = { clientId: clientId, groomerId: groomerId, toggles: toggles }

    for (var loop = 0; loop < maxLoops; loop++) {
      var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
          system: systemPrompt,
          messages: messages,
          tools: toolDefinitions,
        }),
      })

      if (!claudeResp.ok) {
        var errText = await claudeResp.text()
        console.error('Claude error:', errText)
        return new Response(JSON.stringify({ text: 'Something went wrong on my end. Try again in a sec!' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      var claudeData = await claudeResp.json()

      if (claudeData.stop_reason === 'tool_use') {
        var toolUseBlocks: any[] = []
        for (var block of claudeData.content) {
          if (block.type === 'tool_use') toolUseBlocks.push(block)
        }
        messages.push({ role: 'assistant', content: claudeData.content })

        var toolResults: any[] = []
        for (var tub of toolUseBlocks) {
          var result = await executeTool(tub.name, tub.input, toolCtx)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tub.id,
            content: JSON.stringify(result),
          })
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // Final response
      for (var block2 of claudeData.content) {
        if (block2.type === 'text') finalText += block2.text
      }
      break
    }

    if (!finalText) finalText = 'Sorry, I got stuck — try rephrasing that?'

    return new Response(JSON.stringify({ text: finalText }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Handler error:', err)
    return new Response(JSON.stringify({ text: 'Something went wrong — try again in a moment.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
