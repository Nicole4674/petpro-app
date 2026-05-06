// =============================================================================
// WalkthroughGuide.jsx — Post-onboarding guided tour for new groomers
// =============================================================================
// Mounted globally in App.jsx. Activates when localStorage.petpro_walkthrough_step
// is set (1-6). Shows a floating Suds-led tooltip explaining the current page
// and pointing to where they should look. Advances through pages by user action.
//
// Steps:
//   1. Calendar       — "Click + New Appointment to book your first one"
//   2. Calendar       — "Tap any appointment to see check-in / payment / etc."
//   3. Dashboard      — "Your shop's heartbeat — revenue, stats, alerts"
//   4. Shop Settings  — "Configure hours, services, SMS, payments here"
//   5. Suds widget    — "I'm always in the corner — just call me anytime"
//   6. Done           — "You're a pro! 🎉"
//
// User can dismiss anytime via "Skip walkthrough" → clears localStorage.
// =============================================================================

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const STEPS = [
  {
    id: 1,
    pathHint: '/calendar',
    title: '👋 Let\'s book your first appointment!',
    body: 'You\'re on your Calendar — this is where every booking lives. To create your first one, look for the bright "+ New Appointment" button (top-right area). Suds AI can also book for you — just say "book Bella for a bath next Tuesday."',
    cta: 'Got it — show me the dashboard next',
    nextPath: '/',
  },
  {
    id: 2,
    pathHint: '/',
    title: '📊 This is your Dashboard',
    body: 'Your shop at-a-glance. Today\'s revenue, upcoming appointments, alerts when clients book or reschedule, and Suds nudges when something needs your attention.',
    cta: 'Show me Shop Settings next',
    nextPath: '/settings',
  },
  {
    id: 3,
    pathHint: '/settings',
    title: '⚙️ Shop Settings',
    body: 'Your control center. Hours, services, prices, SMS templates, payment policies, agreements, branding, notifications — it all lives here. Tweak anytime.',
    cta: 'How do I get help anytime?',
    nextPath: null,  // stay on settings, just advance to next step
  },
  {
    id: 4,
    pathHint: null,  // any page
    title: '🦦 Suds is always here',
    body: 'See me floating in the corner? That\'s your AI buddy. Click me, type to me, talk to me — I can book appointments, explain features, look up clients, summarize your day, and a bunch more. Just say "Suds" or "PetPro."',
    cta: 'I\'m ready to roll!',
    nextPath: null,  // final step, just dismiss
  },
]

const STORAGE_KEY = 'petpro_walkthrough_step'

export default function WalkthroughGuide() {
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()

  // Read step from localStorage on mount + listen for changes
  useEffect(function () {
    function read() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY)
        var n = raw ? parseInt(raw, 10) : 0
        if (isNaN(n) || n < 0) n = 0
        setCurrentStep(n)
      } catch (e) {
        setCurrentStep(0)
      }
    }
    read()
    function onStorage(e) {
      if (e.key === STORAGE_KEY) read()
    }
    window.addEventListener('storage', onStorage)
    // Also poll briefly in case localStorage was set in same tab without storage event
    var poll = setInterval(read, 1000)
    return function () {
      window.removeEventListener('storage', onStorage)
      clearInterval(poll)
    }
  }, [])

  if (!currentStep || currentStep < 1 || currentStep > STEPS.length) return null
  var step = STEPS[currentStep - 1]
  if (!step) return null

  function advance() {
    var next = currentStep + 1
    if (next > STEPS.length) {
      // Done — clear flag
      try { window.localStorage.removeItem(STORAGE_KEY) } catch (e) {}
      setCurrentStep(0)
      return
    }
    try { window.localStorage.setItem(STORAGE_KEY, String(next)) } catch (e) {}
    setCurrentStep(next)
    var nextStep = STEPS[next - 1]
    if (nextStep && nextStep.nextPath && location.pathname !== nextStep.pathHint) {
      // Navigate to the next page if not already there
      navigate(nextStep.pathHint || '/')
    }
  }

  function skip() {
    if (!window.confirm('Skip the rest of the walkthrough?\n\nYou can always come back to it later — just open Suds and ask "show me around."')) return
    try { window.localStorage.removeItem(STORAGE_KEY) } catch (e) {}
    setCurrentStep(0)
  }

  // If current step has a path hint and we're on a different page, nudge them
  // (don't auto-navigate — could be jarring; just show the message + button)
  var onWrongPage = step.pathHint && location.pathname !== step.pathHint

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(540px, calc(100vw - 32px))',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)',
        border: '2px solid #c4b5fd',
        borderRadius: '16px',
        padding: '18px 20px 16px',
        boxShadow: '0 10px 40px rgba(124, 58, 237, 0.25)',
        zIndex: 9500,
        animation: 'wgFadeIn 0.4s ease-out',
      }}
    >
      {/* Step indicator + skip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', letterSpacing: '1px', textTransform: 'uppercase' }}>
          🦦 Walkthrough · Step {currentStep} of {STEPS.length}
        </span>
        <button
          onClick={skip}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Skip walkthrough
        </button>
      </div>

      {/* Title */}
      <div style={{ fontSize: '16px', fontWeight: 800, color: '#1f2937', marginBottom: '6px' }}>
        {step.title}
      </div>

      {/* Body */}
      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.55, marginBottom: '14px' }}>
        {step.body}
      </div>

      {/* On-wrong-page hint */}
      {onWrongPage && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#92400e',
        }}>
          💡 Heads up — this tip is about a different page. Click the button below and I'll take you there.
        </div>
      )}

      {/* CTA */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={advance}
          style={{
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {step.cta} →
        </button>
      </div>

      {/* Local keyframe so this component is fully self-contained */}
      <style>{`
        @keyframes wgFadeIn {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}
