// =======================================================
// PetPro — Client Portal Login Page (Public)
// URL: /portal/login
// - Email + password login
// - Verifies they have a clients row (portal account)
// - If yes → redirects to /portal (client dashboard)
// - If no  → error (they might be a groomer using wrong page)
// =======================================================
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ClientLogin() {
  var navigate = useNavigate()

  var [submitting, setSubmitting] = useState(false)
  var [error, setError] = useState('')

  var [email, setEmail] = useState('')
  var [password, setPassword] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    setSubmitting(true)
    try {
      // Step 1: Sign in
      var { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      })

      if (signInError) {
        if (signInError.message.toLowerCase().includes('invalid login credentials')) {
          setError('Wrong email or password. Try again.')
        } else if (signInError.message.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email before logging in. Check your inbox.')
        } else {
          setError('Login failed: ' + signInError.message)
        }
        setSubmitting(false)
        return
      }

      // Step 2: Make sure they have a client record (portal account)
      var userId = signInData.user.id
      var { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .select('id, portal_enabled')
        .eq('user_id', userId)
        .maybeSingle()

      if (clientError) {
        console.error('Error checking client record:', clientError)
        setError('Something went wrong. Please try again.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      if (!clientRow) {
        // Not a client portal user — probably a groomer using wrong page
        setError('This login is for clients only. If you\'re a groomer, use the main login page.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      if (!clientRow.portal_enabled) {
        setError('Your portal access is not active. Please contact your groomer.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      // Step 3: All good — send them to the portal dashboard
      navigate('/portal')
    } catch (err) {
      console.error('Login error:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // Sends a password reset email via Supabase.
  // User needs to type their email in the field above first — we reuse it
  // so they don't have to type it twice.
  async function handleForgotPassword() {
    var emailToReset = email.trim().toLowerCase()
    if (!emailToReset) {
      setError('Please type your email in the field above first, then click "Forgot password?".')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      var { error: resetError } = await supabase.auth.resetPasswordForEmail(emailToReset, {
        redirectTo: window.location.origin + '/reset-password'
      })

      if (resetError) {
        setError('Could not send reset email: ' + resetError.message)
      } else {
        alert(
          '📧 Reset email sent!\n\n' +
          'We sent a password reset link to ' + emailToReset + '.\n\n' +
          'Click the link in that email to set a new password. ' +
          'Check your spam folder if you don\'t see it in a few minutes.'
        )
      }
    } catch (err) {
      console.error('Password reset error:', err)
      setError('Something went wrong sending the reset email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>

        {/* Header */}
        <div style={{ background: '#7c3aed', padding: '32px 24px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '40px', marginBottom: '6px' }}>🐾</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>
            Client Portal Login
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.9 }}>
            Log in to manage your pets and bookings
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '28px 24px' }}>
          {error && (
            <div style={{
              padding: '12px 14px',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#991b1b',
              marginBottom: '16px',
              fontSize: '15px'
            }}>
              {error}
            </div>
          )}

          <LoginField
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
          />
          <LoginField
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            type="password"
          />

          <div style={{ textAlign: 'right', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{
                background: 'none',
                border: 'none',
                color: '#7c3aed',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: 0
              }}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px',
              background: submitting ? '#9ca3af' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '15px',
              cursor: submitting ? 'wait' : 'pointer'
            }}
          >
            {submitting ? 'Logging in...' : 'Log In'}
          </button>

          <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>
            Don't have an account?<br />
            Ask your groomer for a signup link.
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── Helper component ───────────────────────────────────
function LoginField({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        required
        style={{
          width: '100%',
          padding: '11px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '16px',
          boxSizing: 'border-box'
        }}
      />
    </div>
  )
}
