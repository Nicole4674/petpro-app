// =============================================================================
// Onboarding — new-shop setup wizard (8 steps)
// =============================================================================
// Fires for fresh groomers right after their first paid login. Walks them
// through everything they need to set up their shop:
//   1. Welcome + migration check  ←  routes to Suds in migration mode if yes
//   2. Shop info (name, address, phone, timezone)
//   3. Business hours
//   4. Services + pricing
//   5. Staff
//   6. Boarding
//   7. Stripe Connect (payments)
//   8. Done — you're set!
//
// Skippable from any step (writes onboarding_step + onboarding_completed_at).
// Suds floats in the corner the whole time and pops step-specific tips.
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatPhoneOnInput } from '../lib/phone'
import AddressInput from '../components/AddressInput'

// Common US timezones for the picker (matches what ShopSettings uses)
const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (New York)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Phoenix',     label: 'Mountain - No DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage',   label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (Honolulu)' },
  { value: 'America/Toronto',     label: 'Canada Eastern (Toronto)' },
  { value: 'America/Vancouver',   label: 'Canada Pacific (Vancouver)' },
]

// Auto-detect the browser's timezone so we can pre-select sanely
function detectTimezone() {
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (TIMEZONES.some(function (t) { return t.value === tz })) return tz
  } catch (e) { /* fall through */ }
  return 'America/Chicago'  // safe default
}

// Common services groomers offer — used as the pre-built menu in Step 4.
// Pricing is industry-typical mid-range; users can edit before inserting.
const COMMON_SERVICES = [
  { id: 'fg_small',  service_name: 'Full Groom — Small',  category: 'full_groom',  price: 50,  time: 60,  weight_min: 0,  weight_max: 20, hint: 'Under 20 lbs' },
  { id: 'fg_medium', service_name: 'Full Groom — Medium', category: 'full_groom',  price: 65,  time: 90,  weight_min: 20, weight_max: 50, hint: '20-50 lbs' },
  { id: 'fg_large',  service_name: 'Full Groom — Large',  category: 'full_groom',  price: 80,  time: 120, weight_min: 50, weight_max: 90, hint: '50-90 lbs' },
  { id: 'fg_xl',     service_name: 'Full Groom — XL',     category: 'full_groom',  price: 100, time: 150, weight_min: 90, weight_max: null, hint: '90+ lbs' },
  { id: 'bath',      service_name: 'Bath & Tidy',         category: 'bath',        price: 35,  time: 45,  weight_min: null, weight_max: null, hint: 'Bath, brush, ear/nail trim' },
  { id: 'nail',      service_name: 'Nail Trim',           category: 'nail_trim',   price: 15,  time: 15,  weight_min: null, weight_max: null, hint: 'Walk-in friendly' },
  { id: 'teeth',     service_name: 'Teeth Brushing',      category: 'add_on',      price: 10,  time: 10,  weight_min: null, weight_max: null, hint: 'Add-on service' },
  { id: 'deshed',    service_name: 'De-shed Treatment',   category: 'add_on',      price: 25,  time: 30,  weight_min: null, weight_max: null, hint: 'Add-on for heavy coats' },
  { id: 'puppy',     service_name: 'Puppy Intro',         category: 'puppy_intro', price: 40,  time: 45,  weight_min: null, weight_max: null, hint: 'Under 6 months — gentle first visit' },
]

const TOTAL_STEPS = 8

// Step labels for the progress bar
const STEP_LABELS = [
  'Welcome',           // 1
  'Shop Info',         // 2
  'Hours',             // 3
  'Services',          // 4
  'Staff',             // 5
  'Boarding',          // 6
  'Payments',          // 7
  'You\'re Set!',      // 8
]

