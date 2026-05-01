import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// =============================================================================
// PWA — Register the service worker on app boot.
// =============================================================================
// We register here (not just inside push.js) so the SW is active for ALL users
// — including those who haven't opted in to push notifications. This is what
// unlocks the browser's "Install PetPro" prompt on Chrome/Android/iOS.
//
// Browser dedupes registrations, so this is safe even when push.js also
// registers later. Failures are swallowed silently — the rest of the app
// works fine without a service worker; we just lose PWA installability.
// =============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[main] Service worker registration failed:', err)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
