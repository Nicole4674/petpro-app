// =======================================================
// PetPro — Client Portal Signup Page (Public)
// URL format: /portal/signup?g=<groomer_id>
// - Loads groomer's shop branding from shop_settings
// - New clients fill form, Supabase creates auth account
// - DB trigger auto-creates matching clients row
// =======================================================
import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyUser } from '../lib/push'

export default function ClientSignup() {
  var [searchParams] = useSearchParams()
  var groomerId = searchParams.get('g')

  var [loading, setLoading] = useState(true)
  var [submitting, setSubmitting] = useState(false)
  var [success, setSuccess] = useState(false)
  var [error, setError] = useState('')
  var [shopSettings, setShopSettings] = useState(null)

  // Form fields
  var [fullName, setFullName] = useState('')
  var [email, setEmail] = useState('')
  var [phone, setPhone] = useState('')
  var [password, setPassword] = useState('')
  var [confirmPassword, setConfirmPassword] = useState('')

  useEffect(function () {
    if (!groomerId) {
      setError('Invalid signup link. Please ask your groomer for a new link.')
      setLoading(false)
      return
    }
    loadGroomerBranding()
  }, [groomerId])

  async function loadGroomerBranding() {
    try {
      var { data, error: fetchError } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('groomer_id', groomerId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (data) {
        setShopSettings(data)
      } else {
        // No shop_settings yet — use neutral fallback
        setShopSettings({ shop_name: 'Your Groomer', primary_color: '#7c3aed' })
      }
    } catch (err) {
      console.error('Error loading shop:', err)
      setError('Could not load shop info. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validation
    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (!phone.trim()) {
      setError('Please enter your phone number.')
      return
    }
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
      var { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          // After verifying email, Supabase sends them to this URL.
          // Lands on our "Email Confirmed!" success page, not root.
          emailRedirectTo: window.location.origin + '/portal/confirmed',
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            groomer_id: groomerId,
            role: 'client',
          },
        },
      })

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered') ||
            signUpError.message.toLowerCase().includes('already exists')) {
          setError('This email is already registered. Try logging in instead.')
        } else if (signUpError.message.toLowerCase().includes('password')) {
          setError('Password issue: ' + signUpError.message)
        } else {
          setError('Sign up failed: ' + signUpError.message)
        }
        setSubmitting(false)
        return
      }

      // Success — show email check screen
      setSuccess(true)

      // Fire-and-forget push to the groomer: "New client signed up"
      // Non-blocking — never let a push failure interfere with signup UX.
      ;(function notifyGroomerOfSignup() {
        try {
          notifyUser({
            userId: groomerId,
            title: '🎉 New client signed up',
            body: fullName.trim() + ' joined — ' + email.trim().toLowerCase(),
            url: '/clients',
            tag: 'signup-' + Date.now(),
          })
        } catch (e) {
          console.warn('[push] notify groomer of signup failed (non-fatal):', e)
        }
      })()
    } catch (err) {
      console.error('Signup error:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    )
  }

  var brandColor = (shopSettings && shopSettings.primary_color) || '#7c3aed'
  var shopName = (shopSettings && shopSettings.shop_name) || 'PetPro'

  // Success screen — "check your email"
  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '480px', width: '100%', background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>📧</div>
          <h1 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: '800', color: '#111827' }}>
            Check your email!
          </h1>
          <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '15px', lineHeight: '1.6' }}>
            We sent a verification link to <strong>{email}</strong>.<br />
            Click it to activate your account, then come back and log in.
          </p>
          <Link
            to="/portal/login"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: brandColor,
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '700'
            }}
          >
            Go to Login →
          </Link>
        </div>
      </div>
    )
  }

  // Main signup form
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '480px', width: '100%', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>

        {/* Branded Header */}
        <div style={{ background: brandColor, padding: '32px 24px', textAlign: 'center', color: '#fff' }}>
          {shopSettings && shopSettings.logo_url ? (
            <img
              src={shopSettings.logo_url}
              alt={shopName}
              style={{
                maxWidth: '80px',
                maxHeight: '80px',
                marginBottom: '12px',
                borderRadius: '12px',
                background: '#fff',
                padding: '8px',
                objectFit: 'contain'
              }}
            />
          ) : (
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🐾</div>
          )}
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>
            Sign up with {shopName}
          </h1>
          {shopSettings && shopSettings.tagline && (
            <p style={{ margin: '6px 0 0', fontSize: '14px', opacity: 0.9 }}>
              {shopSettings.tagline}
            </p>
          )}
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
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <FormField label="Full Name" value={fullName} onChange={setFullName} placeholder="Jane Smith" />
          <FormField label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <FormField label="Phone" value={phone} onChange={setPhone} placeholder="(555) 123-4567" type="tel" />
          <FormField label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" />
          <FormField label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" type="password" />

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px',
              background: submitting ? '#9ca3af' : brandColor,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '15px',
              cursor: submitting ? 'wait' : 'pointer',
              marginTop: '8px'
            }}
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>

          <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>
            Already have an account?{' '}
            <Link to="/portal/login" style={{ color: brandColor, fontWeight: '600', textDecoration: 'none' }}>
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────
function FormField({ label, value, onChange, placeholder, type }) {
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