export default function Onboarding() {
  const navigate = useNavigate()

  // ─── Auth + load existing progress ───
  const [userId, setUserId] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // ─── Wizard state ───
  // currentStep is 1-indexed (1-8) to match what users see in the progress bar
  const [currentStep, setCurrentStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // ─── Form data — accumulates across steps, saved to shop_settings ───
  // Each step writes its own subset on Continue.
  const [migrationSource, setMigrationSource] = useState('')   // step 1
  // Step 2 — shop info
  const [shopName, setShopName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [waitlistTimezone, setWaitlistTimezone] = useState(detectTimezone())
  // Step 3 — business hours (free-text, matches existing shop_settings.hours)
  const [hours, setHours] = useState('')

  // Step 4 — services. selectedServices is a map of service-template-id → { enabled, price, time }
  // Templates are defined in COMMON_SERVICES below. They get inserted into the
  // services table (real rows) on Continue if checked.
  const [selectedServices, setSelectedServices] = useState({})
  const [existingServiceCount, setExistingServiceCount] = useState(0)

  // Step 5 — staff: solo or team
  const [staffMode, setStaffMode] = useState('solo')   // 'solo' or 'team'

  // Step 6 — boarding
  const [offersBoarding, setOffersBoarding] = useState(false)
  const [kennelCounts, setKennelCounts] = useState({ small: 0, medium: 0, large: 0, xl: 0 })

  // Step 7 — Stripe Connect (read-only — we just check if they're already connected)
  const [stripeConnected, setStripeConnected] = useState(false)

  // On mount: get user, load existing progress (in case they bailed mid-wizard)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        if (cancelled) return
        setUserId(user.id)

        const { data, error } = await supabase
          .from('shop_settings')
          .select('onboarding_step, onboarding_completed_at, onboarding_migration_source, shop_name, phone, address, hours, waitlist_timezone')
          .eq('groomer_id', user.id)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          console.error('[Onboarding] load error:', error)
          setLoaded(true)
          return
        }

        // If they're already done, kick them to the dashboard
        if (data && data.onboarding_completed_at) {
          navigate('/')
          return
        }

        // Resume on the step they left off on (clamped to valid range)
        if (data && typeof data.onboarding_step === 'number' && data.onboarding_step > 0) {
          setCurrentStep(Math.min(Math.max(data.onboarding_step, 1), TOTAL_STEPS))
        }
        if (data && data.onboarding_migration_source) {
          setMigrationSource(data.onboarding_migration_source)
        }
        // Pre-fill any fields they've already entered (matches what ShopSettings would show)
        if (data && data.shop_name) setShopName(data.shop_name)
        if (data && data.phone) setPhone(data.phone)
        if (data && data.address) setAddress(data.address)
        if (data && data.hours) setHours(data.hours)
        if (data && data.waitlist_timezone) setWaitlistTimezone(data.waitlist_timezone)

        // ─── Step 4 — count existing services so we can show "you already have X" ───
        try {
          const { count } = await supabase
            .from('services')
            .select('id', { count: 'exact', head: true })
            .eq('groomer_id', user.id)
          if (!cancelled && typeof count === 'number') setExistingServiceCount(count)
        } catch (e) { /* non-critical */ }

        // ─── Step 7 — check if they've already connected Stripe ───
        try {
          const { data: gData } = await supabase
            .from('groomers')
            .select('stripe_account_id, stripe_charges_enabled')
            .eq('id', user.id)
            .maybeSingle()
          if (!cancelled && gData && gData.stripe_account_id && gData.stripe_charges_enabled) {
            setStripeConnected(true)
          }
        } catch (e) { /* non-critical */ }

        setLoaded(true)
      } catch (e) {
        console.error('[Onboarding] mount error:', e)
        setLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [navigate])

  // ─── Persistence helper — upserts shop_settings row with the current step + any extra fields ───
  async function saveProgress(step, extraFields) {
    if (!userId) return { ok: false }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        groomer_id: userId,
        onboarding_step: step,
        ...(extraFields || {}),
      }
      const { error: upErr } = await supabase
        .from('shop_settings')
        .upsert(payload, { onConflict: 'groomer_id' })
      if (upErr) throw upErr
      return { ok: true }
    } catch (e) {
      console.error('[Onboarding] saveProgress error:', e)
      setError(e.message || 'Could not save progress. Try again.')
      return { ok: false, error: e }
    } finally {
      setSaving(false)
    }
  }

  // ─── Mark wizard fully complete + go to dashboard ───
  async function finishWizard() {
    if (!userId) return
    setSaving(true)
    try {
      await supabase
        .from('shop_settings')
        .upsert({
          groomer_id: userId,
          onboarding_step: TOTAL_STEPS,
          onboarding_completed_at: new Date().toISOString(),
        }, { onConflict: 'groomer_id' })
      navigate('/')
    } catch (e) {
      console.error('[Onboarding] finishWizard error:', e)
      setError('Could not save. Try again.')
      setSaving(false)
    }
  }

  // ─── Skip-the-rest button: marks wizard complete now, sends to dashboard ───
  async function skipAll() {
    if (!confirm('Skip the rest of setup? You can finish anytime from Shop Settings.')) return
    await finishWizard()
  }

  // ─── Continue / Back navigation ───
  async function goNext(extraFields) {
    const next = Math.min(currentStep + 1, TOTAL_STEPS)
    const res = await saveProgress(next, extraFields)
    if (!res.ok) return
    setCurrentStep(next)
  }
  async function goBack() {
    const prev = Math.max(currentStep - 1, 1)
    setCurrentStep(prev)
  }

  // ─── Per-step Continue handler — gathers the right fields for THIS step,
  //     validates lightly, and calls goNext with the payload. ───
  async function handleContinueFromCurrentStep() {
    if (currentStep === 2) {
      // Shop Info — shop_name is the only required field
      if (!shopName || !shopName.trim()) {
        setError('Please enter your shop name to continue.')
        return
      }
      await goNext({
        shop_name: shopName.trim(),
        phone: phone || null,
        address: address || null,
        waitlist_timezone: waitlistTimezone || 'America/Chicago',
      })
    } else if (currentStep === 3) {
      // Business Hours — optional, but encourage filling it in
      await goNext({ hours: hours ? hours.trim() : null })
    } else if (currentStep === 4) {
      // Services — insert each checked one as a real services row
      await handleStep4Services()
    } else if (currentStep === 5) {
      // Staff — just advance, nothing to write (it's informational)
      await goNext()
    } else if (currentStep === 6) {
      // Boarding — if they offer it, create the kennels
      await handleStep6Boarding()
    } else if (currentStep === 7) {
      // Stripe Connect — Continue just advances; the actual connect happens via the inline button
      await goNext()
    } else {
      await goNext()
    }
  }

  // ─── Step 4: insert checked services as real rows in the services table ───
  async function handleStep4Services() {
    const checkedIds = Object.keys(selectedServices).filter(id => selectedServices[id] && selectedServices[id].enabled)
    if (checkedIds.length === 0) {
      // Nothing checked — that's fine, just advance
      await goNext()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const rows = checkedIds.map((id, idx) => {
        const tpl = COMMON_SERVICES.find(s => s.id === id)
        const sel = selectedServices[id] || {}
        return {
          groomer_id: userId,
          service_name: tpl.service_name,
          category: tpl.category,
          price: parseFloat(sel.price != null ? sel.price : tpl.price),
          price_type: 'fixed',
          time_block_minutes: parseInt(sel.time != null ? sel.time : tpl.time, 10) || tpl.time,
          weight_min: tpl.weight_min,
          weight_max: tpl.weight_max,
          sort_order: existingServiceCount + idx,
        }
      })
      const { error: insErr } = await supabase.from('services').insert(rows)
      if (insErr) throw insErr
      // Bump count locally so a back→forward doesn't insert dupes immediately
      setExistingServiceCount(existingServiceCount + rows.length)
      // Clear selection so re-entering Step 4 doesn't show them as still-checked
      setSelectedServices({})
      await goNext()
    } catch (e) {
      console.error('[Onboarding] step 4 error:', e)
      setError('Could not save services: ' + (e.message || 'unknown error'))
      setSaving(false)
    }
  }

  // ─── Step 6: if boarding is offered, create the kennels ───
  async function handleStep6Boarding() {
    if (!offersBoarding) {
      // Skip — they don't board. Just advance.
      await goNext()
      return
    }

    const totalKennels = (kennelCounts.small || 0) + (kennelCounts.medium || 0) + (kennelCounts.large || 0) + (kennelCounts.xl || 0)
    if (totalKennels === 0) {
      // They said they offer boarding but didn't fill in counts — let them through anyway
      await goNext()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const rows = []
      const sizes = [
        { key: 'small',  label: 'Small',  base_price: 35 },
        { key: 'medium', label: 'Medium', base_price: 45 },
        { key: 'large',  label: 'Large',  base_price: 55 },
        { key: 'xl',     label: 'XL',     base_price: 65 },
      ]
      let order = 0
      sizes.forEach(s => {
        const count = kennelCounts[s.key] || 0
        for (let i = 1; i <= count; i++) {
          rows.push({
            groomer_id: userId,
            name: `${s.label} ${i}`,
            size_label: s.label,
            base_price: s.base_price,
            default_capacity: 1,
            display_order: order++,
          })
        }
      })
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('kennels').insert(rows)
        if (insErr) throw insErr
      }
      await goNext()
    } catch (e) {
      console.error('[Onboarding] step 6 error:', e)
      setError('Could not save kennels: ' + (e.message || 'unknown error'))
      setSaving(false)
    }
  }

  // ─── Step 7: Stripe Connect — opens onboarding in a new tab ───
  async function startStripeOnboarding() {
    setSaving(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('stripe-connect-onboard', {})
      if (fnErr) throw fnErr
      if (data && data.url) {
        // Open Stripe in a new tab so they don't lose the wizard
        window.open(data.url, '_blank', 'noopener')
      } else {
        throw new Error('No onboarding URL returned')
      }
    } catch (e) {
      console.error('[Onboarding] stripe onboarding error:', e)
      setError('Could not start Stripe setup. You can do this later from Shop Settings → Payments.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Step 1 special-case: if they say "yes I'm migrating", we exit
  //     the wizard, fire Suds in migration mode, and go to the dashboard. ───
  async function handleMigrationYes(source) {
    setMigrationSource(source)
    // Save the source + mark wizard "complete" (they'll set up via Suds chat)
    await supabase
      .from('shop_settings')
      .upsert({
        groomer_id: userId,
        onboarding_step: 1,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_migration_source: source,
      }, { onConflict: 'groomer_id' })

    // Navigate to dashboard, then fire Suds in migration mode after the page loads
    navigate('/')
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('petpro:start-migration', { detail: { source } })) }
      catch (e) { /* noop */ }
    }, 600)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render — full-screen overlay with header, step body, footer nav
  // ────────────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div style={overlayStyle}>
        <div style={{ color: '#fff', fontSize: '15px' }}>Loading your shop...</div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* ─── Progress header ─── */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Step {currentStep} of {TOTAL_STEPS} · {STEP_LABELS[currentStep - 1]}
            </span>
            <button
              onClick={skipAll}
              disabled={saving}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              title="Skip the rest of setup — you can finish later from Shop Settings"
            >
              Skip for now
            </button>
          </div>
          <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              width: ((currentStep / TOTAL_STEPS) * 100) + '%',
              height: '100%',
              background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {/* ─── Step body ─── */}
        <div style={{ minHeight: '320px' }}>
          {currentStep === 1 && (
            <Step1Welcome
              onYesMigration={handleMigrationYes}
              onNoStartFresh={() => goNext({ onboarding_migration_source: null })}
              saving={saving}
            />
          )}
          {currentStep === 2 && (
            <Step2ShopInfo
              shopName={shopName} setShopName={setShopName}
              phone={phone} setPhone={setPhone}
              address={address} setAddress={setAddress}
              waitlistTimezone={waitlistTimezone} setWaitlistTimezone={setWaitlistTimezone}
            />
          )}
          {currentStep === 3 && (
            <Step3Hours hours={hours} setHours={setHours} />
          )}
          {currentStep === 4 && (
            <Step4Services
              selectedServices={selectedServices}
              setSelectedServices={setSelectedServices}
              existingCount={existingServiceCount}
            />
          )}
          {currentStep === 5 && (
            <Step5Staff staffMode={staffMode} setStaffMode={setStaffMode} />
          )}
          {currentStep === 6 && (
            <Step6Boarding
              offersBoarding={offersBoarding} setOffersBoarding={setOffersBoarding}
              kennelCounts={kennelCounts} setKennelCounts={setKennelCounts}
            />
          )}
          {currentStep === 7 && (
            <Step7Stripe
              stripeConnected={stripeConnected}
              onStartConnect={startStripeOnboarding}
              saving={saving}
            />
          )}
          {currentStep === 8 && (
            <Step8Done onFinish={finishWizard} saving={saving} />
          )}
        </div>

        {/* ─── Error banner ─── */}
        {error && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '13px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ─── Footer navigation (hidden on step 1, which has its own buttons, and step 8) ─── */}
        {currentStep > 1 && currentStep < TOTAL_STEPS && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f3f4f6' }}>
            <button
              onClick={goBack}
              disabled={saving}
              style={btnSecondaryStyle}
            >
              ← Back
            </button>
            <button
              onClick={handleContinueFromCurrentStep}
              disabled={saving}
              style={btnPrimaryStyle}
            >
              {saving ? 'Saving...' : 'Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════ STEP 1 — Welcome + migration check ════════════
function Step1Welcome({ onYesMigration, onNoStartFresh, saving }) {
  const [showMigrationOptions, setShowMigrationOptions] = useState(false)

  if (!showMigrationOptions) {
    // Initial welcome screen
    return (
      <div style={{ textAlign: 'center', padding: '20px 10px' }}>
        <img
          src="/suds-waving.png"
          alt="Suds waving hello"
          style={{ width: '140px', height: 'auto', margin: '0 auto 16px', display: 'block' }}
        />
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>
          Welcome to PetPro!
        </h1>
        <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: 1.6, maxWidth: '460px', margin: '0 auto 24px' }}>
          I'm Suds 🦦 — your AI booking buddy. I'll walk you through 8 quick steps to get your shop set up. Most groomers finish in under 10 minutes.
        </p>

        <div style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: '12px',
          padding: '18px 20px',
          maxWidth: '460px',
          margin: '0 auto 20px',
          textAlign: 'left',
        }}>
          <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: '6px', fontSize: '14px' }}>
            Quick question first:
          </div>
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}>
            Are you coming from another grooming software (MoeGo, Gingr, Pawfinity, paper notebook, spreadsheet, etc.)?
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowMigrationOptions(true)}
            disabled={saving}
            style={{ ...btnPrimaryStyle, minWidth: '180px' }}
          >
            Yes, I'm switching →
          </button>
          <button
            onClick={onNoStartFresh}
            disabled={saving}
            style={{ ...btnSecondaryStyle, minWidth: '180px' }}
          >
            {saving ? 'Saving...' : 'No, brand new shop'}
          </button>
        </div>
      </div>
    )
  }

  // Migration source picker
  const sources = [
    { id: 'moego', label: 'MoeGo' },
    { id: 'gingr', label: 'Gingr' },
    { id: 'pawfinity', label: 'Pawfinity' },
    { id: 'propet', label: 'ProPet' },
    { id: 'easy_busy_pets', label: 'Easy Busy Pets' },
    { id: '123pet', label: '123Pet' },
    { id: 'daysmart', label: 'Daysmart Pet' },
    { id: 'spreadsheet', label: 'Spreadsheet (Excel/Sheets)' },
    { id: 'paper', label: 'Paper notebook' },
    { id: 'other', label: 'Something else' },
  ]

  return (
    <div style={{ padding: '20px 10px' }}>
      <img
        src="/suds-thinking.png"
        alt="Suds thinking"
        style={{ width: '90px', height: 'auto', margin: '0 auto 12px', display: 'block' }}
      />
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', textAlign: 'center', margin: '0 0 8px' }}>
        Where are you coming from?
      </h2>
      <p style={{ fontSize: '14px', color: '#6b7280', textAlign: 'center', margin: '0 0 20px' }}>
        Pick one and I'll switch into Migration Mode — I'll walk you through importing your clients, pets, and history at your pace.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => onYesMigration(s.id)}
            disabled={saving}
            style={{
              padding: '12px 14px',
              border: '1.5px solid #e5e7eb',
              borderRadius: '10px',
              background: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              color: '#374151',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              if (saving) return
              e.currentTarget.style.borderColor = '#7c3aed'
              e.currentTarget.style.background = '#faf5ff'
              e.currentTarget.style.color = '#5b21b6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.background = '#fff'
              e.currentTarget.style.color = '#374151'
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => setShowMigrationOptions(false)}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '13px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          ← Actually, I'm not migrating
        </button>
      </div>
    </div>
  )
}

