import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useSearchParams } from 'react-router-dom'

// Stripe Payment Links (sandbox). Kept in sync with Plans.jsx.
// When we go LIVE, swap these 4 URLs for the live-mode links.
const PAYMENT_LINKS = {
  basic:    'https://buy.stripe.com/test_4gMdRa98G7AzgMQ5U59MY00',
  pro:      'https://buy.stripe.com/test_28E7sMgB8f31cwA4Q19MY01',
  pro_plus: 'https://buy.stripe.com/test_7sY6oI1GedYX548gyJ9MY02',
  growing:  'https://buy.stripe.com/test_bJe9AUet0bQP68ceqB9MY03',
}

export default function Signup() {
  const [searchParams] = useSearchParams()
  const tierFromUrl = searchParams.get('tier')
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
