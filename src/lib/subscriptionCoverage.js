// =============================================================================
// subscriptionCoverage.js — Subscription coverage logic at checkout
// =============================================================================
// Given a client + an appointment, figures out:
//   • Does the client have an active subscription?
//   • Does that subscription cover any of the services on this appointment?
//   • How much should be discounted?
//   • What usage entries do we write after payment completes?
//
// Plan types this handles:
//   • Service-based  — fully covers any service in covered_service_ids (no cap)
//   • Bundle         — covers up to N of each service per period (counts usage)
//   • Discount       — % off the entire appointment
//   • Frequency      — service is auto-booked, NOT billed at checkout
//
// Returns one of:
//   { covered: false, reason: '...' }       — no subscription / no match
//   { covered: true,
//     discount_amount: number,              — dollars to discount
//     discount_pct: number | null,
//     subscription_id: uuid,
//     plan_name: string,
//     coverage_message: string,             — human-readable for UI
//     usage_records: [...]                  — rows to insert AFTER payment recorded
//   }
// =============================================================================

import { supabase } from './supabase'

// Pull all active subscriptions for a client (with plan + period info)
export async function getActiveSubsForClient(clientId) {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('id, status, current_period_start, current_period_end, cancel_at_period_end, subscription_plans(id, name, emoji, price_cents, billing_interval, covered_service_ids, usage_caps, discount_pct, auto_book_interval_weeks)')
    .eq('client_id', clientId)
    .in('status', ['active', 'trialing'])
  if (error) {
    console.warn('[subCoverage] getActiveSubs error:', error)
    return []
  }
  return data || []
}

// Compute used count per service in this billing period (for bundle plans)
async function getUsageForSubInPeriod(subId, periodStart, periodEnd) {
  const { data } = await supabase
    .from('subscription_usage')
    .select('service_id')
    .eq('subscription_id', subId)
    .gte('used_at', periodStart || '1900-01-01')
    .lte('used_at', periodEnd || '2999-12-31')
  const counts = {}
  ;(data || []).forEach(row => {
    if (row.service_id) counts[row.service_id] = (counts[row.service_id] || 0) + 1
  })
  return counts
}

