import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  // Detect post-checkout redirect from Stripe — when ?welcome=1 is in the URL
  // (set as the success_url on each Stripe Payment Link), we show a green
  // "Your account is ready!" banner so the new groomer knows they're in the
  // right place to log in.
  const [searchParams] = useSearchParams()
  const showWelcome = searchParams.get('welcome') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-redirect to /reset-password if we see a recovery token in the
  // URL hash (the admin-sent Supabase reset email redirects here by
  // default — Site URL is /portal/login — so we need to catch it on
  // both login pages).
  useEffect(() => {
    if (window.location.hash && window.location.hash.indexOf('type=recovery') !== -1) {
      navigate('/reset-password')
      return
    }
    const subscription = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password')
      }
    })
    return () => {
      if (subscription && subscription.data && subscription.data.subscription) {
        subscription.data.subscription.unsubscribe()
      }
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  // Send a password reset email. Reuses whatever is typed in the
  // email field above. If empty, prompts the groomer to type it first.
  const handleForgotPassword = async () => {
    const emailToReset = (email || '').trim().toLowerCase()
    if (!emailToReset) {
      setError('Type your email above first, then click "Forgot password?".')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailToReset, {
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
      setError('Something went wrong sending the reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>PetPro</h1>
        <p>AI-Powered Pet Grooming & Boarding</p>

        {/* Welcome banner — shows ONCE after a fresh Stripe checkout. The
            Stripe Payment Link's success_url should be:
              https://app.trypetpro.com/login?welcome=1
            so this banner reassures the new groomer they're in the right
            place. The webhook also emails them the same link. */}
        {showWelcome && (
          <div style={{
            margin: '0 0 16px',
            padding: '14px 16px',
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '10px',
            color: '#166534',
            fontSize: '14px',
            lineHeight: '1.5',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 800, marginBottom: '4px' }}>🎉 Welcome to PetPro!</div>
            Your subscription is active. Sign in below with the same email you used at checkout. (We also sent you a welcome email — check your spam folder if you don't see it.)
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Forgot password — sends a Supabase reset email */}
        <p style={{ textAlign: 'center', margin: '12px 0 0' }}>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: '#7c3aed',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              padding: 0,
              textDecoration: 'underline'
            }}
          >
            Forgot password?
          </button>
        </p>

        <p className="switch-auth">
          Don't have an account? <Link to="/plans">Create Account</Link>
        </p>
      </div>
    </div>
  )
}
