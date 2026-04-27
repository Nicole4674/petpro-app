// =============================================================================
// insights.js — Smart Nudge generation
// =============================================================================
// On app load, runs a set of "rules" that look at the groomer's recent data
// and generate proactive AI nudges. Each rule:
//   1. Returns null if nothing's worth flagging
//   2. Returns { title, body, action_label, action_url, meta } if it found
//      something interesting
//
// Throttling: each rule_key is rate-limited to once per 24 hours per groomer
// so we don't spam them with the same nudge over and over.
//
// Usage:
//   import { runInsights } from '../lib/insights'
//   await runInsights(groomerId)   // checks rules, inserts new insights
//
//   import { fetchUnreadInsights } from '../lib/insights'
//   const items = await fetchUnreadInsights(groomerId)
// =============================================================================

import { supabase } from './supabase'

// 24 hours in milliseconds — same rule won't fire twice in this window
const THROTTLE_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function dateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// True if rule_key fired within the last 24h for this groomer (any status)
async function ruleRecentlyFired(groomerId, ruleKey) {
  const since = new Date(Date.now() - THROTTLE_MS).toISOString()
  const { data } = await supabase
    .from('ai_insights')
    .select('id')
    .eq('groomer_id', groomerId)
    .eq('rule_key', ruleKey)
    .gte('created_at', since)
    .limit(1)
  return (data || []).length > 0
}

// ---------------------------------------------------------------------------
// Rule: light_schedule
// Fire when tomorrow has < 3 appointments AND the groomer has 10+ clients
// (so we don't bug brand-new groomers with empty calendars).
// ---------------------------------------------------------------------------
async function ruleLightSchedule(groomerId) {
  // Count tomorrow's appointments
  const { data: appts } = await supabase
    .from('appointments')
    .select('id')
    .eq('groomer_id', groomerId)
    .eq('appointment_date', dateOffset(1))
    .not('status', 'in', '(cancelled,no_show,rescheduled)')

  const apptCount = (appts || []).length

  // Count active clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('groomer_id', groomerId)
    .neq('is_active', false)

  const clientCount = (clients || []).length

  if (apptCount >= 3 || clientCount < 10) return null

  return {
    rule_key: 'light_schedule',
    title: '📅 Tomorrow looks light',
    body: `Only ${apptCount} appointment${apptCount === 1 ? '' : 's'} on the books. Want me to find clients due for a groom and draft rebook texts?`,
    action_label: 'Find rebook candidates',
    action_url: '/calendar?find_rebooks=1',
  }
}