// Compute coverage for an appointment.
//
// `appointmentPets` = appointment_pets rows on the appointment (may be empty for
// legacy single-pet appts — fall back to top-level service in that case).
// `topLevelService` = appt.services + appt.quoted_price (legacy fallback).
// `appointmentPrice` = total dollar amount on the appointment.
//
// Returns the highest-value coverage from the client's subs (best deal wins).
export async function computeCoverage({
  clientId,
  appointmentPets,
  topLevelService,
  topLevelServicePrice,
  appointmentPrice,
}) {
  const subs = await getActiveSubsForClient(clientId)
  if (subs.length === 0) {
    return { covered: false, reason: 'no_active_subscription' }
  }

  // Build the list of services on this appointment (with prices)
  const apptServices = []
  if (appointmentPets && appointmentPets.length > 0) {
    appointmentPets.forEach(ap => {
      const sid = ap.service_id || (ap.services && ap.services.id)
      const price = parseFloat(ap.quoted_price || (ap.services && ap.services.price) || 0)
      if (sid) apptServices.push({ service_id: sid, price })
    })
  } else if (topLevelService && topLevelService.id) {
    apptServices.push({
      service_id: topLevelService.id,
      price: parseFloat(topLevelServicePrice || topLevelService.price || 0),
    })
  }
  if (apptServices.length === 0) {
    return { covered: false, reason: 'no_services_on_appointment' }
  }

  // Try each active subscription, pick the one that gives the biggest discount
  let bestResult = null

  for (const sub of subs) {
    const plan = sub.subscription_plans
    if (!plan) continue

    // ─── DISCOUNT plan: % off everything ───
    if (plan.discount_pct && plan.discount_pct > 0) {
      const discountAmount = parseFloat(((appointmentPrice * plan.discount_pct) / 100).toFixed(2))
      const result = {
        covered: true,
        discount_amount: discountAmount,
        discount_pct: plan.discount_pct,
        subscription_id: sub.id,
        plan_name: plan.name,
        coverage_message: `${plan.emoji || '🎁'} ${plan.name}: ${plan.discount_pct}% off everything (-$${discountAmount.toFixed(2)})`,
        usage_records: apptServices.map(s => ({
          subscription_id: sub.id,
          service_id: s.service_id,
          period_start: sub.current_period_start,
          period_end: sub.current_period_end,
          notes: `${plan.discount_pct}% discount applied`,
        })),
      }
      if (!bestResult || result.discount_amount > bestResult.discount_amount) {
        bestResult = result
      }
      continue
    }

    // ─── BUNDLE plan: N of A + M of B per period (track usage caps) ───
    if (plan.usage_caps && Object.keys(plan.usage_caps).length > 0) {
      const usedCounts = await getUsageForSubInPeriod(
        sub.id,
        sub.current_period_start,
        sub.current_period_end,
      )
      let totalCovered = 0
      const usageRecords = []
      for (const apptSvc of apptServices) {
        const cap = plan.usage_caps[apptSvc.service_id]
        if (!cap) continue  // not in this bundle
        const used = usedCounts[apptSvc.service_id] || 0
        if (used >= cap) continue  // already maxed out this period
        // Cover this one
        totalCovered += apptSvc.price
        usedCounts[apptSvc.service_id] = used + 1  // local increment so we don't double-cover same service
        usageRecords.push({
          subscription_id: sub.id,
          service_id: apptSvc.service_id,
          period_start: sub.current_period_start,
          period_end: sub.current_period_end,
          notes: `Bundle use ${used + 1}/${cap}`,
        })
      }
      if (totalCovered > 0) {
        const result = {
          covered: true,
          discount_amount: parseFloat(totalCovered.toFixed(2)),
          discount_pct: null,
          subscription_id: sub.id,
          plan_name: plan.name,
          coverage_message: `${plan.emoji || '📦'} ${plan.name}: covered $${totalCovered.toFixed(2)} via bundle`,
          usage_records: usageRecords,
        }
        if (!bestResult || result.discount_amount > bestResult.discount_amount) {
          bestResult = result
        }
      }
      continue
    }

    // ─── SERVICE-BASED plan: unlimited covered services ───
    if (plan.covered_service_ids && plan.covered_service_ids.length > 0) {
      let totalCovered = 0
      const usageRecords = []
      for (const apptSvc of apptServices) {
        if (plan.covered_service_ids.indexOf(apptSvc.service_id) >= 0) {
          totalCovered += apptSvc.price
          usageRecords.push({
            subscription_id: sub.id,
            service_id: apptSvc.service_id,
            period_start: sub.current_period_start,
            period_end: sub.current_period_end,
            notes: 'Unlimited coverage',
          })
        }
      }
      if (totalCovered > 0) {
        const result = {
          covered: true,
          discount_amount: parseFloat(totalCovered.toFixed(2)),
          discount_pct: null,
          subscription_id: sub.id,
          plan_name: plan.name,
          coverage_message: `${plan.emoji || '✂️'} ${plan.name}: covered $${totalCovered.toFixed(2)} (unlimited)`,
          usage_records: usageRecords,
        }
        if (!bestResult || result.discount_amount > bestResult.discount_amount) {
          bestResult = result
        }
      }
    }
  }

  if (bestResult) return bestResult
  return { covered: false, reason: 'no_matching_subscription' }
}

// Insert usage records after payment is recorded.
// Best-effort — never throws (we don't want a usage tracking failure to break a checkout).
export async function recordSubscriptionUsage(usageRecords, appointmentId) {
  if (!usageRecords || usageRecords.length === 0) return
  try {
    const rows = usageRecords.map(u => ({
      subscription_id: u.subscription_id,
      appointment_id: appointmentId || null,
      service_id: u.service_id || null,
      period_start: u.period_start,
      period_end: u.period_end,
      notes: u.notes || null,
    }))
    const { error } = await supabase.from('subscription_usage').insert(rows)
    if (error) console.warn('[subCoverage] usage insert error:', error)
  } catch (err) {
    console.warn('[subCoverage] usage failed (non-fatal):', err)
  }
}
