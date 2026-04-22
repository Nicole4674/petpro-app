// ====================================================================
// PetPro: Plans / Subscription Pricing Page
// ====================================================================
// Public page (no login required) for prospective customers to compare
// PetPro SaaS tiers. Marketing site (trypetpro.com) links here.
//
// URL: https://app.trypetpro.com/plans
//
// Each "Start Free Trial" button routes to /signup?tier=<tier_slug>
// so the tier is preselected when they sign up.
// ====================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Tier data ────────────────────────────────────────────────────
var TIERS = [
  {
    slug: 'basic',
    emoji: '🐾',
    name: 'Basic',
    price: 70,
    tagline: 'Everything you need to run your shop — manually, your way.',
    trial: '30-day free trial',
    highlight: null,
    highlightColor: null,
    features: [
      'Unlimited clients & pets',
      'Smart calendar & booking',
      'Payment tracking (Cash, Zelle, Venmo, Card)',
      'Outstanding balance tracker',
      'Automated text reminders & rebook nudges',
      'Multi-pet booking',
      'Recurring appointments',
      'Boarding & kennel management',
      'Printable intake & check-in forms',
    ],
  },
  {
    slug: 'pro',
    emoji: '🐾',
    name: 'Pro',
    price: 129,
    tagline: 'Your shop. Your brand. Your client portal.',
    trial: '30-day free trial',
    highlight: null,
    highlightColor: null,
    features: [
      'Everything in Basic',
      'Your branded client portal',
      'Clients view appointments & pet profiles',
      'In-app messaging (no more phone tag)',
      'Online vaccine records + health info',
      'Clients request appointments (you approve)',
    ],
  },
  {
    slug: 'pro_plus',
    emoji: '🤖',
    name: 'Pro+',
    price: 199,
    tagline: 'Meet PetPro AI — your always-on booking assistant.',
    trial: '14-day free trial',
    highlight: 'Most Popular',
    highlightColor: '#7c3aed',
    features: [
      'Everything in Pro',
      'PetPro AI dashboard chat + voice booking 🎙️',
      'Client self-booking AI',
      'Smart AI booking rules (breed / vaccine / allergy)',
      'Auto conflict & double-booking prevention',
      '1,000 AI actions / month',
    ],
  },
  {
    slug: 'growing',
    emoji: '🔥',
    name: 'Growing',
    price: 399,
    tagline: 'Let PetPro AI run the busywork.',
    trial: '14-day free trial',
    highlight: 'Best Value',
    highlightColor: '#f59e0b',
    features: [
      'Everything in Pro+',
      'PetPro AI messages clients FOR you 💬',
      'Smart waitlist — auto-books cancellations',
      'Photo uploads both directions 📸',
      'AI reads vaccine certificates',
      'AI reads chat photos (tangles, skin issues)',
      'Auto-rebook reminder cycles',
      '3,000 AI actions / month',
    ],
  },
  {
    slug: 'enterprise',
    emoji: '🏢',
    name: 'Enterprise',
    price: null, // custom quote
    tagline: 'For busy multi-groomer shops & boarding facilities.',
    trial: 'Custom onboarding',
    highlight: null,
    highlightColor: null,
    features: [
      'Everything in Growing',
      '10,000+ AI actions / month (custom)',
      'Priority support',
      'Dedicated onboarding',
    ],
  },
]

