// ====================================================================
// PetPro — Send Push Edge Function (v1)
// ====================================================================
// Supabase Edge Function: sends web push notifications to one or more
// users. Called by Claude, DB triggers, scheduled jobs, and any UI
// event that needs to notify someone.
//
// DEPLOY: paste this whole file into a new Supabase Edge Function
// named `send-push`. Make sure the 3 VAPID_* secrets are set.
//
// CALL FROM FRONTEND:
//   await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       user_id: 'uuid-here',
//       title: 'New booking!',
//       body:  'Sarah booked Bella @ 2pm',
//       url:   '/calendar',
//     }),
//   })
//
// PAYLOAD:
//   • user_id (string)        — single recipient
//   • user_ids (string[])     — multiple recipients (OR instead of user_id)
//   • title (string) *REQ     — notification title
//   • body (string)           — notification body/subtitle
//   • url (string)            — where to send the user when they click
//   • tag (string)            — optional: groups/replaces duplicate notifs
//   • icon (string)           — optional: override default icon
//   • requireInteraction (bool) — notification stays until user clicks
//
// RESPONSE:
//   { sent: number, failed: number, total: number }
// ====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'npm:web-push@3.6.7'

// --- CORS ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --- VAPID setup (runs once on function cold start) ---
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error(
    '[send-push] Missing VAPID env vars. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in Supabase Edge Function secrets.',
  )
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// --- Supabase admin client (uses service role to read any user's subs
//     and clean up dead subscriptions) ---
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// --------------------------------------------------------------------
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json()
    const {
      user_id,
      user_ids,
      title,
      body: msgBody,
      url,
      tag,
      icon,
      requireInteraction,
    } = body

    // Validate
    if (!title || typeof title !== 'string') {
      return json({ error: 'title is required' }, 400)
    }

    // Accept either a single user_id or an array
    const targetIds: string[] = Array.isArray(user_ids)
      ? user_ids
      : user_id
        ? [user_id]
        : []

    if (targetIds.length === 0) {
      return json({ error: 'user_id or user_ids is required' }, 400)
    }

    // Fetch all subscriptions for all target users in one query
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', targetIds)

    if (subsErr) {
      console.error('[send-push] DB error:', subsErr)
      return json({ error: subsErr.message }, 500)
    }

    if (!subs || subs.length === 0) {
      return json({
        sent: 0,
        failed: 0,
        total: 0,
        message: 'No push subscriptions for these users',
      })
    }

    // Build the payload (this is what sw.js will parse on receipt)
    const payload = JSON.stringify({
      title,
      body: msgBody || '',
      url: url || '/',
      tag: tag || undefined,
      icon: icon || undefined,
      requireInteraction: requireInteraction === true,
    })

    // Send to every subscription in parallel
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }
        try {
          await webpush.sendNotification(pushSubscription, payload)
          // Mark sub as active
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
          return { id: sub.id, ok: true }
        } catch (err: any) {
          // 410 Gone / 404 Not Found → subscription is dead, clean it up
          const statusCode = err?.statusCode
          if (statusCode === 410 || statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id)
            return { id: sub.id, ok: false, reason: 'gone', deleted: true }
          }
          console.error(
            '[send-push] Push failed for sub',
            sub.id,
            'status:',
            statusCode,
            'body:',
            err?.body,
          )
          return {
            id: sub.id,
            ok: false,
            reason: err?.message || 'push-failed',
          }
        }
      }),
    )

    const sent = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as any).ok,
    ).length
    const failed = results.length - sent

    return json({ sent, failed, total: subs.length })
  } catch (err: any) {
    console.error('[send-push] Fatal error:', err)
    return json({ error: err?.message || 'Unknown error' }, 500)
  }
})

// --------------------------------------------------------------------
// Helper: JSON response with CORS headers
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
