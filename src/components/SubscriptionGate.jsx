// ============================================================================
// SubscriptionGate.jsx — Block app access until the groomer has paid
// ============================================================================
// Wraps groomer-side routes. Reads `subscription_tier` from the groomers row.
// If empty/null → redirect to /plans so they can pick a tier and pay.
//
// Usage:
//   <SubscriptionGate>
//     <Calendar />
//   </SubscriptionGate>
//
// Bypasses the gate (whitelist):
//   - Anyone whose user record is in `staff_members` (employees of paid shops)
//   - Anyone whose user record is in `clients` (customers of paid shops)
// Those user types are gated separately by their own login flows.
// ============================================================================
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

      // 2) If this user is a STAFF MEMBER, bypass — the OWNER pays for them.
      //    But owners themselves need to be checked (they show as staff w/ role=owner
      //    AND have a row in groomers). For owners, check the groomers row below.
      var { data: staffRow } = await supabase
        .from('staff_members')
        .select('id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (staffRow && staffRow.role !== 'owner') {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // 3) Owner / groomer — must have an active subscription_tier.
      //    Look up by id first, then fall back to email. This handles legacy
      //    accounts where the groomers row id doesn't match auth.users.id.
      var { data: groomerRow } = await supabase
        .from('groomers')
        .select('subscription_tier')
        .eq('id', user.id)
        .maybeSingle()

      if (!groomerRow && user.email) {
        var { data: byEmail } = await supabase
          .from('groomers')
          .select('subscription_tier')
          .eq('email', user.email)
          .maybeSingle()
        if (byEmail) groomerRow = byEmail
      }

      var tier = groomerRow && groomerRow.subscription_tier
      if (tier && String(tier).trim() !== '') {
        if (!cancelled) setState({ loading: false, allowed: true })
        return
      }

      // No tier → send to /plans with a friendly flag so Plans.jsx can show
      // a "welcome, pick a plan" banner instead of a generic page.
      if (!cancelled) setState({ loading: false, allowed: false, redirectTo: '/plans?need_subscription=1' })
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