// ════════════ STEP 2 — Shop Info ════════════
function Step2ShopInfo({ shopName, setShopName, phone, setPhone, address, setAddress, waitlistTimezone, setWaitlistTimezone }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>Tell me about your shop</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>This shows up on receipts, client emails, and your dashboard. Only the shop name is required.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Shop name */}
        <div>
          <label style={fieldLabelStyle}>Shop name <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="e.g. Paws & Claws Grooming"
            style={fieldInputStyle}
          />
        </div>

        {/* Phone */}
        <div>
          <label style={fieldLabelStyle}>Shop phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneOnInput(e.target.value))}
            placeholder="713-098-3746"
            style={fieldInputStyle}
          />
        </div>

        {/* Address (with autocomplete) */}
        <div>
          <label style={fieldLabelStyle}>Shop address</label>
          <AddressInput
            value={address}
            onChange={setAddress}
            onSelect={({ address: picked }) => setAddress(picked)}
          />
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            Mobile groomer? Use your home base address — clients will see your shop name, not the address.
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label style={fieldLabelStyle}>Your timezone</label>
          <select
            value={waitlistTimezone}
            onChange={(e) => setWaitlistTimezone(e.target.value)}
            style={fieldInputStyle}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            We auto-detected this. We use it so reminders + waitlist offers go out at sensible hours.
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════ STEP 3 — Business Hours ════════════
function Step3Hours({ hours, setHours }) {
  // Quick-fill presets — clicking one populates the textarea instantly
  const presets = [
    { label: 'Mon–Fri 9-5', text: 'Mon–Fri 9 AM–5 PM\nSat–Sun Closed' },
    { label: 'Mon–Sat 8-6', text: 'Mon–Sat 8 AM–6 PM\nSun Closed' },
    { label: 'Tue–Sat 9-7', text: 'Tue–Sat 9 AM–7 PM\nSun–Mon Closed' },
    { label: '7 days a week', text: 'Mon–Sun 9 AM–6 PM' },
    { label: 'Mobile (by appt)', text: 'By appointment only — Mon–Sat 8 AM–6 PM' },
  ]

  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>When are you open?</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Pick a quick-fill below or write your own. Clients see this on your booking page. You can edit anytime in Shop Settings.</p>
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick fill</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => setHours(p.text)}
              style={{
                padding: '8px 14px',
                border: '1.5px solid #e5e7eb',
                borderRadius: '999px',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                color: '#374151',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#7c3aed'
                e.currentTarget.style.background = '#faf5ff'
                e.currentTarget.style.color = '#5b21b6'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.background = '#fff'
                e.currentTarget.style.color = '#374151'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label style={fieldLabelStyle}>Your hours</label>
      <textarea
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder="Mon–Sat 8 AM–6 PM&#10;Sun Closed"
        rows={5}
        style={{ ...fieldInputStyle, resize: 'vertical', fontFamily: 'inherit', minHeight: '120px' }}
      />
      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
        Optional. You can leave this blank and add it later from Shop Settings.
      </div>
    </div>
  )
}

