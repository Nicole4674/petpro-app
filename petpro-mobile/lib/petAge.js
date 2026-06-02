// Format a pet's stored age (decimal years) into friendly text.
// 0.75 -> "9 months", 1 -> "1 year", 1.5 -> "1 year 6 months".
export function formatPetAge(rawAge) {
  if (rawAge === null || rawAge === undefined || rawAge === '') return '';
  const age = parseFloat(rawAge);
  if (isNaN(age) || age <= 0) return '';
  if (age < 1) {
    let m = Math.round(age * 12);
    if (m < 1) m = 1;
    return `${m} ${m === 1 ? 'month' : 'months'}`;
  }
  let years = Math.floor(age);
  let months = Math.round((age - years) * 12);
  if (months === 12) { years += 1; months = 0; }
  const y = `${years} ${years === 1 ? 'year' : 'years'}`;
  return months > 0 ? `${y} ${months} ${months === 1 ? 'month' : 'months'}` : y;
}
