// =======================================================
// petAge — format a pet's stored age (decimal YEARS) into
// friendly text for display.
//
// Age is stored as decimal years (e.g. 0.75 = 9 months,
// 0.5 = 6 months, 1.5 = 1 year 6 months, 2 = 2 years).
// This turns that number into something a human reads:
//   0.75 → "9 months"
//   0.5  → "6 months"
//   1    → "1 year"
//   2    → "2 years"
//   1.5  → "1 year 6 months"
//
// Returns '' for empty/invalid so callers can hide it.
// =======================================================
export function formatPetAge(rawAge) {
  if (rawAge === null || rawAge === undefined || rawAge === '') return ''
  var age = parseFloat(rawAge)
  if (isNaN(age) || age <= 0) return ''

  // Under a year → show in months
  if (age < 1) {
    var m = Math.round(age * 12)
    if (m < 1) m = 1
    return m + (m === 1 ? ' month' : ' months')
  }

  // A year or more → years (+ leftover months if any)
  var years = Math.floor(age)
  var months = Math.round((age - years) * 12)
  if (months === 12) { years += 1; months = 0 } // rounding edge

  var yearsStr = years + (years === 1 ? ' year' : ' years')
  if (months > 0) {
    return yearsStr + ' ' + months + (months === 1 ? ' month' : ' months')
  }
  return yearsStr
}

export default formatPetAge
