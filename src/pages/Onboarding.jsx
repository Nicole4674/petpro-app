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
  // Steps 2-7 fields will get added in subsequent iterations.

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
          .select('onboarding_step, onboarding_completed_at, onboarding_migration_source')
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
          {currentStep === 2 && <PlaceholderStep title="Shop Info" />}
          {currentStep === 3 && <PlaceholderStep title="Business Hours" />}
          {currentStep === 4 && <PlaceholderStep title="Services + Pricing" />}
          {currentStep === 5 && <PlaceholderStep title="Staff" />}
          {currentStep === 6 && <PlaceholderStep title="Boarding" />}
          {currentStep === 7 && <PlaceholderStep title="Stripe Connect" />}
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
              onClick={() => goNext()}
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

// ════════════ Placeholder for Steps 2-7 (built in next iterations) ════════════
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
      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
        This step is coming next — for now, click <strong>Continue</strong> to skip ahead, or <strong>Skip for now</strong> to exit.
      </p>
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
