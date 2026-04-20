// ============================================================================
// breedDefaults.js — Smart auto-fill for Pet profile fields based on breed
// ============================================================================
// Given a breed string (free text, whatever the user typed), returns an object
// of sensible defaults. Currently auto-suggests coat_type only — other fields
// (weight, age, vax status, senior, etc.) vary too much within breed to guess.
//
// Usage:
//   import { getBreedDefaults } from '../lib/breedDefaults'
//   var defaults = getBreedDefaults('Goldendoodle')   // { coat_type: 'doodle' }
//   var defaults = getBreedDefaults('Shih Tzu')        // { coat_type: 'curly' }
//   var defaults = getBreedDefaults('Mutt')            // {}  (no guess)
//
// IMPORTANT: Order of rules matters. More specific patterns are checked FIRST
// so that "Goldendoodle" matches 'doodle' before falling through to 'double'
// on the word "golden".
// ============================================================================

// Each rule: if ANY of the `match` strings is found (case-insensitive substring)
// inside the user-typed breed, apply the given coat type.
var COAT_TYPE_RULES = [
  // --- DOODLES (check first — "anything-doodle" should win) ---
  { coat: 'doodle', match: ['doodle'] },

  // --- WIRE / ROUGH (check before generic terriers/curly breeds) ---
  {
    coat: 'wire',
    match: [
      'schnauzer',
      'wirehaired', 'wire-haired', 'wire haired',
      'airedale',
      'scottish terrier', 'scottie',
      'west highland', 'westie',
      'cairn terrier',
      'jack russell',
      'fox terrier',
      'norwich terrier',
      'border terrier',
      'irish terrier'
    ]
  },

  // --- CURLY / SILKY (toy breeds, spaniels, poodles) ---
  {
    coat: 'curly',
    match: [
      'shih tzu', 'shihtzu', 'shih-tzu',
      'maltese',
      'yorkie', 'yorkshire',
      'poodle',
      'bichon',
      'havanese',
      'cocker',
      'cavalier',
      'papillon',
      'lhasa',
      'coton de tulear', 'coton'
    ]
  },

  // --- DOUBLE COAT (heavy undercoat breeds — big blowouts) ---
  {
    coat: 'double',
    match: [
      'husky', 'siberian',
      'shepherd',             // German Shep, Aus Shep, etc — all double
      'malamute',
      'corgi',
      'chow',
      'akita',
      'collie',
      'samoyed',
      'newfoundland', 'newfie',
      'bernese',
      'great pyrenees', 'pyrenees',
      'pomeranian', 'pom',
      'sheltie', 'shetland',
      'keeshond',
      'saint bernard', 'st bernard', 'st. bernard',
      'golden retriever', 'golden ret',
      'leonberger',
      'tibetan',
      'spitz'
    ]
  },

  // --- SMOOTH (short single coats — most common) ---
  {
    coat: 'smooth',
    match: [
      'labrador',
      'beagle',
      'bulldog',
      'pug',
      'boxer',
      'boston',
      'dachshund', 'doxie',
      'pitbull', 'pit bull', 'pittie',
      'staffordshire', 'staffy',
      'doberman',
      'greyhound',
      'whippet',
      'chihuahua', 'chi',
      'rottweiler',
      'mastiff',
      'dalmatian',
      'vizsla',
      'weimaraner',
      'italian greyhound',
      'min pin', 'miniature pinscher',
      'rhodesian',
      'great dane',
      'french bulldog', 'frenchie'
    ]
  },

  // --- FALLBACK for just "Lab" typed alone (after labrador above) ---
  { coat: 'smooth', match: ['lab'] }
]

/**
 * Given a breed string, return an object of suggested defaults.
 * Returns {} if no match (caller should leave existing fields alone).
 *
 * @param {string} breedInput - user-typed breed, any casing
 * @returns {{ coat_type?: string }}
 */
export function getBreedDefaults(breedInput) {
  if (!breedInput || typeof breedInput !== 'string') return {}
  var normalized = breedInput.toLowerCase().trim()
  if (!normalized) return {}

  for (var i = 0; i < COAT_TYPE_RULES.length; i++) {
    var rule = COAT_TYPE_RULES[i]
    for (var j = 0; j < rule.match.length; j++) {
      if (normalized.indexOf(rule.match[j]) !== -1) {
        return { coat_type: rule.coat }
      }
    }
  }

  return {}
}
