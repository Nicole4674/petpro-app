// =============================================================================
// smsTemplates.js — Shared helper for rendering customizable SMS templates
// =============================================================================
// Templates are stored on shop_settings.sms_templates as JSONB. Each is a
// string with {placeholder} tokens. This helper:
//   1. Defines the default templates (used when shop hasn't customized)
//   2. Substitutes placeholders with real values at send time
//
// Placeholders supported (case-sensitive):
//   {client_first_name}, {client_last_name}, {pet_name}, {service_name},
//   {date}, {time}, {shop_name}, {phone}, {minutes}
//
// Anything not matched in `vars` is left blank (so a missing field doesn't
// leak the literal "{client_first_name}" to the customer).
// =============================================================================

// Default templates — match what's in the SQL (SMS Templates Schema v1.sql)
export const DEFAULT_SMS_TEMPLATES = {
  reminder:        "Hi {client_first_name}! Reminder: {pet_name} is booked for {service_name} on {date} at {time}. Reply Y to confirm or N to cancel. — {shop_name}",
  confirmation:    "Hi {client_first_name}! Confirming {pet_name}'s {service_name} on {date} at {time}. See you then! 🐾 — {shop_name}",
  pickup_ready:    "Hi {client_first_name}! {pet_name} is all done and ready for pickup. 🐾 — {shop_name}",
  running_late:    "Hi {client_first_name}! Just a heads up — we're running about {minutes} minutes behind today, so {pet_name}'s {time} appointment will start a bit later. Thanks for your patience! — {shop_name}",
  rebook_followup: "Hi {client_first_name}! It's been a while since {pet_name}'s last visit. Time for another groom? Reply YES and we'll get you scheduled. — {shop_name}",
  thank_you:       "Thanks for choosing {shop_name}, {client_first_name}! {pet_name} did great today. Hope to see you both again soon. 🐾",
  // Cancellation auto-fill offer — sent when an appointment cancels and a
  // waitlist client matches the freed slot. SEPARATE from rebook_followup
  // because cancellation offers are inventory-filling (business need), not
  // marketing nudges. Most groomers want this ON even if rebook is OFF.
  cancellation_offer: "Hi {client_first_name}! A grooming spot opened up for {pet_name} on {date} at {time}. Reply YES to book or NO to pass. — {shop_name}",
}

// Friendly labels for the Settings UI
export const SMS_TEMPLATE_LABELS = {
  reminder:           '📬 Appointment Reminder (Y/N)',
  confirmation:       '✅ Booking Confirmation',
  pickup_ready:       '🐾 Ready for Pickup',
  running_late:       '⏰ Running Late',
  rebook_followup:    '🔁 Rebook Follow-up',
  thank_you:          '💛 Thank You / Post-visit',
  cancellation_offer: '📲 Cancellation Auto-Fill (waitlist SMS)',
}

// Helper: replace all {placeholder} tokens in a template string with values
// from `vars`. Missing keys become empty strings.
export function renderSmsTemplate(template, vars) {
  if (!template) return ''
  if (!vars) vars = {}
  return template.replace(/\{(\w+)\}/g, function (_, key) {
    var v = vars[key]
    return (v === undefined || v === null) ? '' : String(v)
  })
}

// Helper: pull a template from a shop's customized templates with default fallback
export function getTemplate(templates, key) {
  if (templates && typeof templates[key] === 'string' && templates[key].trim()) {
    return templates[key]
  }
  return DEFAULT_SMS_TEMPLATES[key] || ''
}
