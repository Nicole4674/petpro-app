// =============================================================================
// mobileBookingChecker.js — drive-time sanity checks for mobile groomers.
// =============================================================================
// When a mobile groomer (or AI) is creating an appointment, this checks if
// the new slot is realistically reachable from the previous appointment AND
// reachable to the next appointment that day.
//
// Big picture:
//   • Pulls today's other appointments
//   • Finds the "previous" stop (ends just before this new one)
//   • Finds the "next" stop (starts just after this new one)
//   • Calculates drive time between them and the new stop using Google's
//     Distance Matrix (already loaded by useLoadScript on the Calendar page)
//   • Checks: previous_end + drive_time + 5 min buffer <= new_start
//   • Checks: new_end + drive_time + 5 min buffer <= next_start
//   • Returns warnings + suggested buffered start/end if either fails
//
// Why 5 min buffer?
//   • Google estimates are best-case (no traffic, no parking, no chit-chat)
//   • Real life adds 5+ minutes for parking, walking up, greeting, dog prep
//   • This buffer is conservative on purpose — we'd rather a groomer be
//     5 min early than 15 min late
//
// What it does NOT do:
//   • Doesn't block the booking — only warns
//   • Doesn't query DB — caller passes in the appointment list
//   • Doesn't load Google Maps — caller must ensure window.google is ready
//   • Doesn't reorder appointments — that's the Route page's job
// =============================================================================

const BUFFER_MINUTES = 5  // safety buffer added to all drive-time estimates

/**
 * Convert "HH:MM" or "HH:MM:SS" to total minutes from midnight.
 */
function hmToMinutes(t) {
  if (!t) return 0
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10) || 0
  const m = parseInt(parts[1], 10) || 0
  return h * 60 + m
}

/**
 * Convert total minutes (since midnight) back to "HH:MM" string.
 * Wraps if > 1440 — caller should validate.
 */
