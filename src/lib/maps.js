// =============================================================================
// maps.js — small helpers for tap-to-nav and tap-to-call links.
// =============================================================================
// On phones, anchor tags with these URLs open the user's default nav app
// (Google Maps / Apple Maps / Waze) or default dialer.
//
// Why a helper module: the URL-encoding for addresses repeats across 4+ pages
// (ClientDetail, Calendar, BoardingCalendar, ClientPortalDashboard). Stuff
// it in one place so we never typo the param names or forget travelmode.
// =============================================================================

/**
 * Build a Google Maps "directions to here" URL.
 *
 * Example:
 *   mapsUrl('123 Main St, Cypress, TX 77429')
 *   // → https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St...
 *
 * On iOS this opens Google Maps if installed, otherwise Apple Maps.
 * On Android it opens Google Maps natively.
 *
 * @param {string|object} address - either a full address string OR an object
 *   with { street, city, state, zip } fields. Empty/null returns ''.
 * @returns {string} URL safe to put in an <a href="...">. Empty string when
 *   the input is empty (so render code can decide whether to show a link).
 */
export function mapsUrl(address) {
  var addressString = formatAddress(address)
  if (!addressString) return ''
  return 'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(addressString) +
    '&travelmode=driving'
}

/**
 * Build a tel: URL that opens the device dialer.
 *
 * Example:
 *   telUrl('123-456-7890')  // → tel:1234567890
 *
 * Strips non-digit characters except a leading + (for international).
 * Empty/null returns ''.
 *
 * @param {string} phone - phone number in any common format
 * @returns {string} tel: URL or empty string
 */
export function telUrl(phone) {
  if (!phone) return ''
  var stripped = String(phone).replace(/[^\d+]/g, '')
  if (!stripped) return ''
  return 'tel:' + stripped
}

/**
 * Build an sms: URL with optional pre-filled message.
 * Useful for "Text us" buttons later.
 *
 * @param {string} phone
 * @param {string} [body] - optional pre-filled message text
 * @returns {string} sms: URL or empty string
 */
export function smsUrl(phone, body) {
  if (!phone) return ''
  var stripped = String(phone).replace(/[^\d+]/g, '')
  if (!stripped) return ''
  var url = 'sms:' + stripped
  if (body && body.length > 0) {
    url += '?body=' + encodeURIComponent(body)
  }
  return url
}

/**
 * Normalize an address into a single string we can pass to maps.
 * Accepts either a string ("123 Main St, Cypress TX") or an object
 * with separate street / city / state / zip fields. Trims, joins,
 * removes empty parts, and returns null when nothing is usable.
 *
 * Exposed so render code can decide "is there an address worth linking?"
 * without rebuilding the same logic.
 *
 * @param {string|object|null} address
 * @returns {string} formatted single-line address, or '' if none
 */
export function formatAddress(address) {
  if (!address) return ''

  // Already a string — trust it
  if (typeof address === 'string') {
    var trimmed = address.trim()
    return trimmed
  }

  // Object form — { street, city, state, zip } from a clients table row
  if (typeof address === 'object') {
    var parts = [
      address.street || address.address_line_1 || address.address1 || address.address,
      address.address_line_2 || address.address2,
      address.city,
      // State + zip on one line so maps reads it cleanly
      [address.state, address.zip || address.zip_code || address.postal_code]
        .filter(Boolean).join(' ').trim() || null,
    ].filter(function (p) { return p && String(p).trim().length > 0 })
    return parts.join(', ')
  }

  return ''
}
