// ============================================================
// PetPro: AI Usage Helper
// ============================================================
// Two functions used throughout the app to enforce monthly
// AI usage caps per subscription tier.
//
//   checkAICap()         - Call BEFORE any AI action.
//                          Returns { allowed, tier, used, cap, ... }
//                          If allowed === false, block the call and
//                          show the returned `message` to the groomer.
//
//   logAIUsage(feature)  - Call AFTER an AI action succeeds.
//                          Records one row in ai_usage table so it
//                          counts against their monthly cap.
//
// Caps (set in get_ai_usage_status SQL function):
//   basic    =   500 / month
//   pro      =   800 / month
//   pro_plus = 1,000 / month
//   growing  = 3,000 / month
// ============================================================

import { supabase } from './supabase'

/**
 * Ask Supabase if the currently-signed-in groomer is under their
 * monthly AI cap. Returns an object the caller can use to:
 *   1. Decide whether to proceed with the AI call (allowed)
 *   2. Show a usage widget        (used, cap, percentUsed)
 *   3. Show an upgrade CTA        (message)
 *
 * Design note: if Supabase errors or is unreachable, we FAIL OPEN
 * (allowed = true). Better to let the groomer use AI than to block
 * their business because of a transient network hiccup.
 */
export async function checkAICap(groomerId = null) {
  // If a groomerId is passed (e.g. from the client portal, where the
  // logged-in user is a CLIENT and not the shop owner), use it directly.
  // Otherwise assume the logged-in user IS the groomer.
  let uid = groomerId
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        allowed: false,
        tier: null,
        used: 0,
        cap: 0,
        percentUsed: 0,
        message: 'You must be signed in to use AI features.'
      }
    }
    uid = user.id
  }

  const { data, error } = await supabase
    .rpc('get_ai_usage_status', { p_groomer_id: uid })
    .single()

  if (error) {
    console.error('[aiUsage] checkAICap error:', error)
    // Fail OPEN — don't block the groomer because of a server hiccup.
    return {
      allowed: true,
      tier: 'unknown',
      used: 0,
      cap: 0,
      percentUsed: 0,
      message: null,
      error: error.message
    }
  }

  const allowed = !data.over_limit

  const message = data.over_limit
    ? `You've used ${data.used_this_month} of your ${data.cap} monthly AI actions. Upgrade your plan to keep using AI features this month.`
    : null

  return {
    allowed,
    tier: data.tier,
    used: data.used_this_month,
    cap: data.cap,
    percentUsed: data.percent_used,
    message
  }
}

/**
 * Log one AI action for the signed-in groomer. Call this AFTER the
 * AI call succeeds so failed attempts don't count against their cap.
 *
 * @param {string} feature - short tag, e.g. 'chat_widget', 'voice_booking',
 *                           'flag_check', 'send_client_message'
 * @param {number} tokensEstimate - optional rough token count for future
 *                                  cost analytics. Default 0.
 *
 * Design note: if the insert fails, we log and move on silently. We
 * never want a logging failure to disrupt the groomer's AI experience.
 */
export async function logAIUsage(feature, tokensEstimate = 0, groomerId = null) {
  // If a groomerId is passed (client portal use case), log against it.
  // Otherwise assume the logged-in user IS the groomer.
  let uid = groomerId
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    uid = user.id
  }

  const { error } = await supabase
    .from('ai_usage')
    .insert({
      groomer_id: uid,
      feature: feature,
      tokens_estimate: tokensEstimate
    })

  if (error) {
    console.error('[aiUsage] logAIUsage error:', error)
    // Fail silently on purpose.
  }
}
