import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams, Navigate } from 'react-router-dom'

// Stripe Payment Links (LIVE). Kept in sync with Plans.jsx.
// Replaced sandbox `test_` URLs on launch.
const PAYMENT_LINKS = {
  basic:    'https://buy.stripe.com/dRm9AV7Vb1yG3VReO77ok02',
  pro:      'https://buy.stripe.com/eVq9AV4IZ4KS1NJcFZ7ok03',
  pro_plus: 'https://buy.stripe.com/cNi5kF1wN3GO7835dx7ok01',
  growing:  'https://buy.stripe.com/9B614pdfv1yGcsn6hB7ok00',
}

// Cloudflare Turnstile site key — public, safe to embed in code. Bot
// protection on the signup form. Pairs with TURNSTILE_SECRET_KEY (server-
// side) if/when we add edge-function verification later.
const TURNSTILE_SITE_KEY = '0x4AAAAAADH8RMpMtYfD8GUy'

export default function Signup() {
  const [searchParams] = useSearchParams()
  const tierFromUrl = searchParams.get('tier')

  // ─── Bypass guard ─────────────────────────────────────────────────────
  // /signup MUST be reached via the Plans page (which adds ?tier=...).
  // If someone lands here directly, redirect them to /plans first so they
  // pick a tier. This is what prevents orphan accounts that bypass Stripe
  // entirely (e.g. directly typing the URL or clicking the old "Create
  // Account" link from the login page).
  if (!tierFromUrl || !PAYMENT_LINKS[tierFromUrl]) {
    return <Navigate to="/plans?need_subscription=1" replace />
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Cloudflare Turnstile state — token gets set by Cloudflare's widget
  // when the visitor passes the bot check. Without a token, signup is blocked.
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileWidgetRef = useRef(null)

  // Render the Turnstile widget once the script has loaded. We poll briefly
  // because the script tag in index.html is `async defer` — it may not be
  // ready when this component mounts. Once the widget's invisible check
  // passes, the callback fires with a token we attach to the signup payload.
  useEffect(() => {
    let widgetId = null
    const interval = setInterval(() => {
      if (window.turnstile && turnstileWidgetRef.current && !widgetId) {
        try {
          widgetId = window.turnstile.render(turnstileWidgetRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => setTurnstileToken(token),
            'error-callback': () => setTurnstileToken(''),
            'expired-callback': () => setTurnstileToken(''),
          })
          clearInterval(interval)
        } catch (err) {
          console.warn('[Turnstile] render failed:', err)
          clearInterval(interval)
        }
      }
    }, 200)
    // Stop polling after 10 seconds if script never loaded
    const timeout = setTimeout(() => clearInterval(interval), 10000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
      if (widgetId && window.turnstile) {
        try { window.turnstile.remove(widgetId) } catch (e) { /* noop */ }
      }
    }
  }, [])

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Block submission if Turnstile didn't pass. Real users always get a
    // token (even with the invisible/managed widget — Cloudflare handles
    // it silently). No token = bot or browser blocking the script.
    if (!turnstileToken) {
      setError('Please wait for the security check to complete, then try again.')
      setLoading(false)
      return
    }

    // Sign up via our custom edge function. This bypasses Supabase's
    // project-wide CAPTCHA Protection (which would also force CAPTCHA on
    // login + password reset). Our edge function:
    //   1. Verifies Turnstile token with Cloudflare server-side
    //   2. Creates the user via admin API (auto-confirms email — Stripe
    //      payment is the real verification anyway)
    //   3. Inserts the groomers row
    //   4. Returns user_id so we can pass it to Stripe checkout
    const { data: fnData, error: signUpError } = await supabase.functions.invoke(
      'signup-groomer-with-captcha',
      {
        body: {
          email,
          password,
          full_name: fullName,
          business_name: businessName,
          turnstile_token: turnstileToken,
        },
      }
    )

    if (signUpError) {
      setError(signUpError.message || 'Could not sign up — please try again.')
      setLoading(false)
      return
    }
    if (fnData?.error) {
      setError(fnData.error)
      setLoading(false)
      return
    }
    if (!fnData?.user_id) {
      setError('Signup succeeded but no user ID returned. Please try signing in.')
      setLoading(false)
      return
    }

    // Fire Google Ads conversion event so Google can attribute this signup
    // to whichever ad click brought them here. The actual conversion label
    // gets configured in Google Ads → Tools → Conversions later — for now
    // this fires a generic 'sign_up' event the algorithm can learn from.
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'sign_up', {
          send_to: 'AW-18122010108',
          method: 'email',
        })
      } catch (e) { /* never block signup over a tracking call */ }
    }

    // Forward to Stripe checkout with their UUID attached. The webhook
    // will match the payment back to this groomer row via client_reference_id.
    if (tierFromUrl && PAYMENT_LINKS[tierFromUrl]) {
      window.location.href =
        PAYMENT_LINKS[tierFromUrl] + '?client_reference_id=' + fnData.user_id
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-container">
          <h1>PetPro</h1>
          <p className="success-message">
            Account created! Check your email to confirm, then sign in.
          </p>
          <Link to="/login" className="link-button">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>PetPro</h1>
        <p>Create Your Groomer Account</p>
        <form onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="Your Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Business Name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {/* Cloudflare Turnstile bot check — Managed mode means it's
              usually invisible (just shows briefly if Cloudflare suspects
              suspicious behavior). The div is empty until the script
              renders the widget into it via window.turnstile.render. */}
          <div
            ref={turnstileWidgetRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '12px 0',
              minHeight: '65px',  // reserves space so the form doesn't jump
            }}
          ></div>

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !turnstileToken}>
            {loading
              ? 'Creating Account...'
              : !turnstileToken
                ? 'Loading security check…'
                : 'Create Account'}
          </button>
        </form>
        <p className="switch-auth">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
        <p style={{
          marginTop: '24px',
          fontSize: '12px',
          color: '#888',
          textAlign: 'center',
          lineHeight: '1.5'
        }}>
          By signing up, you agree to our{' '}
          <Link to="/terms" style={{ color: '#888', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}and{' '}
          <Link to="/privacy" style={{ color: '#888', textDecoration: 'underline' }}>Privacy Policy</Link>.
          <br />
          © 2026 Pamperedlittlepaws LLC
        </p>
      </div>
    </div>
  )
}
