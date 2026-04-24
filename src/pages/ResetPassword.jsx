// ====================================================================
// PetPro — Reset Password Page
// ====================================================================
// This page is what users land on when they click the password reset
// link in the email Supabase sent them.
//
// FLOW:
//   1. User clicks "Forgot password?" on /portal/login or /login
//   2. They enter their email → Supabase sends reset email
//   3. Email link lands them HERE (/reset-password) with a special
//      token in the URL — Supabase's auth client auto-detects it
//      and gives them a brief authenticated session
//   4. User types a new password + confirm → we call
//      supabase.auth.updateUser({ password }) → done
//   5. Redirect to login on success
//
// Works for BOTH clients and groomers — Supabase handles which
// email belongs to which kind of account automatically.
//
// IMPORTANT — Supabase Dashboard config required:
//   Auth → URL Configuration → Redirect URLs
//   Add: https://petpro-app.vercel.app/reset-password
//   (and any other domains you use — localhost:5173 for local dev)
// ====================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [validSession, setValidSession] = useState(false)
  var [submitting, setSubmitting] = useState(false)
  var [success, setSuccess] = useState(false)
  var [error, setError] = useState('')

  var [password, setPassword] = useState('')
  var [confirmPassword, setConfirmPassword] = useState('')

  useEffect(function () {
    // When a user clicks the email link, Supabase's auth client sees
    // a "recovery" token in the URL and automatically creates a session
    // (brief, just enough to let them set a new password).
    //
    // We check for that session here. If it's valid → show form.
    // If not → the link is expired or already used.
    checkSession()
  }, [])

  async function checkSession() {
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setValidSession(true)
      } else {
        setError('This reset link is invalid or has expired. Please request a new one from the login page.')
      }
    } catch (err) {
      console.error('Session check error:', err)
      setError('Could not verify your reset link. Please request a new one from the login page.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      var { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        var msg = updateError.message.toLowerCase()
        if (msg.includes('leaked') || msg.includes('pwned') || msg.includes('breach')) {
          setError('That password has been found in a data breach — please pick a different one. Try 3 random words like "blue-taco-river42".')
        } else if (msg.includes('weak')) {
          setError('That password is too weak. Try something longer with a mix of letters, numbers, and a symbol.')
        } else if (msg.includes('password')) {
          setError(updateError.message)
        } else {
          setError('Could not update password: ' + updateError.message)
        }
        setSubmitting(false)
        return
      }

      // Success — sign them out so they have to log in fresh with the
      // new password (cleaner state, also verifies the password works).
      await supabase.auth.signOut()
      setSuccess(true)
    } catch (err) {
      console.error('Password reset error:', err)
      setError('Something went wrong. Please try again or request a new reset link.')
      setSubmitting(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────
  var pageStyle = { minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
  var cardStyle = { maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#6b7280' }}>Verifying your reset link…</div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '56px', textAlign: 'center', marginBottom: '12px' }}>✅</div>
          <h1 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#111827', textAlign: 'center' }}>
            Password updated!
          </h1>
          <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '15px', lineHeight: '1.6', textAlign: 'center' }}>
            Your password has been changed. Log in with your new password to continue.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={function () { navigate('/portal/login') }}
              style={{ padding: '12px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
            >
              Client Login
            </button>
            <button
              onClick={function () { navigate('/login') }}
              style={{ padding: '12px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              Groomer Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Invalid / expired link ───────────────────────────────────────
  if (!validSession) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '56px', textAlign: 'center', marginBottom: '12px' }}>⚠️</div>
          <h1 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#111827', textAlign: 'center' }}>
            Link expired
          </h1>
          <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '15px', lineHeight: '1.6', textAlign: 'center' }}>
            {error || 'This reset link is no longer valid. Request a new one from the login page.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={function () { navigate('/portal/login') }}
              style={{ padding: '12px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
            >
              Client Login
            </button>
            <button
              onClick={function () { navigate('/login') }}
              style={{ padding: '12px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              Groomer Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Reset form ────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '4px' }}>🔐</div>
        <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: '#111827', textAlign: 'center' }}>
          Set a new password
        </h1>
        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '14px', lineHeight: '1.5', textAlign: 'center' }}>
          Type your new password below. You'll use this the next time you log in.
        </p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              padding: '12px 14px',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#991b1b',
              marginBottom: '16px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={function (e) { setPassword(e.target.value) }}
              placeholder="Create a strong password"
              required
              autoFocus
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

          {/* Same password-rules helper as signup */}
          <div style={{
            marginTop: '-8px',
            marginBottom: '14px',
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#475569',
            lineHeight: '1.6'
          }}>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: '2px' }}>Password must:</div>
            <div>• Be at least 8 characters</div>
            <div>• Include a letter and a number</div>
            <div>• Not be a common password (like "password123")</div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={function (e) { setConfirmPassword(e.target.value) }}
              placeholder="Re-enter your password"
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

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px',
              background: submitting ? '#9ca3af' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '15px',
              cursor: submitting ? 'wait' : 'pointer'
            }}
          >
            {submitting ? 'Updating Password…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
