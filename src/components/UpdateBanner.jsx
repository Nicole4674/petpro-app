// =============================================================================
// UpdateBanner — soft "new PetPro version available" notification
// =============================================================================
// PetPro deploys daily; users with cached bundles miss bug fixes until they
// refresh. This banner detects new deploys (via /version.json which Vite
// regenerates on every build with the Vercel commit SHA) and offers a
// one-click refresh.
//
// Non-intrusive design:
//   • Bottom-right toast, NOT a blocking modal
//   • User can dismiss with × and keep working
//   • Re-checks when the tab regains focus (catches users who tabbed away)
//   • Polls every 5 minutes — quick enough to be useful, low enough not to
//     hammer the CDN
//
// First load establishes the baseline version. Only subsequent fetches that
// return a DIFFERENT version trigger the banner.
// =============================================================================

import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const initialVersionRef = useRef(null)

  // Helper — fetch /version.json without cache. Cache-busting query param so
  // proxies / browsers can't serve stale.
  async function fetchVersion() {
    try {
      const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      return data && data.version ? String(data.version) : null
    } catch {
      return null
    }
  }

  // Compare the latest version against our baseline. If different, raise the
  // flag. Doesn't lower the flag if a fetch fails — once seen, stays seen.
  async function checkForUpdate() {
    const latest = await fetchVersion()
    if (!latest) return
    if (initialVersionRef.current === null) {
      // First time — establish baseline
      initialVersionRef.current = latest
      return
    }
    if (latest !== initialVersionRef.current) {
      setUpdateAvailable(true)
    }
  }

  useEffect(() => {
    // Initial check on mount establishes the baseline
    checkForUpdate()
    const id = setInterval(checkForUpdate, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // Also re-check when window regains focus — catches users who left the
  // tab open overnight, came back next morning to a fresh deploy.
  useEffect(() => {
    function onFocus() { checkForUpdate() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function handleRefresh() {
    // Hard reload — ditch any cached JS/CSS
    window.location.reload()
  }

  if (!updateAvailable || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 10000,
        maxWidth: '340px',
        background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
        color: '#fff',
        padding: '14px 18px',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(79, 70, 229, 0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700, marginBottom: '4px' }}>🎉 New PetPro update!</div>
        <div style={{ opacity: 0.92, fontSize: '12px', marginBottom: '8px' }}>
          Bug fixes and new features are live. Refresh when you're at a good stopping point.
        </div>
        <button
          onClick={handleRefresh}
          style={{
            background: '#fff',
            color: '#4f46e5',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          ↻ Refresh now
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss (you can refresh manually later)"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '18px',
          cursor: 'pointer',
          lineHeight: 1,
          padding: 0,
          opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  )
}