// ---------------------------------------------------------------------------
// Rule: overdue_balances
// Fire when ≥1 client has $50+ outstanding for 7+ days.
// ---------------------------------------------------------------------------
async function ruleOverdueBalances(groomerId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Pull appointments older than 7 days that haven't been fully paid
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, client_id, final_price, quoted_price, appointment_date, payments(amount)')
    .eq('groomer_id', groomerId)
    .lte('appointment_date', sevenDaysAgo.slice(0, 10))
    .in('status', ['completed', 'checked_out'])

  let totalOverdue = 0
  const owingClients = new Set()

  ;(appts || []).forEach(a => {
    const due = parseFloat(a.final_price || a.quoted_price || 0)
    const paid = (a.payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const balance = due - paid
    if (balance >= 50) {
      totalOverdue += balance
      owingClients.add(a.client_id)
    }
  })

  if (owingClients.size === 0) return null

  return {
    rule_key: 'overdue_balances',
    title: '💰 Overdue balances',
    body: `$${totalOverdue.toFixed(2)} unpaid across ${owingClients.size} client${owingClients.size === 1 ? '' : 's'}. Want me to draft polite reminder texts?`,
    action_label: 'See balances',
    action_url: '/balances',
    meta: { client_ids: Array.from(owingClients) },
  }
}

// ---------------------------------------------------------------------------
// Rule: due_for_rebook
// Fire when 3+ clients haven't booked in 6+ weeks but DID book in the past.
// ---------------------------------------------------------------------------
async function ruleDueForRebook(groomerId) {
  const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Get all completed appointments with client_id
  const { data: appts } = await supabase
    .from('appointments')
    .select('client_id, appointment_date')
    .eq('groomer_id', groomerId)
    .in('status', ['completed', 'checked_out'])
    .order('appointment_date', { ascending: false })

  // Build map: client → most recent appointment date
  const lastApptByClient = {}
  ;(appts || []).forEach(a => {
    if (!a.client_id) return
    if (!lastApptByClient[a.client_id] || a.appointment_date > lastApptByClient[a.client_id]) {
      lastApptByClient[a.client_id] = a.appointment_date
    }
  })

  // Get all clients to filter out cancelled clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, is_active')
    .eq('groomer_id', groomerId)

  const activeClientIds = new Set((clients || []).filter(c => c.is_active !== false).map(c => c.id))

  // Find active clients whose last appointment was 6+ weeks ago
  const overdueClients = Object.entries(lastApptByClient)
    .filter(([cid, lastDate]) => activeClientIds.has(cid) && lastDate < sixWeeksAgo)
    .map(([cid]) => cid)

  if (overdueClients.length < 3) return null

  return {
    rule_key: 'due_for_rebook',
    title: '🐾 Clients due for next groom',
    body: `${overdueClients.length} clients haven't booked in 6+ weeks. Run a "we miss you" text campaign?`,
    action_label: 'Open clients',
    action_url: '/clients',
    meta: { client_ids: overdueClients.slice(0, 50) },
  }
}

// ---------------------------------------------------------------------------
// Rule: vax_expiring
// Fire when 1+ pet has rabies or DHPP expiring in next 14 days.
// ---------------------------------------------------------------------------
async function ruleVaxExpiring(groomerId) {
  const today = todayStr()
  const fourteenDaysOut = dateOffset(14)

  const { data: vax } = await supabase
    .from('pet_vaccinations')
    .select('pet_id, vaccine_type, expiration_date, pets!inner(id, name, client_id, groomer_id)')
    .gte('expiration_date', today)
    .lte('expiration_date', fourteenDaysOut)
    .eq('pets.groomer_id', groomerId)
    .in('vaccine_type', ['rabies', 'dhpp'])

  if (!vax || vax.length === 0) return null

  const petCount = new Set(vax.map(v => v.pet_id)).size

  return {
    rule_key: 'vax_expiring',
    title: '💉 Vaccinations expiring soon',
    body: `${petCount} pet${petCount === 1 ? '' : 's'} ha${petCount === 1 ? 's' : 've'} a vaccination expiring in the next 14 days. Want me to text owners to update?`,
    action_label: 'See pets',
    action_url: '/clients',
    meta: { pet_ids: vax.map(v => v.pet_id) },
  }
}

// ---------------------------------------------------------------------------
// Rule: new_unwelcomed_client
// Fire when a client signed up in last 24h but has no message thread yet.
// ---------------------------------------------------------------------------
async function ruleNewUnwelcomedClient(groomerId) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, created_at')
    .eq('groomer_id', groomerId)
    .gte('created_at', oneDayAgo)
    .neq('is_active', false)

  if (!clients || clients.length === 0) return null

  // Check which ones have no chat history
  const ids = clients.map(c => c.id)
  const { data: msgs } = await supabase
    .from('messages')
    .select('client_id')
    .in('client_id', ids)

  const messagedSet = new Set((msgs || []).map(m => m.client_id))
  const unwelcomed = clients.filter(c => !messagedSet.has(c.id))

  if (unwelcomed.length === 0) return null

  const firstName = unwelcomed[0].first_name || 'a new client'
  return {
    rule_key: 'new_unwelcomed_client',
    title: '👋 New client to welcome',
    body: unwelcomed.length === 1
      ? `${firstName} just signed up. Want to send a quick welcome text?`
      : `${unwelcomed.length} new clients signed up. Want me to draft welcome texts for each?`,
    action_label: 'Welcome them',
    action_url: '/clients',
    meta: { client_ids: unwelcomed.map(c => c.id) },
  }
}

