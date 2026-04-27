// =============================================================================
// phone.js — Phone number formatting helpers
// =============================================================================
// Display: formatPhone('7130983746') → '713-098-3746'
//          formatPhone('17130983746') → '713-098-3746' (drops leading 1)
//          formatPhone('+1 (713) 098-3746') → '713-098-3746'
//          formatPhone('') → ''
//
// Input handler: formatPhoneOnInput is for live-formatting an input field
// as the user types. Strips everything except digits, then re-applies dashes
// after the 3rd and 6th digit. So "7" → "7", "713" → "713",
// "7130" → "713-0", "7130983746" → "713-098-3746".
// =============================================================================

// Display formatter — pretty-prints a stored phone number
export function formatPhone(raw) {
  if (!raw) return ''
  // Strip everything except digits
  var digits = String(raw).replace(/[^0-9]/g, '')
  // If it has a leading 1 (US country code) and is 11 digits, drop it
  if (digits.length === 11 && digits.charAt(0) === '1') {
    digits = digits.slice(1)
  }
  // Standard US 10-digit number → XXX-XXX-XXXX
  if (digits.length === 10) {
    return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6)
  }
  // Anything else → return the raw input (some international formats, partial numbers)
  return raw
}

// Input handler — call this from onChange on a phone input field to live-format
// as the user types. Always returns the new field value.
export function formatPhoneOnInput(rawInput) {
  if (!rawInput) return ''
  var digits = String(rawInput).replace(/[^0-9]/g, '')
  // Cap at 10 digits — drop the leading 1 if user typed it
  if (digits.length === 11 && digits.charAt(0) === '1') {
    digits = digits.slice(1)
  }
  if (digits.length > 10) {
    digits = digits.slice(0, 10)
  }
  // Re-apply dashes
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return digits.slice(0, 3) + '-' + digits.slice(3)
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6)
}

// For Twilio / Stripe / database storage — strips formatting so the database
// always has a consistent format. Use before saving.
export function normalizePhone(raw) {
  if (!raw) return ''
  return String(raw).replace(/[^0-9]/g, '')
}
