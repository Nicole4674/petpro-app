// =======================================================
// PetPro — Booking Rule Checker
// Pure JS helper. No imports, no React. Safe to copy/paste
// into Supabase edge functions as well.
//
// Reads rules saved from the AI Booking Rules page and
// decides: allow, block, or needs_approval.
//
// Usage:
//   var result = checkBookingAgainstRules({
//     breed: pet.breed,
//     weight: pet.weight,
//     isFirstTime: true,
//     rules: shopSettings.booking_rules
//   })
//
//   result = {
//     action: 'allow' | 'block' | 'needs_approval',
//     message: string,     // what to show/say the client
//     flags: [             // goes into appointments.flag_details
//       { level, message, rule }
//     ]
//   }
// =======================================================

// ---------- Default messages (used when groomer leaves custom blank) ----------
var DEFAULT_MESSAGES = {
  weight:
    "Thanks for reaching out! I'll need to run this by the groomer first — she'll text you within 24 hours to confirm.",
  breed_block:
    "Unfortunately we don't currently service this breed. Please call the shop if you have any questions.",
  breed_approval:
    "Thanks for booking! I'll run this by the groomer and she'll text you within 24 hours to confirm.",
  first_time:
    "Welcome! Since you're new to us, the groomer will review your booking and text you within 24 hours to confirm your appointment.",
  vax:
    "Quick note — I'll need to double-check vaccination records with the groomer before confirming. She'll text you within 24 hours.",
  aggression_block:
    "Unfortunately we're not able to take dogs with aggression concerns. Please call the shop if you'd like to discuss.",
  aggression_approval:
    "Thanks for booking! I'll check with the groomer since there's some handling notes on file — she'll text you shortly.",
  cutoff_block:
    "Sorry — we're not taking any more bookings for today. Please try tomorrow or later in the week!",
  cutoff_approval:
    "Got it! Since this is short notice, I'll run it by the groomer and she'll text you shortly to confirm.",
  daily_cap:
    "Sorry — we're fully booked that day! Would another day work?",
  generic_hold:
    "Got it — I'll check with the groomer and she'll text you shortly to confirm.",
}

// ---------- Helper: case-insensitive breed match ----------
function matchesBreed(petBreed, blockedList) {
  if (!petBreed) return false
  if (!blockedList || !blockedList.length) return false
  var needle = String(petBreed).trim().toLowerCase()
  for (var i = 0; i < blockedList.length; i++) {
    var hay = String(blockedList[i]).trim().toLowerCase()
    if (!hay) continue
    // Match if pet's breed contains the blocked word OR vice versa.
    // e.g. "Chow Chow" should match rule "Chow"
    if (needle === hay) return true
    if (needle.indexOf(hay) !== -1) return true
    if (hay.indexOf(needle) !== -1) return true
  }
  return false
}

