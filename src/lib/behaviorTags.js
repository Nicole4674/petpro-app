// ====================================================================
// PetPro — Pet Behavior Tags definitions
// ====================================================================
// Shared so PetDetail (editor), Calendar, BoardingCalendar, and the
// AppointmentDetail popup all show the same tags with the same colors.
//
// Each tag has:
//   key      — saved in DB (pets.behavior_tags TEXT[])
//   emoji    — shown in the pill
//   label    — human-readable
//   color    — pill background tint
//   priority — 'high' shows on calendar tile too; 'medium'/'low' only
//              show in detail popups (keeps tile clean)
// ====================================================================

export const BEHAVIOR_TAGS = [
  // ── HIGH PRIORITY — safety-critical, shown EVERYWHERE including calendar tile ──
  { key: 'bites',             emoji: '🦷', label: 'Bite History',       color: '#dc2626', bg: '#fee2e2', priority: 'high' },
  { key: 'kennel_aggressive', emoji: '🚨', label: 'Kennel Aggressive',  color: '#dc2626', bg: '#fee2e2', priority: 'high' },
  { key: 'dog_reactive',      emoji: '🐕', label: 'Dog Reactive',       color: '#ea580c', bg: '#ffedd5', priority: 'high' },
  { key: 'human_reactive',    emoji: '👤', label: 'People Reactive',    color: '#ea580c', bg: '#ffedd5', priority: 'high' },

  // ── MEDIUM PRIORITY — handling preferences, shown in detail views ──
  { key: 'sound_sensitive',   emoji: '🦻', label: 'Sound Sensitive',    color: '#d97706', bg: '#fef3c7', priority: 'medium' },
  { key: 'hates_clippers',    emoji: '✂️', label: 'Hates Clippers',     color: '#d97706', bg: '#fef3c7', priority: 'medium' },
  { key: 'hates_dryer',       emoji: '💨', label: 'Hates Dryer',        color: '#d97706', bg: '#fef3c7', priority: 'medium' },
  { key: 'hates_nails',       emoji: '💅', label: 'Hates Nails',        color: '#d97706', bg: '#fef3c7', priority: 'medium' },
  { key: 'anxious',           emoji: '😰', label: 'Anxious / Nervous',  color: '#d97706', bg: '#fef3c7', priority: 'medium' },
  { key: 'matted_chronic',    emoji: '🪢', label: 'Chronic Matting',    color: '#d97706', bg: '#fef3c7', priority: 'medium' },

  // ── INFO — care notes (no danger, just heads-up) ──
  { key: 'senior_care',       emoji: '👴', label: 'Senior Care',        color: '#0891b2', bg: '#cffafe', priority: 'low' },
  { key: 'special_meds',      emoji: '💊', label: 'Meds at Appt',       color: '#0891b2', bg: '#cffafe', priority: 'low' },
  { key: 'puppy_first_groom', emoji: '🐶', label: 'Puppy / 1st Groom',  color: '#7c3aed', bg: '#ede9fe', priority: 'low' },
  { key: 'special_handling',  emoji: '🧤', label: 'Special Handling',   color: '#7c3aed', bg: '#ede9fe', priority: 'low' },
]

// Quick lookup helper
export function getBehaviorTag(key) {
  return BEHAVIOR_TAGS.find(t => t.key === key)
}

// Filter tags from a pet's array down to definitions we know about
// (defensive: ignores unknown tag keys if someone added one in DB).
export function resolveBehaviorTags(tagKeys) {
  if (!tagKeys || !Array.isArray(tagKeys)) return []
  return tagKeys
    .map(k => getBehaviorTag(k))
    .filter(Boolean)
}

// High-priority subset only — for compact display on calendar tiles
export function resolveHighPriorityTags(tagKeys) {
  return resolveBehaviorTags(tagKeys).filter(t => t.priority === 'high')
}