// ════════════ STEP 4 — Services + Pricing ════════════
function Step4Services({ selectedServices, setSelectedServices, existingCount }) {
  function toggle(id) {
    setSelectedServices(prev => {
      const next = { ...prev }
      if (next[id] && next[id].enabled) {
        delete next[id]
      } else {
        const tpl = COMMON_SERVICES.find(s => s.id === id)
        next[id] = { enabled: true, price: tpl.price, time: tpl.time }
      }
      return next
    })
  }
  function updateField(id, field, value) {
    setSelectedServices(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { enabled: true }), [field]: value },
    }))
  }

  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>What services do you offer?</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            Tick what you do and tweak the price/time. You can add more (or edit these) anytime from <strong>Pricing</strong>.
          </p>
        </div>
      </div>

      {existingCount > 0 && (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '14px',
          fontSize: '13px',
          color: '#065f46',
        }}>
          ✅ You already have <strong>{existingCount}</strong> service{existingCount === 1 ? '' : 's'} configured. Anything you check below will be ADDED to that list (no duplicates created automatically — pick wisely).
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {COMMON_SERVICES.map(svc => {
          const checked = !!(selectedServices[svc.id] && selectedServices[svc.id].enabled)
          const sel = selectedServices[svc.id] || {}
          return (
            <div
              key={svc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                border: checked ? '1.5px solid #7c3aed' : '1.5px solid #e5e7eb',
                borderRadius: '10px',
                background: checked ? '#faf5ff' : '#fff',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(svc.id)}
                style={{ width: '18px', height: '18px', accentColor: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '14px' }}>{svc.service_name}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{svc.hint}</div>
              </div>
              {checked && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sel.price != null ? sel.price : svc.price}
                      onChange={(e) => updateField(svc.id, 'price', e.target.value)}
                      style={{ ...fieldInputStyle, width: '70px', padding: '6px 8px', textAlign: 'right' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={sel.time != null ? sel.time : svc.time}
                      onChange={(e) => updateField(svc.id, 'time', e.target.value)}
                      style={{ ...fieldInputStyle, width: '60px', padding: '6px 8px', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>min</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px', textAlign: 'center' }}>
        Don't see something? Add custom services anytime from the <strong>Pricing</strong> page.
      </div>
    </div>
  )
}

// ════════════ STEP 5 — Staff (informational, no DB write) ════════════
function Step5Staff({ staffMode, setStaffMode }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>Are you flying solo or do you have a team?</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            This just helps me give you the right tips. You can add staff anytime from the <strong>Staff List</strong> page.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <button
          onClick={() => setStaffMode('solo')}
          style={{
            padding: '20px 18px',
            border: staffMode === 'solo' ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
            borderRadius: '12px',
            background: staffMode === 'solo' ? '#faf5ff' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>✂️</div>
          <div style={{ fontWeight: 800, color: '#1f2937', fontSize: '15px', marginBottom: '4px' }}>Solo Groomer</div>
          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>
            Just me. PetPro auto-assigns every appointment to me — no staff picker to slow things down.
          </div>
        </button>
        <button
          onClick={() => setStaffMode('team')}
          style={{
            padding: '20px 18px',
            border: staffMode === 'team' ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
            borderRadius: '12px',
            background: staffMode === 'team' ? '#faf5ff' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>👥</div>
          <div style={{ fontWeight: 800, color: '#1f2937', fontSize: '15px', marginBottom: '4px' }}>I have a team</div>
          <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>
            More groomers, bathers, kennel staff. PetPro will ask "who's grooming?" on every booking.
          </div>
        </button>
      </div>

      {staffMode === 'team' && (
        <div style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: '10px',
          padding: '14px 16px',
          fontSize: '13px',
          color: '#5b21b6',
          lineHeight: 1.5,
        }}>
          💡 <strong>Next:</strong> After setup, head to <strong>Staff List</strong> in the sidebar to add your team members. You can set their roles (groomer, bather, kennel), color codes for the calendar, and login access.
        </div>
      )}
    </div>
  )
}

// ════════════ STEP 6 — Boarding ════════════
function Step6Boarding({ offersBoarding, setOffersBoarding, kennelCounts, setKennelCounts }) {
  function updateCount(size, val) {
    var n = parseInt(val, 10)
    if (isNaN(n) || n < 0) n = 0
    if (n > 50) n = 50
    setKennelCounts({ ...kennelCounts, [size]: n })
  }

  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>Do you offer boarding?</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            Overnight stays — separate from grooming. You can configure more details later from <strong>Boarding Setup</strong>.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => setOffersBoarding(false)}
          style={{
            padding: '18px',
            border: !offersBoarding ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
            borderRadius: '12px',
            background: !offersBoarding ? '#faf5ff' : '#fff',
            cursor: 'pointer',
            textAlign: 'center',
            fontWeight: 700,
            color: '#1f2937',
            fontSize: '15px',
          }}
        >
          🚫 No boarding<br />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>Grooming only</span>
        </button>
        <button
          onClick={() => setOffersBoarding(true)}
          style={{
            padding: '18px',
            border: offersBoarding ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
            borderRadius: '12px',
            background: offersBoarding ? '#faf5ff' : '#fff',
            cursor: 'pointer',
            textAlign: 'center',
            fontWeight: 700,
            color: '#1f2937',
            fontSize: '15px',
          }}
        >
          🏠 Yes, I board<br />
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>Set up kennels below</span>
        </button>
      </div>

      {offersBoarding && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            How many kennels do you have?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { key: 'small',  label: 'Small',  hint: 'Up to 25 lbs' },
              { key: 'medium', label: 'Medium', hint: '25-50 lbs' },
              { key: 'large',  label: 'Large',  hint: '50-90 lbs' },
              { key: 'xl',     label: 'XL',     hint: '90+ lbs' },
            ].map(s => (
              <div key={s.key} style={{
                border: '1.5px solid #e5e7eb',
                borderRadius: '10px',
                padding: '12px 14px',
                background: '#fff',
              }}>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '13px' }}>{s.label}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{s.hint}</div>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={kennelCounts[s.key] || 0}
                  onChange={(e) => updateCount(s.key, e.target.value)}
                  style={{ ...fieldInputStyle, padding: '6px 10px', fontSize: '14px' }}
                />
              </div>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
            We'll auto-create kennels named "Small 1", "Small 2", etc. — you can rename them anytime from Boarding Setup.
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════ STEP 7 — Stripe Connect ════════════
function Step7Stripe({ stripeConnected, onStartConnect, saving }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <img src="/suds-thinking.png" alt="Suds" style={{ width: '70px', height: 'auto', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>Set up payments</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            PetPro takes payments through Stripe. Money lands in YOUR bank account — we never touch your funds.
          </p>
        </div>
      </div>

      {stripeConnected ? (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '12px',
          padding: '20px 24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '6px' }}>✅</div>
          <div style={{ fontWeight: 800, color: '#065f46', fontSize: '15px', marginBottom: '4px' }}>
            Stripe is connected!
          </div>
          <div style={{ fontSize: '13px', color: '#047857' }}>
            You're ready to take card payments and get paid out automatically.
          </div>
        </div>
      ) : (
        <div>
          <div style={{
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '16px',
          }}>
            <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: '8px', fontSize: '14px' }}>
              What you'll need (have these handy):
            </div>
            <ul style={{ margin: '0 0 0 18px', padding: 0, color: '#374151', fontSize: '13px', lineHeight: 1.7 }}>
              <li>Your business name, EIN or SSN</li>
              <li>Bank account info (routing + account #)</li>
              <li>About 5 minutes of focused time</li>
            </ul>
          </div>

          <button
            onClick={onStartConnect}
            disabled={saving}
            style={{
              ...btnPrimaryStyle,
              width: '100%',
              padding: '14px 20px',
              fontSize: '15px',
            }}
          >
            {saving ? 'Opening Stripe...' : '💳 Set Up Stripe Payments →'}
          </button>

          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px', textAlign: 'center' }}>
            Opens in a new tab so you don't lose your spot in the wizard. You can also skip and set this up later from <strong>Shop Settings → Payments</strong>.
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════ Placeholder (kept for safety, no longer used) ════════════
function PlaceholderStep({ title }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <img
        src="/suds-thinking.png"
        alt="Suds thinking"
        style={{ width: '90px', height: 'auto', margin: '0 auto 16px', display: 'block' }}
      />
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>
        {title}
      </h2>
    </div>
  )
}

// ════════════ STEP 8 — Done ════════════
function Step8Done({ onFinish, saving }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
      <img
        src="/suds-celebrate.png"
        alt="Suds celebrating"
        style={{ width: '160px', height: 'auto', margin: '0 auto 16px', display: 'block' }}
      />
      <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>
        You're all set!
      </h1>
      <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: 1.6, maxWidth: '460px', margin: '0 auto 28px' }}>
        Your shop's ready to take bookings. I'll be in the corner if you need me — just call my name (Suds or PetPro) anytime.
      </p>

      <button
        onClick={onFinish}
        disabled={saving}
        style={{ ...btnPrimaryStyle, fontSize: '15px', padding: '14px 32px' }}
      >
        {saving ? 'Loading dashboard...' : 'Take me to my dashboard →'}
      </button>
    </div>
  )
}

// ════════════ Shared styles ════════════
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #6b21a8 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  zIndex: 9000,
  overflowY: 'auto',
}

const cardStyle = {
  background: '#fff',
  borderRadius: '20px',
  padding: '32px 36px',
  width: '100%',
  maxWidth: '720px',
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
}

const btnPrimaryStyle = {
  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
}

const btnSecondaryStyle = {
  background: '#fff',
  color: '#374151',
  border: '1.5px solid #d1d5db',
  borderRadius: '10px',
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

const fieldLabelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#374151',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const fieldInputStyle = {
  width: '100%',
  padding: '11px 14px',
  border: '1.5px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  background: '#fff',
  color: '#1f2937',
  boxSizing: 'border-box',
  outline: 'none',
}