// ─── Comparison table rows ────────────────────────────────────────
// Tier order for the table columns: Basic, Pro, Pro+, Growing, Enterprise
// Each row's `included` array matches that order. "✓" = yes, "—" = no, string = custom value
var COMPARISON_SECTIONS = [
  {
    title: 'Shop Management',
    rows: [
      { feature: 'Unlimited clients & pets', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Smart calendar & booking', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Multi-pet bookings', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Boarding & kennel mgmt', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Payment tracking', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Outstanding balance tracker', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Automated text reminders', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Recurring appointments', included: ['✓', '✓', '✓', '✓', '✓'] },
      { feature: 'Printable intake forms', included: ['✓', '✓', '✓', '✓', '✓'] },
    ],
  },
  {
    title: 'Client Portal',
    rows: [
      { feature: 'Branded client portal', included: ['—', '✓', '✓', '✓', '✓'] },
      { feature: 'Clients view appointments', included: ['—', '✓', '✓', '✓', '✓'] },
      { feature: 'In-app messaging', included: ['—', '✓', '✓', '✓', '✓'] },
      { feature: 'Online vaccine records', included: ['—', '✓', '✓', '✓', '✓'] },
      { feature: 'Health & emergency info', included: ['—', '✓', '✓', '✓', '✓'] },
    ],
  },
  {
    title: '🤖 PetPro AI',
    rows: [
      { feature: 'Dashboard AI chat', included: ['—', '—', '✓', '✓', '✓'] },
      { feature: 'Voice booking 🎙️', included: ['—', '—', '✓', '✓', '✓'] },
      { feature: 'Client self-booking AI', included: ['—', '—', '✓', '✓', '✓'] },
      { feature: 'AI booking rules (breed/vax/allergy)', included: ['—', '—', '✓', '✓', '✓'] },
      { feature: 'Conflict & double-booking prevention', included: ['—', '—', '✓', '✓', '✓'] },
      { feature: 'AI texts clients FOR you 💬', included: ['—', '—', '—', '✓', '✓'] },
      { feature: 'Photo uploads (groomer ↔ client) 📸', included: ['—', '—', '—', '✓', '✓'] },
      { feature: 'AI reads vaccine certs', included: ['—', '—', '—', '✓', '✓'] },
      { feature: 'AI reads chat photos (tangles/skin)', included: ['—', '—', '—', '✓', '✓'] },
      { feature: 'Smart waitlist — auto-books cancellations', included: ['—', '—', '—', '✓', '✓'] },
      { feature: 'Auto-rebook reminder cycles', included: ['—', '—', '—', '✓', '✓'] },
    ],
  },
  {
    title: 'Usage & Support',
    rows: [
      { feature: 'AI actions per month', included: ['—', '—', '1,000', '3,000', '10,000+'] },
      { feature: 'Free trial', included: ['30 days', '30 days', '14 days', '14 days', 'Custom'] },
      { feature: 'Support', included: ['Email', 'Email', 'Email', 'Priority', 'Dedicated'] },
    ],
  },
]

// ─── FAQ ─────────────────────────────────────────────────────────
var FAQS = [
  {
    q: 'What\'s an "AI Action"?',
    a: 'Each time PetPro AI does something for you — answers a question, books an appointment, sends a client text, reads a vaccine photo — that counts as 1 AI action. When you hit your monthly cap, AI features pause until the next billing cycle, or you can upgrade anytime. No surprise bills, ever.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, anytime. Upgrade and the new features unlock instantly. Downgrade and you keep everything until the end of your billing period, then drop to the new tier.',
  },
  {
    q: 'Do I need a credit card for the free trial?',
    a: 'Nope. Basic and Pro give you 30 days, Pro+ and Growing give you 14 days — all with no credit card required. You only add a card when you\'re ready to continue.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'Your account stays active until the end of your paid period. You keep access to all your client and appointment data, even if you downgrade to Basic later.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Everything is stored in secure, encrypted databases. Only you and your team (if you add staff logins) can see your clients and appointments.',
  },
  {
    q: 'Can I import my clients from my old software?',
    a: 'Yes. PetPro has a one-click import tool for CSV files and a migration button that marks your existing clients as "returning" so they don\'t all flag as new.',
  },
  {
    q: 'What if I need more than 3,000 AI actions per month?',
    a: 'That\'s what our Enterprise tier is for — custom AI usage caps built for multi-groomer shops and high-volume boarding facilities. Contact us for a quote.',
  },
]

// ─── Main Component ─────────────────────────────────────────────
export default function Plans() {
  var navigate = useNavigate()
  var [openFaq, setOpenFaq] = useState(null)

  function handleStartTrial(tierSlug) {
    if (tierSlug === 'enterprise') {
      // Enterprise = quote only → route to contact
      window.location.href = 'mailto:nicole@trypetpro.com?subject=Enterprise%20plan%20inquiry'
      return
    }
    navigate('/signup?tier=' + tierSlug)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf5ff', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827' }}>
      {/* ─── Launch Banner ─── */}
      <div style={{
        background: 'linear-gradient(90deg, #7c3aed 0%, #ec4899 100%)',
        color: '#fff',
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: '15px',
        fontWeight: '600',
      }}>
        🎉 <strong>LAUNCH SPECIAL — 50% OFF your first month.</strong>{' '}
        Use code <span style={{ background: 'rgba(255,255,255,0.25)', padding: '2px 10px', borderRadius: '6px', fontFamily: 'monospace', margin: '0 4px' }}>LAUNCH50</span>{' '}
        at checkout. Limited time.
      </div>

      {/* ─── Header ─── */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 24px 30px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '44px', margin: '0 0 12px', fontWeight: '800', letterSpacing: '-0.02em' }}>
          Pick your PetPro plan
        </h1>
        <p style={{ fontSize: '18px', color: '#6b7280', margin: 0, maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto' }}>
          Built by a groomer, for groomers. Start free — no credit card required. Upgrade or downgrade anytime.
        </p>
      </div>

      {/* ─── Tier Cards ─── */}
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '20px 24px 40px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '18px',
      }}>
        {TIERS.map(function (tier) {
          return <TierCard key={tier.slug} tier={tier} onStartTrial={handleStartTrial} />
        })}
      </div>

      {/* ─── Compare all features section ─── */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', textAlign: 'center', margin: '0 0 32px', letterSpacing: '-0.01em' }}>
          Compare all features
        </h2>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '8px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Feature</th>
                <th style={thStyle}>Basic<br /><span style={priceInHeader}>$70</span></th>
                <th style={thStyle}>Pro<br /><span style={priceInHeader}>$129</span></th>
                <th style={{ ...thStyle, color: '#7c3aed' }}>Pro+ ⭐<br /><span style={priceInHeader}>$199</span></th>
                <th style={{ ...thStyle, color: '#f59e0b' }}>Growing 🔥<br /><span style={priceInHeader}>$399</span></th>
                <th style={thStyle}>Enterprise<br /><span style={priceInHeader}>Quote</span></th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_SECTIONS.map(function (section, si) {
                return (
                  <React.Fragment key={si}>
                    <tr>
                      <td colSpan={6} style={{
                        background: '#f9fafb',
                        padding: '14px 16px',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: '#374151',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderTop: '1px solid #e5e7eb',
                        borderBottom: '1px solid #e5e7eb',
                      }}>
                        {section.title}
                      </td>
                    </tr>
                    {section.rows.map(function (row, ri) {
                      return (
                        <tr key={si + '-' + ri}>
                          <td style={featureCellStyle}>{row.feature}</td>
                          {row.included.map(function (val, ci) {
                            return (
                              <td key={ci} style={{
                                ...valueCellStyle,
                                color: val === '✓' ? '#10b981' : val === '—' ? '#d1d5db' : '#111827',
                                fontWeight: val === '✓' ? '700' : (val === '—' ? '400' : '600'),
                                fontSize: val === '✓' || val === '—' ? '18px' : '13px',
                              }}>
                                {val}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── "What's an AI Action?" explainer ─── */}
      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '20px 24px 40px' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}>
          <div style={{ fontSize: '32px', lineHeight: 1 }}>🤖</div>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700' }}>What's an AI Action?</h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
              Each time PetPro AI does something for you — answers a question, books an appointment, sends a message, reads a photo — that's 1 action.
              If you hit your monthly cap, AI features pause until next month or until you upgrade. <strong>No surprise bills, ever.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ─── FAQ ─── */}
      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', textAlign: 'center', margin: '0 0 32px', letterSpacing: '-0.01em' }}>
          Frequently asked questions
        </h2>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>
          {FAQS.map(function (faq, i) {
            var isOpen = openFaq === i
            return (
              <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                <button
                  type="button"
                  onClick={function () { setOpenFaq(isOpen ? null : i) }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '18px 20px',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#111827',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ fontSize: '20px', color: '#7c3aed', transition: 'transform 0.2s', transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 20px 20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.65' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Bottom CTA ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
        color: '#fff',
        padding: '60px 24px',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 12px' }}>
          Ready to try PetPro?
        </h2>
        <p style={{ fontSize: '17px', opacity: 0.95, margin: '0 0 28px' }}>
          Start free — no credit card required.
        </p>
        <button
          onClick={function () { handleStartTrial('pro_plus') }}
          style={{
            padding: '16px 36px',
            background: '#fff',
            color: '#7c3aed',
            border: 'none',
            borderRadius: '999px',
            fontSize: '17px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
        >
          Start your free trial →
        </button>
      </div>

      {/* ─── Footer ─── */}
      <div style={{
        background: '#111827',
        color: '#9ca3af',
        padding: '32px 24px',
        textAlign: 'center',
        fontSize: '13px',
      }}>
        <div style={{ fontWeight: '700', color: '#fff', fontSize: '16px', marginBottom: '8px' }}>🐾 PetPro</div>
        <div>Built by a groomer, for groomers.</div>
        <div style={{ marginTop: '12px' }}>
          <a href="/privacy" style={footerLink}>Privacy</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="/terms" style={footerLink}>Terms</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="mailto:nicole@trypetpro.com" style={footerLink}>Contact</a>
        </div>
      </div>
    </div>
  )
}

// ─── Tier Card component ────────────────────────────────────────
function TierCard({ tier, onStartTrial }) {
  var isHighlighted = !!tier.highlight
  return (
    <div style={{
      background: '#fff',
      border: isHighlighted ? ('2px solid ' + tier.highlightColor) : '1px solid #e5e7eb',
      borderRadius: '16px',
      padding: '24px 20px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: isHighlighted ? '0 10px 40px rgba(124, 58, 237, 0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {tier.highlight && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: tier.highlightColor,
          color: '#fff',
          padding: '4px 14px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
        }}>
          {tier.highlight}
        </div>
      )}

      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{tier.emoji}</div>
      <div style={{ fontSize: '22px', fontWeight: '800', marginBottom: '4px' }}>{tier.name}</div>

      <div style={{ marginBottom: '8px' }}>
        {tier.price !== null ? (
          <>
            <span style={{ fontSize: '34px', fontWeight: '800' }}>${tier.price}</span>
            <span style={{ fontSize: '14px', color: '#6b7280', marginLeft: '4px' }}>/month</span>
          </>
        ) : (
          <span style={{ fontSize: '22px', fontWeight: '800' }}>Custom Quote</span>
        )}
      </div>

      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: '1.45', minHeight: '34px' }}>
        {tier.tagline}
      </p>

      <button
        type="button"
        onClick={function () { onStartTrial(tier.slug) }}
        style={{
          padding: '12px 16px',
          background: isHighlighted ? tier.highlightColor : '#111827',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          marginBottom: '8px',
        }}
      >
        {tier.slug === 'enterprise' ? 'Contact Sales' : 'Start Free Trial'}
      </button>

      <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginBottom: '16px' }}>
        {tier.trial}
      </div>

      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
        {tier.features.map(function (f, i) {
          return (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#374151', marginBottom: '8px', lineHeight: '1.4' }}>
              <span style={{ color: '#10b981', fontWeight: '700', flexShrink: 0 }}>✓</span>
              <span>{f}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Table styles ──────────────────────────────────────────────
var thStyle = {
  padding: '18px 12px',
  fontSize: '14px',
  fontWeight: '700',
  textAlign: 'center',
  color: '#111827',
  borderBottom: '2px solid #e5e7eb',
  background: '#fff',
}

var priceInHeader = {
  fontSize: '12px',
  fontWeight: '500',
  color: '#6b7280',
}

var featureCellStyle = {
  padding: '12px 16px',
  fontSize: '13px',
  color: '#374151',
  borderBottom: '1px solid #f3f4f6',
  textAlign: 'left',
}

var valueCellStyle = {
  padding: '12px 8px',
  textAlign: 'center',
  borderBottom: '1px solid #f3f4f6',
}

var footerLink = {
  color: '#9ca3af',
  textDecoration: 'none',
}

// React import shim for older JSX transforms that need React in scope for Fragment
import React from 'react'