function minutesToHm(mins) {
  const total = Math.max(0, mins)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

/**
 * Format minutes to "X min" or "X hr Y min" for human-readable warnings.
 */
function fmtDuration(mins) {
  const m = Math.round(mins)
  if (m < 60) return m + ' min'
  const hrs = Math.floor(m / 60)
  const rem = m - hrs * 60
  return hrs + ' hr' + (rem > 0 ? ' ' + rem + ' min' : '')
}

/**
 * Get drive time in minutes between two coords using the JS SDK.
 * Returns null if Google isn't available or the request fails.
 * Same pattern as routeOptimizer.js — must be called client-side after
 * useLoadScript has finished loading the Maps SDK.
 */
async function getDriveMinutes(originLat, originLng, destLat, destLng) {
  if (typeof window === 'undefined' || !window.google || !window.google.maps) {
    return null
  }
  return new Promise(function (resolve) {
    try {
      const service = new window.google.maps.DistanceMatrixService()
      service.getDistanceMatrix({
        origins: [new window.google.maps.LatLng(originLat, originLng)],
        destinations: [new window.google.maps.LatLng(destLat, destLng)],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      }, function (response, status) {
        if (status !== 'OK' || !response) {
          resolve(null)
          return
        }
        const el = response.rows[0] && response.rows[0].elements && response.rows[0].elements[0]
        if (el && el.status === 'OK' && el.duration) {
          resolve(Math.ceil(el.duration.value / 60))   // seconds → minutes, round up
        } else {
          resolve(null)
        }
      })
    } catch (err) {
      resolve(null)
    }
  })
}

/**
 * MAIN — given the new appointment + the other day's appointments, check
 * if drive times work.
 *
 * Inputs:
 *   newAppt:     { lat, lng, startMinutes, endMinutes }
 *   otherAppts:  array of { lat, lng, startMinutes, endMinutes, label }
 *                (label is for the warning text — e.g. "Maria Lopez 2:00 PM")
 *
 * Returns:
 *   {
 *     ok: true,                  // drive times are tight enough or no conflict
 *     warnings: [],              // array of warning strings
 *     suggestedStartMinutes,     // null if no change needed
 *     suggestedEndMinutes,       // null if no change needed
 *     beforeDriveMins,           // drive time from previous stop (null if no previous)
 *     afterDriveMins,            // drive time to next stop (null if no next)
 *     skipped: false,            // true if we couldn't run check (no coords, no Google)
 *     skipReason: '',            // why we skipped
 *   }
 */
export async function checkMobileBookingDriveTime({ newAppt, otherAppts }) {
  // Safety: need new appointment with coords + valid times
  if (!newAppt || newAppt.lat == null || newAppt.lng == null) {
    return {
      ok: true,
      warnings: [],
      suggestedStartMinutes: null,
      suggestedEndMinutes: null,
      beforeDriveMins: null,
      afterDriveMins: null,
      skipped: true,
      skipReason: 'New client has no address coordinates yet. Save the appointment, then add coords on their profile.',
    }
  }
  if (!newAppt.startMinutes || !newAppt.endMinutes) {
    return {
      ok: true, warnings: [], suggestedStartMinutes: null, suggestedEndMinutes: null,
      beforeDriveMins: null, afterDriveMins: null, skipped: true,
      skipReason: 'Pick a service first so we know the appointment length.',
    }
  }
  // Filter to other appts WITH coords on the same day
  const validOthers = (otherAppts || []).filter(function (a) {
    return a.lat != null && a.lng != null && a.startMinutes != null && a.endMinutes != null
  })
  // Find previous (latest end <= newStart) and next (earliest start >= newEnd)
  let prev = null
  let next = null
  validOthers.forEach(function (a) {
    if (a.endMinutes <= newAppt.startMinutes) {
      if (!prev || a.endMinutes > prev.endMinutes) prev = a
    } else if (a.startMinutes >= newAppt.endMinutes) {
      if (!next || a.startMinutes < next.startMinutes) next = a
    }
    // Note: appointments that OVERLAP (start before our end + end after our start)
    // are a different problem — the existing booking conflict checker catches those.
  })

  const warnings = []
  let beforeDriveMins = null
  let afterDriveMins = null
  let suggestedStartMinutes = null
  let suggestedEndMinutes = null

  // --- BEFORE check ---
  if (prev) {
    beforeDriveMins = await getDriveMinutes(prev.lat, prev.lng, newAppt.lat, newAppt.lng)
    if (beforeDriveMins == null) {
      warnings.push('⚠️ Could not check drive time from previous stop (Google Maps issue).')
    } else {
      const requiredArrivalMins = prev.endMinutes + beforeDriveMins + BUFFER_MINUTES
      if (requiredArrivalMins > newAppt.startMinutes) {
        const shortBy = requiredArrivalMins - newAppt.startMinutes
        warnings.push(
          '⚠️ Tight from previous stop (' + (prev.label || 'previous appt') + ').' +
          ' Drive time is ' + fmtDuration(beforeDriveMins) +
          ' but you only have ' + fmtDuration(newAppt.startMinutes - prev.endMinutes) + '.' +
          ' Short by ' + fmtDuration(shortBy) + '.'
        )
        // Suggest sliding start later
        suggestedStartMinutes = requiredArrivalMins
      }
    }
  }

  // --- AFTER check ---
  if (next) {
    afterDriveMins = await getDriveMinutes(newAppt.lat, newAppt.lng, next.lat, next.lng)
    if (afterDriveMins == null) {
      warnings.push('⚠️ Could not check drive time to next stop (Google Maps issue).')
    } else {
      const myEnd = suggestedStartMinutes != null
        ? suggestedStartMinutes + (newAppt.endMinutes - newAppt.startMinutes)
        : newAppt.endMinutes
      const requiredFinishMins = next.startMinutes - afterDriveMins - BUFFER_MINUTES
      if (myEnd > requiredFinishMins) {
        const shortBy = myEnd - requiredFinishMins
        warnings.push(
          '⚠️ Tight to next stop (' + (next.label || 'next appt') + ').' +
          ' Drive time is ' + fmtDuration(afterDriveMins) +
          ' but you only have ' + fmtDuration(next.startMinutes - newAppt.endMinutes) + '.' +
          ' Short by ' + fmtDuration(shortBy) + '.'
        )
        // Can't push start later AND make next stop. Best we can do is flag it.
        // If start was already pushed, end goes later too — leave the suggestion.
        // If start wasn't pushed, no clean fix — groomer needs to manually move things.
      }
    }
  }

  // Build suggested end time if we suggested a new start
  if (suggestedStartMinutes != null) {
    suggestedEndMinutes = suggestedStartMinutes + (newAppt.endMinutes - newAppt.startMinutes)
  }

  return {
    ok: warnings.length === 0,
    warnings: warnings,
    suggestedStartMinutes: suggestedStartMinutes,
    suggestedEndMinutes: suggestedEndMinutes,
    beforeDriveMins: beforeDriveMins,
    afterDriveMins: afterDriveMins,
    skipped: false,
    skipReason: '',
  }
}

// Export helpers for the UI layer
export const _internal = {
  hmToMinutes: hmToMinutes,
  minutesToHm: minutesToHm,
  fmtDuration: fmtDuration,
}
