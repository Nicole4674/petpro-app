// ====================================================================
// PetPro Service Worker — push notifications + PWA install support
// ====================================================================
// Lives in /public/sw.js so Vite serves it at the root path (/sw.js),
// which is REQUIRED for service workers to register correctly.
//
// Responsibilities:
//   1. Push notifications (existing) — listen for push events + clicks
//   2. PWA install support (Phase 14) — having a fetch handler tells the
//      browser this site is "app-like" and unlocks the Install prompt on
//      Chrome / Android / iOS Safari.
//
// We INTENTIONALLY do not cache assets aggressively. The fetch handler
// is network-only (pass-through) for now — this keeps deployments fast
// and avoids stale-content bugs. If we want offline support for the
// Route page later, we can add cache-first logic for /route specifically.
// ====================================================================

// Install immediately — no caching to invalidate on activate.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// --------------------------------------------------------------------
// FETCH (PWA install requirement)
// --------------------------------------------------------------------
// Browsers consider a site "installable" if its SW has a fetch event
// LISTENER — even an empty one. We don't call event.respondWith() here
// because that would intercept every request, which breaks Vite's dev
// server HMR + causes 'Failed to fetch' errors on /calendar etc.
//
// By doing nothing inside this listener, the browser handles each fetch
// normally (no interception, no caching) AND we still get credit for
// having a fetch handler so Chrome shows the Install prompt.
//
// If we want offline support later, this is where we'd add cache-first
// logic for /route or static assets. For now: no-op.
// --------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  // Intentionally empty. Don't call event.respondWith(...) — let the
  // browser handle every request normally.
});

// --------------------------------------------------------------------
// PUSH: server sent us a notification
// --------------------------------------------------------------------
// Expected payload shape (from our edge function):
//   {
//     title:   "New booking!",
//     body:    "Sarah booked Bella for Full Groom @ 2pm tomorrow",
//     url:     "/calendar?date=2026-04-21",  // where to go when clicked
//     tag:     "booking-123",                // optional — groups/replaces notifs
//     icon:    "/favicon.svg"                // optional — custom icon
//   }
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[sw] Push event with no data — ignoring');
    return;
  }

  // Parse the payload — try JSON first, fall back to plain text
  let data;
  try {
    data = event.data.json();
  } catch (_) {
    data = { title: 'PetPro', body: event.data.text() };
  }

  const title = data.title || 'PetPro';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag, // notifications with the same tag replace each other
    data: {
      url: data.url || '/', // stored so notificationclick can read it
    },
    requireInteraction: data.requireInteraction === true,
    // Vibration pattern on mobile: short-pause-short
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --------------------------------------------------------------------
// NOTIFICATIONCLICK: user tapped the notification
// --------------------------------------------------------------------
// If a PetPro tab is already open → focus it (and navigate to the url)
// If no tab is open → open a new tab at the url
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to find an existing PetPro tab
        for (const client of windowClients) {
          // Same origin? focus it and send it the url
          if (client.url && 'focus' in client) {
            client.focus();
            // Tell the page where to navigate (handled in src/main.jsx)
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
            return;
          }
        }
        // No tab open — open a fresh one
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});

// --------------------------------------------------------------------
// NOTIFICATIONCLOSE: user dismissed without clicking (optional tracking)
// --------------------------------------------------------------------
self.addEventListener('notificationclose', (event) => {
  // No-op for now — can wire up analytics later if we want to know
  // "how often are users dismissing vs clicking?"
});
