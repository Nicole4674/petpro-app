// ====================================================================
// PetPro Push Notifications — client-side utilities
// ====================================================================
// The brain of the browser-side push system. Handles:
//   • Browser support check
//   • Service worker registration
//   • Permission request
//   • Push subscription
//   • Saving subscription to Supabase
//   • Unsubscribing
//
// UI components (EnableNotifications.jsx, etc.) import these helpers
// instead of calling the raw browser APIs directly.
// ====================================================================

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// --------------------------------------------------------------------
// Encoding helpers
// --------------------------------------------------------------------
// The VAPID public key comes in as a URL-safe base64 string, but the
// browser's PushManager wants a Uint8Array. This converts it.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// The subscription keys come as ArrayBuffers; we store them as base64
// strings in the DB (TEXT column), so we need to convert.
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

// --------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------

/**
 * Does this browser support web push at all?
 * Safari on iOS needs iOS 16.4+ AND the site needs to be installed to
 * the home screen (PWA). On desktop Safari, Chrome, Firefox, Edge → yes.
 */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Current permission state: 'granted' | 'denied' | 'default'
 * 'default' = user hasn't been asked yet
 * 'denied' = they said no (or browser blocks us)
 */
export function getPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Make sure our service worker (/sw.js) is registered. Safe to call
 * multiple times — browser dedupes.
 */
export async function registerServiceWorker() {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported in this browser')
  }
  const registration = await navigator.serviceWorker.register('/sw.js')
  // Wait for it to be fully ready/active
  await navigator.serviceWorker.ready
  return registration
}

/**
 * Check if the current user already has a push subscription saved
 * in the database (for this browser).
 */
export async function hasActiveSubscription() {
  if (!isPushSupported()) return false

  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) return false

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return false

  // Also check that the DB has a matching row (could have been deleted
  // from the backend)
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()

  return !!data
}

/**
 * Turn on notifications for the current logged-in user.
 *
 * @param {Object} opts
 * @param {'groomer' | 'client'} opts.userType — for filtering later
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function enablePushNotifications({ userType }) {
  try {
    if (!isPushSupported()) {
      return { success: false, error: 'Your browser does not support push notifications.' }
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error('[push] VITE_VAPID_PUBLIC_KEY is missing from .env')
      return { success: false, error: 'Server is missing push configuration. Contact support.' }
    }

    // 1. Ask for permission (this triggers the browser's native prompt)
    const permission = await Notification.requestPermission()
    if (permission === 'denied') {
      return {
        success: false,
        error: 'Notifications were blocked. Open your browser settings for this site to re-enable.',
      }
    }
    if (permission !== 'granted') {
      return { success: false, error: 'Notifications were not enabled.' }
    }

    // 2. Register the service worker (if not already)
    const registration = await registerServiceWorker()

    // 3. Subscribe to push with our VAPID public key
    //    (reuse existing subscription if one is already there)
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // required — we must always show a visible notification on push
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    // 4. Extract the endpoint + keys for DB storage
    const endpoint = subscription.endpoint
    const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'))
    const auth = arrayBufferToBase64(subscription.getKey('auth'))

    // 5. Get the current user
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      return { success: false, error: 'You must be logged in to enable notifications.' }
    }
    const userId = userData.user.id

    // 6. Upsert into push_subscriptions (endpoint is UNIQUE so we
    //    update last_used_at if the same browser re-enables)
    const { error: insertErr } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          user_type: userType,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )

    if (insertErr) {
      console.error('[push] DB insert failed:', insertErr)
      return { success: false, error: 'Could not save subscription. Try again.' }
    }

    return { success: true }
  } catch (err) {
    console.error('[push] Enable failed:', err)
    return {
      success: false,
      error: err?.message || 'Something went wrong enabling notifications.',
    }
  }
}

/**
 * Fire a push notification to another user. Non-blocking, silent on
 * failure — we NEVER want a push error to break the actual action
 * (like sending a message). Fire and forget.
 *
 * @param {Object} opts
 * @param {string} opts.userId   — who to notify (auth.users.id)
 * @param {string} opts.title    — notification title
 * @param {string} opts.body     — notification body
 * @param {string} [opts.url]    — where clicking the notification goes
 * @param {string} [opts.tag]    — optional grouping tag
 */
export async function notifyUser({ userId, title, body, url, tag }) {
  if (!userId || !title) return
  try {
    await supabase.functions.invoke('send-push', {
      body: { user_id: userId, title, body: body || '', url: url || '/', tag },
    })
  } catch (err) {
    // Silent fail — a failed push should never break the user's action
    console.warn('[push] notifyUser failed (non-fatal):', err)
  }
}

/**
 * Send a test push to the currently logged-in user — used to verify
 * the whole pipeline works end-to-end after they click "Turn on".
 */
export async function sendTestPush() {
  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      return { success: false, error: 'Must be logged in.' }
    }

    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        user_id: userData.user.id,
        title: '🐾 PetPro test notification',
        body: 'If you see this, notifications are working!',
        url: '/',
        tag: 'test',
      },
    })

    if (error) {
      console.error('[push] Test send failed:', error)
      return { success: false, error: error.message || 'Test send failed.' }
    }

    if (data?.sent === 0) {
      return {
        success: false,
        error: 'No subscription found on the server — try turning off and on again.',
      }
    }

    return { success: true, sent: data?.sent }
  } catch (err) {
    console.error('[push] Test send threw:', err)
    return { success: false, error: err?.message || 'Test send failed.' }
  }
}

/**
 * Turn off notifications for the current browser. Removes both the
 * browser-side subscription AND the DB row.
 */
export async function disablePushNotifications() {
  try {
    if (!isPushSupported()) return { success: true }

    const registration = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!registration) return { success: true }

    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return { success: true }

    const endpoint = subscription.endpoint

    // Unsubscribe browser-side
    await subscription.unsubscribe()

    // Remove from DB
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

    return { success: true }
  } catch (err) {
    console.error('[push] Disable failed:', err)
    return { success: false, error: err?.message || 'Could not turn off notifications.' }
  }
}
