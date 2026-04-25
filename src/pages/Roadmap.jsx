// ====================================================================
// PetPro — Roadmap / "What's Coming Soon" page
// ====================================================================
// Shows current customers (and prospective ones) what's actively being
// built. Sets expectations + signals an active product.
//
// Three tiers:
//   🛠️  In Development — actively being built, ships in next ~few weeks
//   📋  Planned        — in the pipeline, no firm date yet
//   💭  On the Horizon — bigger features, next quarter+
//
// Edit the ROADMAP_ITEMS array to add/move/remove features. The UI
// updates automatically.
// ====================================================================

import Sidebar from '../components/Sidebar'

const ROADMAP_ITEMS = [
  // 🛠️ In Development — Tier 1 (highest priority, ships first)
  { tier: 'in-dev', emoji: '💳', title: 'Online Payments (Stripe Connect)',
    description: 'Accept card payments directly in PetPro. Send pay-by-text links, take tap-to-pay at checkout, auto-record paid status.',
    badge: 'Pro+' },
  { tier: 'in-dev', emoji: '📝', title: 'Digital Waivers & E-Signature',
    description: 'Grooming, boarding, photo release, and emergency authorization waivers — clients sign on their phone in 30 seconds. Stored per client.',
    badge: null },
  { tier: 'in-dev', emoji: '📸', title: 'Before & After Photos',
    description: 'Attach 2 photos per appointment. Show in pet profile, client portal, and ready to post on social media.',
    badge: null },

  // 📋 Planned — Tier 2 (revenue + retention)
  { tier: 'planned', emoji: '⭐', title: 'Loyalty / Rewards Program',
    description: '"10 grooms = 1 free." Auto-tracks visits, notifies clients when earned, applies discount at checkout.',
    badge: null },
  { tier: 'planned', emoji: '🎁', title: 'Gift Cards',
    description: 'Sell prepaid digital gift cards from your shop. Codes texted/emailed to recipients. Redeem at checkout.',
    badge: null },
  { tier: 'planned', emoji: '🔗', title: 'Referral Program',
    description: 'Unique referral links per client. "Your referral gets 20% off — you get $10 credit." Auto-applied on new client signup.',
    badge: null },
  { tier: 'planned', emoji: '💬', title: 'Review Collection',
    description: 'Auto-prompt happy clients post-groom to leave a review on Google or Yelp. Rotating testimonial widget on your sales page.',
    badge: null },
  { tier: 'planned', emoji: '💉', title: 'Vaccine Expiry Auto-Alerts',
    description: 'Text clients 30 days before vaccines expire. Less day-of cancellations, less liability.',
    badge: null },

  // 💭 On the Horizon — Tier 3 (longer-term)
  { tier: 'horizon', emoji: '📊', title: 'Advanced Analytics & Reports',
    description: 'Revenue trends, service popularity, client retention, staff productivity, breed mix. Export to CSV/PDF for accountants.',
    badge: 'Growing+' },
  { tier: 'horizon', emoji: '🏢', title: 'Multi-Location Dashboard',
    description: 'For shops with 2+ locations. Aggregate view + per-location drill-down. Each location keeps its own staff, schedule, and pricing.',
    badge: 'Growing+' },
  { tier: 'horizon', emoji: '📱', title: 'iOS & Android Apps',
    description: 'Native mobile apps with biometric login, richer push notifications, and App Store presence. Web app keeps working too.',
    badge: null },
]

const TIER_META = {
  'in-dev': { title: '🛠️ In Development', subtitle: 'Actively being built — first to ship this year', accent: '#7c3aed' },
  'planned': { title: '📋 Planned', subtitle: 'Queued up after the In Development list', accent: '#0891b2' },
  'horizon': { title: '💭 On the Horizon', subtitle: 'Bigger builds — landing later in the year', accent: '#94a3b8' },
}

export default function Roadmap() {
  // Group items by tier
  const grouped = { 'in-dev': [], 'planned': [], 'horizon': [] }
  ROADMAP_ITEMS.forEach(item => grouped[item.tier].push(item))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />

      <div style={{ flex: 1, padding: '32px 24px', maxWidth: '880px', margin: '0 auto', width: '100%' }}>
        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: '#fff',
          borderRadius: '20px',
          padding: '32px 28px',
          marginBottom: '28px',
          boxShadow: '0 10px 30px rgba(124, 58, 237, 0.25)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '6px' }}>🚀</div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>
            What's Coming to PetPro
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: '15px', opacity: 0.92, lineHeight: '1.55', maxWidth: '600px' }}>
            Here's what we're building this year. Your subscription gets every one of these as they release — no extra fees, no upgrade pressure.
          </p>
          <p style={{ margin: '14px 0 0', fontSize: '13px', opacity: 0.85 }}>
            Have a feature you want? Email{' '}
            <a href="mailto:nicole@trypetpro.com?subject=PetPro%20Feature%20Request"
               style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}>
              nicole@trypetpro.com
            </a>
          </p>
        </div>

        {/* Tier sections */}
        {['in-dev', 'planned', 'horizon'].map(tier => {
          const items = grouped[tier]
          if (items.length === 0) return null
          const meta = TIER_META[tier]

          return (
            <div key={tier} style={{ marginBottom: '28px' }}>
              <div style={{ marginBottom: '14px', borderLeft: `4px solid ${meta.accent}`, paddingLeft: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#111827' }}>
                  {meta.title}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  {meta.subtitle}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {items.map((item, i) => (
                  <div key={i} style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '14px',
                    padding: '18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                      <div style={{ fontSize: '28px', lineHeight: 1 }}>{item.emoji}</div>
                      {item.badge && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          background: '#ede9fe',
                          color: '#6d28d9',
                          borderRadius: '999px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap',
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#111827', lineHeight: '1.3' }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Footer note */}
        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '14px',
          padding: '18px 22px',
          marginTop: '20px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
            <strong style={{ color: '#111827' }}>How we prioritize:</strong> features get bumped up when more shops ask for them. Your feedback shapes what ships next.
          </div>
        </div>
      </div>
    </div>
  )
}
