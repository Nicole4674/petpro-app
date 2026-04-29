// ============================================================================
// SubscriptionGate.jsx — Block app access unless subscription is active
// ============================================================================
// Wraps groomer-side routes. Reads tier + status + trial_ends_at from the
// groomers row and decides whether the user gets in.
//
// Usage:
//   <SubscriptionGate>
//     <Calendar />
//   </SubscriptionGate>
//
// Decision matrix (groomers/owners):
//   • status='trialing'  AND trial_ends_at in the future → ALLOW
//   • status='active'                                      → ALLOW
//   • status='past_due'                                    → BLOCK (card failed)
//   • status='canceled'                                    → BLOCK
//   • status='incomplete' / 'unpaid' / 'incomplete_expired' → BLOCK
//   • trial_ends_at in the past AND status≠active          → BLOCK
//   • all NULL (orphan signup that never went through Stripe) → BLOCK
//
// Whitelist bypasses (always allowed):
//   • Platform owner emails — Nicole's accounts. She runs the platform and
//     can use her own software for free even if her test sub is in some
//     weird canceled state.
//   • Any user whose record is in `clients` (pet owners — gated elsewhere)
//   • Staff members below role='owner' (their boss pays for them)
// ============================================================================
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Platform owner emails — these accounts always bypass the gate so Nicole
// can use her own software for free even if her test sub is canceled.
// Add additional founders / admins here if needed.
const PLATFORM_OWNER_EMAILS = [
  'treadwell4674@gmail.com',
  'nicole@trypetpro.com',
]

export default function SubscriptionGate({ children }) {
  const [state, setState] = useState({ loading: true, allowed: false })

  useEffect(function () {
    var cancelled = false

    async function check() {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setState({ loading: false, allowed: false, redirectTo: '/login' })
        return
      }

      // ─── Whitelist 0: platform owners always get in ────────────────────
      // Nicole runs PetPro — she always has access regardless of subscription
      // state, so she can keep working on the platform even if her own sub
      // is in a weird "canceled" test state.
      var userEmail = (user.email || '').toLowerCase()
      if (userEmail && PLATFORM_OWNER_EMAILS.indexOf(userEmail) >= 0) {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // 1) If this user is a CLIENT (pet owner), bypass — they don't pay.
      //    The portal's own pages handle them.
      var { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (clientRow) {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // 2) If this user is a STAFF MEMBER (not owner), bypass — the OWNER
      //    pays for them. Owners (role='owner') still need the subscription
      //    check below.
      var { data: staffRow } = await supabase
        .from('staff_members')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (staffRow && staffRow.role !== 'owner') {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // 3) Owner / groomer — pull all the subscription fields and apply
      //    the decision matrix from the file header above.
      //    Look up by id first, then fall back to email for legacy accounts.
      var { data: groomerRow } = await supabase
        .from('groomers')
        .select('subscription_tier, subscription_status, trial_ends_at, current_period_end')
        .eq('id', user.id)
        .maybeSingle()

      if (!groomerRow && user.email) {
        var { data: byEmail } = await supabase
          .from('groomers')
          .select('subscription_tier, subscription_status, trial_ends_at, current_period_end')
          .eq('email', user.email)
          .maybeSingle()
        if (byEmail) groomerRow = byEmail
      }

      // No groomer record at all → block
      if (!groomerRow) {
        if (!cancelled) setState({ loading: false, allowed: false, redirectTo: '/plans?need_subscription=1' })
        return
      }

      var status = (groomerRow.subscription_status || '').toLowerCase()
      var trialEndsAt = groomerRow.trial_ends_at ? new Date(groomerRow.trial_ends_at) : null
      var now = new Date()

      // TRIALING — allow only if the trial hasn't expired yet
      if (status === 'trialing') {
        if (trialEndsAt && trialEndsAt > now) {
          if (!cancelled) setState({ loading: false, allowed: true })
          return
        }
        // Trial timestamp expired but Stripe hasn't flipped status yet → block
        if (!cancelled) setState({ loading: false, allowed: false, redirectTo: '/plans?trial_expired=1' })
        return
      }

      // ACTIVE — paying customer, in good standing
      if (status === 'active') {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // Anything else → block. Add a query param so /plans can show a
      // contextual message ("your card failed", "you canceled", etc.)
      var hint = 'need_subscription=1'
      if (status === 'past_due') hint = 'card_failed=1'
      else if (status === 'canceled') hint = 'canceled=1'
      else if (status === 'unpaid') hint = 'unpaid=1'
      else if (status === 'incomplete' || status === 'incomplete_expired') hint = 'incomplete=1'

      if (!cancelled) setState({ loading: false, allowed: false, redirectTo: '/plans?' + hint })
    }

    check()
    return function () { cancelled = true }
  }, [])

  if (state.loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontSize: 16, color: '#6b7280', fontFamily: 'system-ui, sans-serif',
      }}>
        🐾 Checking your account…
      </div>
    )
  }

  if (!state.allowed) {
    return <Navigate to={state.redirectTo || '/login'} replace />
  }

  return children
}
