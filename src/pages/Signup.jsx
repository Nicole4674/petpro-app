import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams, Navigate } from 'react-router-dom'
import PasswordInput from '../components/PasswordInput'

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
  // Referral code from a groomer's share link (/signup?ref=THEIRCODE). Optional.
  const refFromUrl = (searchParams.get('ref') || '').trim()

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
  // 'loading' → waiting for Cloudflare · 'ready' → token in hand ·
  // 'failed' → script blocked (Brave/VPN/ad-blocker) or challenge errored.
  // 'failed' switches the UI from a silent dead button to a clear
  // explanation + retry — the #1 ad-money killer was users clicking a
  // disabled button, seeing nothing, and leaving.
  const [turnstileStatus, setTurnstileStatus] = useState('loading')
  const [turnstileRetry, setTurnstileRetry] = useState(0)
  const turnstileWidgetRef = useRef(null)

  // Brave detects itself via navigator.brave — when the security check fails
  // AND we know it's Brave, we can name the culprit instead of guessing.
  const [isBrave, setIsBrave] = useState(false)
  useEffect(() => {
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
        navigator.brave.isBrave().then((yes) => { if (yes) setIsBrave(true) })
      }
    } catch (e) { /* stay quiet */ }
  }, [])

  // Render the Turnstile widget once the script has loaded. We poll briefly
  // because the script tag in index.html is `async defer` — it may not be
  // ready when this component mounts. Once the widget's invisible check
  // passes, the callback fires with a token we attach to the signup payload.
  // Re-runs when turnstileRetry changes (the "Try again" button).
  useEffect(() => {
    let widgetId = null
    setTurnstileStatus('loading')
    setTurnstileToken('')
    const interval = setInterval(() => {
      if (window.turnstile && turnstileWidgetRef.current && !widgetId) {
        try {
          widgetId = window.turnstile.render(turnstileWidgetRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => { setTurnstileToken(token); setTurnstileStatus('ready') },
            'error-callback': () => { setTurnstileToken(''); setTurnstileStatus('failed') },
            'expired-callback': () => setTurnstileToken(''),
          })
          clearInterval(interval)
        } catch (err) {
          console.warn('[Turnstile] render failed:', err)
          clearInterval(interval)
          setTurnstileStatus('failed')
        }
      }
    }, 200)
    // After 10s: if Cloudflare's script never even loaded (Brave shields,
    // VPN, ad-blocker eat it), flip to 'failed' so the user gets an
    // explanation instead of an eternally disabled button. If the widget
    // DID render, we leave it alone — an interactive challenge may simply
    // be waiting for the user, and error-callback covers real failures.
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (!widgetId) setTurnstileStatus('failed')
    }, 10000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
      if (widgetId && window.turnstile) {
        try { window.turnstile.remove(widgetId) } catch (e) { /* noop */ }
      }
    }
  }, [turnstileRetry])

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
          referral_code: refFromUrl || null,
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
        {/* "Trouble signing up?" — moved here from the Plans page. Two paths:
            quick self-fix (different browser) handles ~80% of signup issues;
            the discount path catches real bugs — incentive prevents
            bail-out-in-silence which kills ad ROI. */}
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          textAlign: 'left',
          fontSize: '12px',
          color: '#78350f',
          fontWeight: 600,
          lineHeight: 1.5,
        }}>
          ⚠️ <strong>Trouble signing up?</strong> Try <strong>Chrome, Safari, or Edge</strong> — private/incognito mode and Brave can block our security check. Still stuck? Email{' '}
          <a
            href="mailto:nicole@trypetpro.com?subject=Help%20signing%20up%20for%20PetPro"
            style={{ color: '#7c2d12', textDecoration: 'underline', fontWeight: 800 }}
          >
            nicole@trypetpro.com
          </a>{' '}
          — real bug reports get <strong>30% off your first 3 months</strong> as a thank-you.
        </div>
        {refFromUrl && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: '#ecfdf5', border: '1px solid #86efac', borderRadius: '10px',
            padding: '10px 14px', marginBottom: '14px', textAlign: 'left',
          }}>
            <span style={{ fontSize: '20px' }}>🎁</span>
            <span style={{ fontSize: '13px', color: '#065f46', lineHeight: 1.4 }}>
              You were referred by a fellow groomer — you'll both get <strong>30% off a month</strong> once you're subscribed!
            </span>
          </div>
        )}
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
          <PasswordInput
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
              minHeight: turnstileStatus === 'failed' ? '0px' : '65px',  // reserves space so the form doesn't jump
            }}
          ></div>

          {/* LOUD failure state — replaces the silent forever-disabled button.
              Tells the user WHY nothing is happening + gives them a retry. */}
          {turnstileStatus === 'failed' && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              margin: '0 0 12px',
              fontSize: '13px',
              color: '#991b1b',
              textAlign: 'left',
              lineHeight: 1.55,
            }}>
              {isBrave ? (
                <>
                  <strong>⚠️ Brave is blocking our security check</strong> — that's why the
                  button isn't working. Brave's shields stop Cloudflare from loading.
                  <br />
                  <strong>Fix:</strong> click the 🦁 lion icon in your address bar and turn
                  shields OFF for this site — or open this page in <strong>Chrome or Edge</strong>.
                </>
              ) : (
                <>
                  <strong>⚠️ Our security check couldn't load.</strong> This usually means
                  a VPN, an ad-blocker, or private/incognito mode is blocking it.
                  <br />
                  <strong>Fix:</strong> pause your VPN or ad-blocker for this page, or open
                  this link in <strong>Chrome or Edge</strong> — then try again.
                </>
              )}
              <button
                type="button"
                onClick={() => setTurnstileRetry((n) => n + 1)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '10px',
                  padding: '9px 12px',
                  background: '#fff',
                  color: '#991b1b',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                🔄 Try the security check again
              </button>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !turnstileToken}>
            {loading
              ? 'Creating Account...'
              : turnstileStatus === 'failed'
                ? 'Security check blocked — see above ↑'
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
