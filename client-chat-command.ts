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
        service_id: { type: 'string', description: 'Optional — which service. If omitted, leaves service unset for groomer to fill.' },
        duration_minutes: { type: 'number', description: 'Default 60.' },
        service_notes: { type: 'string', description: 'Any special requests for the groomer.' },
      },
      required: ['pet_id', 'appointment_date', 'start_time'],
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
    var { data: myUpcoming } = await supabaseAdmin
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, service_notes, pets:pet_id(name), services:service_id(service_name, price)')
      .eq('client_id', clientId)
      .eq('groomer_id', groomerId)
      .gte('appointment_date', todayStr)
      .neq('status', 'cancelled')
      .order('appointment_date', { ascending: true })

    var { data: servicesList } = await supabaseAdmin
      .from('services')
      .select('id, service_name, price, time_block_minutes')
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
        contextParts.push(s.id + ' | ' + s.service_name + ' | $' + (s.price || '?') + ' | ' + (s.time_block_minutes || 60) + ' min')
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
      'TONE:',
      '- ' + toneText,
      '- ' + emojiLevelText,
      '- Short, warm messages. 2-3 sentences typically.',
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
      '- NEVER quote prices outside what\'s in SERVICES OFFERED. If the exact price isn\'t listed, say "the shop will confirm the exact price".',
      '- NEVER share phone numbers, addresses, or personal info about other clients or staff.',
      '- If you\'re uncertain about a service or price, skip service_id and let the groomer fill it in after.',
      '',
      'BOOKING RULES:',
      '- Always confirm: which pet, what service, what date, what time — BEFORE calling the tool.',
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
      '- If they just want to chat or ask general questions, politely redirect: "I\'m here to help with booking — anything on the schedule you need to change?"',
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
    messages.push({ role: 'user', content: body.message || '' })

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
          model: 'claude-sonnet-4-20250514',
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
