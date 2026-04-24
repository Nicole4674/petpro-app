// =======================================================
// PetPro — Staff Login Page
// URL: /staff/login
// =======================================================
// Staff log in here to view their schedule, hours, and profile
// from home (or anywhere). They CANNOT clock in from here — that
// happens at the lobby kiosk only.
//
// Auth uses Supabase email/password. After login, we verify the
// user has a matching staff_members row (via auth_user_id).
// =======================================================
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function StaffLogin() {
  var navigate = useNavigate()
  var [mode, setMode] = useState('login') // 'login' | 'signup'
  var [email, setEmail] = useState('')
  var [password, setPassword] = useState('')
  var [confirmPwd, setConfirmPwd] = useState('')
  var [error, setError] = useState('')
  var [submitting, setSubmitting] = useState(false)
  var [signupSuccess, setSignupSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    setSubmitting(true)
    try {
      // Step 1: sign in via Supabase auth
      var { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password,
      })

      if (signInErr) {
        if (signInErr.message.toLowerCase().includes('invalid login credentials')) {
          setError('Wrong email or password. Try again.')
        } else if (signInErr.message.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email before logging in. Check your inbox.')
        } else {
          setError('Login failed: ' + signInErr.message)
        }
        setSubmitting(false)
        return
      }

      // Step 2: verify they're actually linked to a staff_members row
      var userId = signInData.user.id
      var { data: staffRow, error: staffErr } = await supabase
        .from('staff_members')
        .select('id, first_name, role, status')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (staffErr) {
        setError('Something went wrong. Please try again.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      if (!staffRow) {
        setError('This login isn\'t linked to a staff account. Contact your shop owner.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      if (staffRow.status !== 'active') {
        setError('Your staff account is inactive. Contact your shop owner to reactivate.')
        await supabase.auth.signOut()
        setSubmitting(false)
        return
      }

      // All good — go to staff dashboard
      navigate('/staff/me')
    } catch (err) {
      console.error('Staff login error:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Enter your email and create a password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPwd) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      // Pre-check: email must match an existing (unlinked) staff row
      var { data: staffRow } = await supabase
        .from('staff_members')
        .select('id, auth_user_id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      if (!staffRow) {
        setError('This email is not set up as a staff account. Ask your shop owner to add you first.')
        setSubmitting(false)
        return
      }
      if (staffRow.auth_user_id) {
        setError('This account is already set up. Try logging in instead.')
        setSubmitting(false)
        return
      }

      // Create the auth user — trigger auto-links to staff_members by email
      var { error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          data: { role: 'staff' },
        },
      })
      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes('already registered')) {
          setError('This email is already registered. Try logging in instead.')
        } else {
          setError('Signup failed: ' + signUpErr.message)
        }
        setSubmitting(false)
        return
      }
      setSignupSuccess(true)
      setSubmitting(false)
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ background: '#7c3aed', padding: '32px 24px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '40px', marginBottom: '6px' }}>👥</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>Staff Portal</h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.9 }}>
            {mode === 'login' ? 'Log in to view your schedule and hours' : 'First time? Set up your staff account'}
          </p>
        </div>

        {signupSuccess ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '10px' }}>📧</div>
            <h2 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: '800' }}>Check your email!</h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>
              We sent a verification link to <strong>{email}</strong>. Click it to activate your account, then come back and log in.
            </p>
            <button
              onClick={function () { setSignupSuccess(false); setMode('login'); setPassword(''); setConfirmPwd('') }}
              style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={mode === 'login' ? handleSubmit : handleSignup} style={{ padding: '28px 24px' }}>
            {error && (
              <div style={{
                padding: '12px 14px', background: '#fee2e2', border: '1px solid #ef4444',
                borderRadius: '8px', color: '#991b1b', marginBottom: '16px', fontSize: '14px',
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value) }}
                placeholder="you@example.com"
                required
                style={{ width: '100%', padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: mode === 'signup' ? '14px' : '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                {mode === 'login' ? 'Password' : 'Create password (min 8 chars)'}
              </label>
              <input
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value) }}
                placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'}
                required
                style={{ width: '100%', padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>
            {mode === 'signup' && (
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={function (e) { setConfirmPwd(e.target.value) }}
                  placeholder="Re-enter your password"
                  required
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '14px',
                background: submitting ? '#9ca3af' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontWeight: '700', fontSize: '15px', cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? (mode === 'login' ? 'Logging in...' : 'Creating account...') : (mode === 'login' ? 'Log In' : 'Create Account')}
            </button>

            <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>
              {mode === 'login' ? (
                <>
                  First time here?{' '}
                  <button type="button" onClick={function () { setMode('signup'); setError('') }} style={{ color: '#7c3aed', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', textDecoration: 'underline' }}>
                    Set up your account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={function () { setMode('login'); setError('') }} style={{ color: '#7c3aed', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '13px', textDecoration: 'underline' }}>
                    Log in
                  </button>
                </>
              )}
            </p>
            <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: '12px' }}>
              <Link to="/kiosk" style={{ color: '#7c3aed', fontWeight: '600', textDecoration: 'none' }}>
                Need to clock in? Open the lobby kiosk →
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
