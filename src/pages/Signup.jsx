import { useState, useEffect } from 'react'
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

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Sign up with Supabase auth
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          business_name: businessName,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Create groomer profile in database
    if (data.user) {
      const { error: profileError } = await supabase
        .from('groomers')
        .insert({
          id: data.user.id,
          email: email,
          full_name: fullName,
          business_name: businessName,
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
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

      // If they came from a pricing tile (?tier=pro etc.), forward them
      // straight to Stripe checkout with their UUID attached. The webhook
      // will match the payment back to this groomer row via client_reference_id.
      if (tierFromUrl && PAYMENT_LINKS[tierFromUrl]) {
        window.location.href =
          PAYMENT_LINKS[tierFromUrl] + '?client_reference_id=' + data.user.id
        return
      }
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
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
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