// ---------- Main function ----------
export function checkBookingAgainstRules(opts) {
  opts = opts || {}
  var breed = opts.breed || ''
  var weight = opts.weight ? Number(opts.weight) : null
  var isFirstTime = !!opts.isFirstTime
  var vaccinationExpiry = opts.vaccinationExpiry || null // ISO date string or null
  var dogAggressive = !!opts.dogAggressive
  var rules = opts.rules || {}

  var flags = []
  var action = 'allow'
  var messages = []

  // ----- RULE 1: Weight limit (approval only) -----
  var wl = rules.weight_limit
  if (wl && wl.enabled && weight && weight > (wl.max_lbs || 100)) {
    flags.push({
      level: 'warning',
      rule: 'weight_limit',
      message:
        'Over weight limit: ' + weight + ' lbs (max ' + (wl.max_lbs || 100) + ' lbs)',
    })
    if (action === 'allow') action = 'needs_approval'
    messages.push(wl.decline_message || DEFAULT_MESSAGES.weight)
  }

  // ----- RULE 2: Breed blocks -----
  var bb = rules.breed_blocks
  if (bb && bb.enabled && matchesBreed(breed, bb.breeds)) {
    if (bb.mode === 'block') {
      flags.push({
        level: 'danger',
        rule: 'breed_block',
        message: 'Breed "' + breed + '" is on the blocked list',
      })
      action = 'block' // block always wins
      // When blocking, the breed-block message takes priority
      return {
        action: 'block',
        message: bb.decline_message || DEFAULT_MESSAGES.breed_block,
        flags: flags,
      }
    } else {
      // approval mode
      flags.push({
        level: 'warning',
        rule: 'breed_approval',
        message: 'Breed "' + breed + '" needs groomer approval',
      })
      if (action === 'allow') action = 'needs_approval'
      messages.push(bb.decline_message || DEFAULT_MESSAGES.breed_approval)
    }
  }

  // ----- RULE 3: First-time client approval -----
  var ft = rules.first_time_approval
  if (ft && ft.enabled && isFirstTime) {
    flags.push({
      level: 'info',
      rule: 'first_time_approval',
      message: 'First-time client — needs groomer approval',
    })
    if (action === 'allow') action = 'needs_approval'
    messages.push(ft.decline_message || DEFAULT_MESSAGES.first_time)
  }

  // ----- RULE 4: Vaccinations required (approval only) -----
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
        message: vaxMissing
          ? 'No vaccination expiry on file'
          : 'Vaccinations expired (' + vaccinationExpiry + ')',
      })
      if (action === 'allow') action = 'needs_approval'
      messages.push(vax.decline_message || DEFAULT_MESSAGES.vax)
    }
  }

  // ----- RULE 6: Aggression flag -----
  var agg = rules.aggression_flag
  if (agg && agg.enabled && dogAggressive) {
    if (agg.mode === 'block') {
      flags.push({
        level: 'danger',
        rule: 'aggression_block',
        message: 'Pet is flagged dog-aggressive',
      })
      return {
        action: 'block',
        message: agg.decline_message || DEFAULT_MESSAGES.aggression_block,
        flags: flags,
      }
    } else {
      flags.push({
        level: 'warning',
        rule: 'aggression_approval',
        message: 'Pet is flagged dog-aggressive — needs groomer approval',
      })
      if (action === 'allow') action = 'needs_approval'
      messages.push(agg.decline_message || DEFAULT_MESSAGES.aggression_approval)
    }
  }

  // ----- RULE 7: Same-day cutoff -----
  // Two checks: (A) same-day after cutoff hour, (B) less than minimum lead time
  var cf = rules.same_day_cutoff
  if (cf && cf.enabled && opts.appointmentDate && opts.startTime) {
    // Today's date string in caller's chosen timezone.
    // Caller can pass todayDateStr; otherwise we fall back to local Date().
    var tdStr = opts.todayDateStr
    if (!tdStr) {
      var _t = new Date()
      var _y = _t.getFullYear()
      var _m = String(_t.getMonth() + 1).padStart(2, '0')
      var _d = String(_t.getDate()).padStart(2, '0')
      tdStr = _y + '-' + _m + '-' + _d
    }

    // Current hour (0-23) in shop timezone. Caller can pass currentHour.
    var curHour = (typeof opts.currentHour === 'number')
      ? opts.currentHour
      : new Date().getHours()

    // Hours until the booking. Caller can pass hoursUntilBooking.
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

    // Check A: same-day after cutoff hour
    var ch = cf.cutoff_hour
    if (ch && ch > 0 && opts.appointmentDate === tdStr && curHour >= ch) {
      cfTripped = true
      cfReason = 'Same-day cutoff: it is already past ' + ch + ':00'
    }

    // Check B: lead-time too short
    var lh = cf.lead_hours
    if (lh && lh > 0 && hoursUntil < lh) {
      cfTripped = true
      if (!cfReason) {
        cfReason = 'Less than ' + lh + ' hours of lead time (' +
          (Math.round(hoursUntil * 10) / 10) + ' hrs ahead)'
      }
    }

    if (cfTripped) {
      if (cf.mode === 'block') {
        flags.push({
          level: 'danger',
          rule: 'same_day_cutoff',
          message: cfReason,
        })
        return {
          action: 'block',
          message: cf.decline_message || DEFAULT_MESSAGES.cutoff_block,
          flags: flags,
        }
      } else {
        flags.push({
          level: 'warning',
          rule: 'same_day_cutoff',
          message: cfReason + ' — needs approval',
        })
        if (action === 'allow') action = 'needs_approval'
        messages.push(cf.decline_message || DEFAULT_MESSAGES.cutoff_approval)
      }
    }
  }

  // ----- RULE 9: Daily pet cap (block only) -----
  // Caller must pre-count existing pets for that date (shop-wide) and for
  // the assigned staff (if known). Multi-pet bookings pass petsBeingAdded > 1.
  var dc = rules.daily_cap
  if (dc && dc.enabled) {
    var petsAdding = Number(opts.petsBeingAdded || 1)
    if (petsAdding < 1) petsAdding = 1
    var dayCount = Number(opts.existingCountForDay || 0)
    var staffCount = Number(opts.existingCountForStaff || 0)

    var capTripped = false
    var capReason = ''

    // Shop-wide cap
    var swMax = Number(dc.shop_wide_max || 0)
    if (swMax > 0 && dayCount + petsAdding > swMax) {
      capTripped = true
      capReason = 'Shop-wide daily cap (' + swMax + ') exceeded: ' +
        dayCount + ' booked + ' + petsAdding + ' requested > ' + swMax
    }

    // Per-staff cap
    if (!capTripped && opts.assignedStaffId && dc.staff_caps) {
      var sCap = Number(dc.staff_caps[opts.assignedStaffId] || 0)
      if (sCap > 0 && staffCount + petsAdding > sCap) {
        capTripped = true
        capReason = 'Staff daily cap (' + sCap + ') exceeded: ' +
          staffCount + ' booked + ' + petsAdding + ' requested > ' + sCap
      }
    }

    if (capTripped) {
      flags.push({
        level: 'danger',
        rule: 'daily_cap',
        message: capReason,
      })
      return {
        action: 'block',
        message: dc.decline_message || DEFAULT_MESSAGES.daily_cap,
        flags: flags,
      }
    }
  }

  // ----- Build final response -----
  if (action === 'allow') {
    return { action: 'allow', message: '', flags: [] }
  }

  // needs_approval — use first non-empty message (they're all hold-style)
  var finalMessage = ''
  for (var j = 0; j < messages.length; j++) {
    if (messages[j] && messages[j].trim()) {
      finalMessage = messages[j]
      break
    }
  }
  if (!finalMessage) finalMessage = DEFAULT_MESSAGES.generic_hold

  return {
    action: action,
    message: finalMessage,
    flags: flags,
  }
}

// Also export as default for convenience
export default checkBookingAgainstRules