// ---------------------------------------------------------------------------
// Rule: quiet_day
// Fire when today has 0 appointments AND it's a weekday (Mon-Fri).
// ---------------------------------------------------------------------------
async function ruleQuietDay(groomerId) {
  const dow = new Date().getDay()
  if (dow === 0 || dow === 6) return null // skip weekends — they may be intentionally closed

  const { data: appts } = await supabase
    .from('appointments')
    .select('id')
    .eq('groomer_id', groomerId)
    .eq('appointment_date', todayStr())
    .not('status', 'in', '(cancelled,no_show,rescheduled)')

  if ((appts || []).length > 0) return null

  // Also need at least 5 active clients before nudging — empty calendars on
  // brand-new accounts shouldn't trigger this
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('groomer_id', groomerId)
    .neq('is_active', false)
    .limit(5)

  if ((clients || []).length < 5) return null

  return {
    rule_key: 'quiet_day',
    title: '✂️ Quiet day today',
    body: 'No appointments on the books. Good time to write report cards from yesterday or run a rebook campaign.',
    action_label: 'See clients',
    action_url: '/clients',
  }
}

// ---------------------------------------------------------------------------
// All rules in order — light ones first so the badge fires fast on app load
// ---------------------------------------------------------------------------
const RULES = [
  ruleLightSchedule,
  ruleOverdueBalances,
  ruleDueForRebook,
  ruleVaxExpiring,
  ruleNewUnwelcomedClient,
  ruleQuietDay,
]

// ---------------------------------------------------------------------------
// Master runner — call once on app load
// ---------------------------------------------------------------------------
export async function runInsights(groomerId) {
  if (!groomerId) return { generated: 0 }

  // Bail if user has nudges turned off
  const { data: groomer } = await supabase
    .from('groomers')
    .select('nudges_enabled')
    .eq('id', groomerId)
    .maybeSingle()
  if (groomer && groomer.nudges_enabled === false) return { generated: 0, disabled: true }

  let generated = 0
  for (const rule of RULES) {
    try {
      const insight = await rule(groomerId)
      if (!insight) continue
      // Throttle — skip if same rule_key fired within 24h
      const recent = await ruleRecentlyFired(groomerId, insight.rule_key)
      if (recent) continue

      const { error } = await supabase.from('ai_insights').insert({
        groomer_id: groomerId,
        rule_key: insight.rule_key,
        title: insight.title,
        body: insight.body,
        action_label: insight.action_label || null,
        action_url: insight.action_url || null,
        meta: insight.meta || {},
      })
      if (!error) generated++
    } catch (err) {
      // Log but don't fail the whole run if one rule errors
      console.warn('[insights] rule failed:', err)
    }
  }

  return { generated }
}

// ---------------------------------------------------------------------------
// Fetch all unread insights for the AI chat widget badge
// ---------------------------------------------------------------------------
export async function fetchUnreadInsights(groomerId) {
  if (!groomerId) return []
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('groomer_id', groomerId)
    .eq('status', 'unread')
    .or('snoozed_until.is.null,snoozed_until.lte.' + nowIso)
    .order('created_at', { ascending: false })
  return data || []
}

// ---------------------------------------------------------------------------
// Mark insights as read — call when user opens the chat widget
// ---------------------------------------------------------------------------
export async function markInsightsRead(groomerId) {
  if (!groomerId) return
  await supabase
    .from('ai_insights')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('groomer_id', groomerId)
    .eq('status', 'unread')
}

// ---------------------------------------------------------------------------
// Mark a single insight as dismissed (X button)
// ---------------------------------------------------------------------------
export async function dismissInsight(insightId) {
  await supabase
    .from('ai_insights')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', insightId)
}

// ---------------------------------------------------------------------------
// Mark a single insight as actioned (user clicked the CTA)
// ---------------------------------------------------------------------------
export async function actionInsight(insightId) {
  await supabase
    .from('ai_insights')
    .update({ status: 'actioned', actioned_at: new Date().toISOString() })
    .eq('id', insightId)
}

// ---------------------------------------------------------------------------
// Snooze an insight (hide for X hours) — call from a "Remind me later" button
// ---------------------------------------------------------------------------
export async function snoozeInsight(insightId, hours) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  await supabase
    .from('ai_insights')
    .update({ status: 'snoozed', snoozed_until: until })
    .eq('id', insightId)
}
