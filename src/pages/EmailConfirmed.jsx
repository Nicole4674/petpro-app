// =======================================================
// PetPro — Email Confirmed landing page (Public)
// URL: /portal/confirmed
// Where Supabase redirects clients AFTER they click the
// email verification link. Replaces the previous blank
// "page not found" UX with a clear success screen + CTA
// to log in.
// =======================================================
import { Link } from 'react-router-dom'

export default function EmailConfirmed() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: '#fff',
        borderRadius: '16px',
        padding: '48px 32px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
      }}>
        {/* Big green check circle */}
        <div style={{
          width: '88px',
          height: '88px',
          margin: '0 auto 20px',
          borderRadius: '50%',
          background: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '48px'
        }}>
          ✅
        </div>

        <h1 style={{
          margin: '0 0 12px',
          fontSize: '28px',
          fontWeight: '800',
          color: '#111827'
        }}>
          Email Confirmed!
        </h1>

        <p style={{
          margin: '0 0 28px',
          color: '#6b7280',
          fontSize: '16px',
          lineHeight: '1.6'
        }}>
          Your account is ready. Log in to manage your pets, see upcoming appointments, and chat with your groomer.
        </p>

        <Link
          to="/portal/login"
          style={{
            display: 'inline-block',
            padding: '14px 36px',
            background: '#7c3aed',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '16px',
            boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)'
          }}
        >
          Log in to your portal →
        </Link>

        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '1px solid #f3f4f6',
          fontSize: '13px',
          color: '#9ca3af'
        }}>
          🐾 PetPro
        </div>
      </div>
    </div>
  )
}
