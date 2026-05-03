// =======================================================
// PetPro — Client Portal Signup Page (Public)
// URL format: /portal/signup?g=<groomer_id>
// - Loads groomer's shop branding from shop_settings
// - New clients fill form, Supabase creates auth account
// - DB trigger auto-creates matching clients row
// =======================================================
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyUser } from '../lib/push'
import { formatPhoneOnInput } from '../lib/phone'

export default function ClientSignup() {
  var [searchParams] = useSearchParams()
  var groomerId = searchParams.get('g')

  var [loading, setLoading] = useState(true)
  var [submitting, setSubmitting] = useState(false)
  var [success, setSuccess] = useState(false)
  var [error, setError] = useState('')
  var [shopSettings, setShopSettings] = useState(null)

  // Form fields — firstName + lastName are kept SEPARATE so last_name is
  // guaranteed non-empty on signup. They're combined as "First Last" when
  // passed to the DB trigger, which still splits on the first space.
  var [firstName, setFirstName] = useState('')
  var [lastName, setLastName] = useState('')
  var [email, setEmail] = useState('')
  var [phone, setPhone] = useState('')
  var [password, setPassword] = useState('')
  var [confirmPassword, setConfirmPassword] = useState('')
  // SMS opt-in (defaults OFF — opt-in only, per Twilio TCR compliance rules)
  var [smsConsent, setSmsConsent] = useState(false)

  // Cloudflare Turnstile state — Supabase rejects signups without a valid token
  // (because we enabled CAPTCHA Protection at the project level). Same setup as
  // the groomer Signup.jsx — invisible/managed widget that fires a callback
  // when the visitor passes Cloudflare's silent bot check.
  var [turnstileToken, setTurnstileToken] = useState('')
  var turnstileWidgetRef = useRef(null)

  useEffect(function () {
    var widgetId = null
    var interval = setInterval(function () {
      if (window.turnstile && turnstileWidgetRef.current && !widgetId) {
        try {
          widgetId = window.turnstile.render(turnstileWidgetRef.current, {
            sitekey: '0x4AAAAAADH8RMpMtYfD8GUy',
            callback: function (token) { setTurnstileToken(token) },
            'error-callback': function () { setTurnstileToken('') },
            'expired-callback': function () { setTurnstileToken('') },
          })
          clearInterval(interval)
        } catch (err) {
          console.warn('[Turnstile] render failed:', err)
          clearInterval(interval)
        }
      }
    }, 200)
    var timeout = setTimeout(function () { clearInterval(interval) }, 10000)
    return function () {
      clearInterval(interval)
      clearTimeout(timeout)
      if (widgetId && window.turnstile) {
        try { window.turnstile.remove(widgetId) } catch (e) { /* noop */ }
      }
    }
  }, [])

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
    if (!firstName.trim()) {
      setError('Please enter your first name.')
      return
    }
    if (!lastName.trim()) {
      setError('Please enter your last name.')
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
      var fullNameCombined = firstName.trim() + ' ' + lastName.trim()
      // SMS consent metadata: stored in auth user metadata so the DB trigger
      // (or a future SQL update) can pick it up when creating the clients row.
      // We also do a best-effort update on the clients row immediately after
      // signup so consent is recorded even if the trigger doesn't copy it.
      var smsConsentTimestamp = smsConsent ? new Date().toISOString() : null
      // Block submission if Turnstile didn't pass — Supabase will reject anyway
      // (CAPTCHA Protection is enabled at the project level), but failing fast
      // here gives a clearer error message to real users.
      if (!turnstileToken) {
        setError('Please wait for the security check to complete, then try again.')
        setSubmitting(false)
        return
      }

      var { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          captchaToken: turnstileToken,
          data: {
            full_name: fullNameCombined,
            phone: phone.trim(),
            groomer_id: groomerId,
            role: 'client',
            sms_consent: smsConsent,
            sms_consent_at: smsConsentTimestamp,
          },
        },
      })

      // Best-effort: stamp the consent on the clients row that the trigger
      // just created. If RLS blocks this (user not yet verified), the metadata
      // above still has it for retroactive updates. Either way, no error shown.
      if (!signUpError && smsConsent) {
        try {
          await supabase
            .from('clients')
            .update({
              sms_consent: true,
              sms_consent_at: smsConsentTimestamp,
            })
            .eq('email', email.trim().toLowerCase())
        } catch (e) {
          // Silent — consent is in auth metadata as a fallback
        }
      }

      if (signUpError) {
        var msg = signUpError.message.toLowerCase()
        if (msg.includes('already registered') || msg.includes('already exists')) {
          setError('This email is already registered. Try logging in instead.')
        } else if (msg.includes('leaked') || msg.includes('pwned') || msg.includes('breach')) {
          // Supabase's HaveIBeenPwned check — password was found in a data breach
          setError('That password has been found in a data breach — please pick a different one. Try 3 random words you\'ll remember, like "blue-taco-river42".')
        } else if (msg.includes('weak')) {
          setError('That password is too weak. Try something longer with a mix of letters, numbers, and a symbol.')
        } else if (msg.includes('password')) {
          // Fallback — show Supabase's exact message for any other password rule
          setError(signUpError.message)
        } else {
          setError(/captcha/i.test(signUpError.message)
            ? "The browser security check didn't pass. Try opening this link in Safari or Chrome (NOT from inside Instagram, Facebook, or TikTok). If it still fails, please text the shop and we'll help you get signed up."
            : 'Sign up failed: ' + signUpError.message)
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
            body: fullNameCombined + ' joined — ' + email.trim().toLowerCase(),
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
          <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '15px', lineHeight: '1.6' }}>
            We sent a verification link to <strong>{email}</strong>.<br />
            Click it to activate your account, then come back and log in.
          </p>

          {/* Spam-folder reminder — critical here because if they miss the
              verification email, they can't activate their account at all.
              Yellow callout grabs the eye without looking like an error. */}
          <div style={{
            margin: '0 0 24px',
            padding: '12px 14px',
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: '8px',
            color: '#854d0e',
            fontSize: '13px',
            lineHeight: '1.5',
            textAlign: 'left',
          }}>
            <strong>📬 Don't see it?</strong> Check your spam or junk folder. If it's there, mark it as <strong>"Not Spam"</strong> so future appointment reminders and receipts land in your inbox.
          </div>

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

          {/* First + Last name side by side. BOTH required — the SQL trigger
              needs last_name to do the name-match fallback (Smart Client
              Signup Match v3). */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <FormField label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <FormField label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
            </div>
          </div>
          <FormField label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          {/* Quick spam-folder heads-up — sets expectations BEFORE the verification
              email gets buried. Tiny font keeps it from feeling alarmist. */}
          <div style={{
            marginTop: '-8px',
            marginBottom: '14px',
            fontSize: '11px',
            color: '#6b7280',
            lineHeight: '1.5',
            paddingLeft: '2px',
          }}>
            💌 We'll email appointment reminders + receipts here. <strong>Add us to your contacts</strong> so they don't go to spam.
          </div>
          <FormField label="Phone" value={phone} onChange={(v) => setPhone(formatPhoneOnInput(v))} placeholder="713-098-3746" type="tel" />
          <FormField label="Password" value={password} onChange={setPassword} placeholder="Create a strong password" type="password" />

          {/* Password requirements helper — prevents the "I tried 5 passwords
              and nothing worked" problem. Shows rules BEFORE they try. */}
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

          <FormField label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" type="password" />

          {/* SMS Consent — TWILIO TCR REQUIREMENT
              Public, opt-in, defaults OFF. Required for A2P 10DLC campaign
              approval — TCR reviewers verify this checkbox exists on a
              publicly accessible signup page (this one). Don't remove without
              talking to Twilio compliance first. */}
          <div style={{
            marginTop: '6px',
            marginBottom: '14px',
            padding: '12px 14px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={function (e) { setSmsConsent(e.target.checked) }}
                style={{ marginTop: '3px', flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: '#374151', lineHeight: '1.5' }}>
                <strong>Yes, send me appointment reminders via text message.</strong>
                {' '}Message frequency varies based on appointment activity (typically 1-4 messages per appointment).
                {' '}Message and data rates may apply. Reply <strong>STOP</strong> to opt out at any time, or <strong>HELP</strong> for help.
                {' '}By checking this, you agree to our{' '}
                <Link to="/privacy" target="_blank" style={{ color: brandColor, fontWeight: 600 }}>Privacy Policy</Link>
                {' '}and{' '}
                <Link to="/terms" target="_blank" style={{ color: brandColor, fontWeight: 600 }}>Terms of Service</Link>.
              </span>
            </label>
          </div>

          {/* Cloudflare Turnstile bot check — invisible/managed widget. Renders
              into this div via window.turnstile.render in the useEffect above.
              Reserves min-height so the form doesn't jump when the widget appears. */}
          <div
            ref={turnstileWidgetRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '12px 0',
              minHeight: '65px',
            }}
          ></div>

          <button
            type="submit"
            disabled={submitting || !turnstileToken}
            style={{
              width: '100%',
              padding: '14px',
              background: (submitting || !turnstileToken) ? '#9ca3af' : brandColor,
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
