// ====================================================================
// PetPro — push-scheduler edge function
// --------------------------------------------------------------------
// Called every 10 minutes by Supabase's built-in scheduler. Handles
// three scheduled push triggers:
//
//   #5  Appt starting in ~15 min          → ping GROOMER
//   #8  Day-before appt reminder (6–8pm)  → ping CLIENT
//   #9  Rebook nudge (6–8 weeks idle)     → ping CLIENT
//
// Uses the notification_log table to prevent duplicate pings.
// Calls the existing send-push edge function for the actual delivery.
// ====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------
function formatTimeForPush(hhmm: string): string {
  if (!hhmm) return ''
  const p = String(hhmm).split(':')
  const h = parseInt(p[0], 10)
  const m = parseInt(p[1] || '0', 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const mm = m < 10 ? '0' + m : String(m)
  return h12 + ':' + mm + ampm
}

// Returns a YYYY-MM-DD string in Chicago timezone offset by N days
function chicagoDateStr(dayOffset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + dayOffset * 86400000))
  const obj: any = {}
  for (const p of parts) {
    if (p.type !== 'literal') obj[p.type] = p.value
  }
  return `${obj.year}-${obj.month}-${obj.day}`
}

// Returns current Chicago clock info: { hour, minute, totalMinutes }
function chicagoNow(): { hour: number; minute: number; totalMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  let hour = 0
  let minute = 0
  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10)
    if (p.type === 'minute') minute = parseInt(p.value, 10)
  }
  if (hour === 24) hour = 0
  return { hour, minute, totalMinutes: hour * 60 + minute }
}

// Fire a push via the send-push edge function. Non-blocking error handling.
async function firePush(
  userId: string,
  title: string,
  body: string,
  url: string,
  tag?: string,
): Promise<boolean> {
  if (!userId || !title) return false
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/send-push', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        body: body || '',
        url: url || '/',
        tag: tag || undefined,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn('[scheduler] send-push returned', res.status, txt)
      return false
    }
    return true
  } catch (err) {
    console.warn('[scheduler] firePush failed:', err)
    return false
  }
}

// Log a sent notification. Uses UNIQUE constraint to prevent dups.
async function logNotification(
  triggerType: '15min' | 'day_before' | 'rebook',
  appointmentId: string | null,
  clientId: string | null,
): Promise<void> {
  try {
    await supabaseAdmin.from('notification_log').insert({
      trigger_type: triggerType,
      appointment_id: appointmentId,
      client_id: clientId,
    })
  } catch (err) {
    console.warn('[scheduler] log insert failed (likely duplicate, non-fatal):', err)
  }
}

// --------------------------------------------------------------------
// TRIGGER #5 — Appt starting in ~15 min → ping GROOMER
// --------------------------------------------------------------------
// Window: any confirmed appt whose (date, start_time) is between
// now+5min and now+20min in Chicago time, not already logged.
async function run15MinReminders(): Promise<{ sent: number; skipped: number }> {
  const { hour, minute } = chicagoNow()
  const nowTotal = hour * 60 + minute
  const windowStart = nowTotal + 5 // 5 min from now
  const windowEnd = nowTotal + 20 // 20 min from now

  // If the window crosses midnight, we just skip (rare edge case,
  // would only hit if an appt started at ~00:10 — not typical)
  if (windowEnd >= 24 * 60) {
    return { sent: 0, skipped: 0 }
  }

  const todayStr = chicagoDateStr(0)

  // Fetch all confirmed (non-pending) appts for today
  const { data: appts, error } = await supabaseAdmin
    .from('appointments')
    .select(
      'id, groomer_id, start_time, appointment_date, status, flag_status, service_notes, ' +
        'pets:pet_id(name), services:service_id(service_name), clients:client_id(first_name)',
    )
    .eq('appointment_date', todayStr)
    .eq('status', 'confirmed')
    .neq('flag_status', 'pending')

  if (error) {
    console.warn('[scheduler] 15min query error:', error.message)
    return { sent: 0, skipped: 0 }
  }

  let sent = 0
  let skipped = 0
  for (const a of appts || []) {
    const parts = String(a.start_time).split(':')
    const startTotal = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10)
    if (startTotal < windowStart || startTotal > windowEnd) {
      skipped++
      continue
    }

    // Check if already logged
    const { data: existing } = await supabaseAdmin
      .from('notification_log')
      .select('id')
      .eq('appointment_id', a.id)
      .eq('trigger_type', '15min')
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    const petName = (a.pets && (a.pets as any).name) || 'pet'
    const svcName = (a.services && (a.services as any).service_name) || ''
    const clientName = (a.clients && (a.clients as any).first_name) || ''
    const timeStr = formatTimeForPush(a.start_time)

    const title = '⏰ Starting in 15 min'
    let body = petName
    if (clientName) body = clientName + "'s " + petName
    if (svcName) body += ' — ' + svcName
    body += ' @ ' + timeStr

    const success = await firePush(
      a.groomer_id,
      title,
      body,
      '/calendar',
      'start-' + a.id,
    )
    if (success) {
      await logNotification('15min', a.id, null)
      sent++
    } else {
      skipped++
    }
  }
  return { sent, skipped }
}

// --------------------------------------------------------------------
// TRIGGER #8 — Day-before reminder (between 6pm–9pm local) → ping CLIENT
// --------------------------------------------------------------------
async function runDayBeforeReminders(): Promise<{ sent: number; skipped: number }> {
  const { hour } = chicagoNow()
  // Only fire between 6pm (18) and 9pm (21) — nice timing for reminders
  if (hour < 18 || hour >= 21) {
    return { sent: 0, skipped: 0 }
  }

  const tomorrowStr = chicagoDateStr(1)

  const { data: appts, error } = await supabaseAdmin
    .from('appointments')
    .select(
      'id, client_id, start_time, appointment_date, status, flag_status, ' +
        'pets:pet_id(name), services:service_id(service_name), clients:client_id(user_id, first_name)',
    )
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'confirmed')
    .neq('flag_status', 'pending')

  if (error) {
    console.warn('[scheduler] day_before query error:', error.message)
    return { sent: 0, skipped: 0 }
  }

  let sent = 0
  let skipped = 0
  for (const a of appts || []) {
    const clientRow: any = a.clients
    if (!clientRow || !clientRow.user_id) {
      skipped++
      continue
    }

    // Skip if already logged for this appt
    const { data: existing } = await supabaseAdmin
      .from('notification_log')
      .select('id')
      .eq('appointment_id', a.id)
      .eq('trigger_type', 'day_before')
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    const petName = (a.pets && (a.pets as any).name) || 'your pet'
    const svcName = (a.services && (a.services as any).service_name) || ''
    const timeStr = formatTimeForPush(a.start_time)

    const title = '🐾 Tomorrow: ' + petName + "'s appointment"
    const body = (svcName ? svcName + ' ' : 'Appointment ') + '@ ' + timeStr +
      ' — reply if anything changes!'

    const success = await firePush(
      clientRow.user_id,
      title,
      body,
      '/portal',
      'daybefore-' + a.id,
    )
    if (success) {
      await logNotification('day_before', a.id, null)
      sent++
    } else {
      skipped++
    }
  }
  return { sent, skipped }
}

// --------------------------------------------------------------------
// TRIGGER #9 — Rebook nudge (6–8 weeks idle) → ping CLIENT
// --------------------------------------------------------------------
// Rules:
//   - Client's most recent COMPLETED appt was 42–56 days ago
//   - Client has no FUTURE appointment booked
//   - Haven't been nudged in the last 30 days
// Only runs once per day (at 10am local) to avoid spamming.
async function runRebookNudges(): Promise<{ sent: number; skipped: number }> {
  const now = chicagoNow()
  // Only run between 10am–11am local time so we don't fire every 10 min
  if (now.hour !== 10) {
    return { sent: 0, skipped: 0 }
  }

  const todayStr = chicagoDateStr(0)
  const sixWksAgo = chicagoDateStr(-42) // 42 days ago
  const eightWksAgo = chicagoDateStr(-56) // 56 days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // Find appointments completed 42–56 days ago
  const { data: oldAppts, error } = await supabaseAdmin
    .from('appointments')
    .select(
      'id, client_id, appointment_date, groomer_id, ' +
        'pets:pet_id(name), clients:client_id(user_id, first_name)',
    )
    .gte('appointment_date', eightWksAgo)
    .lte('appointment_date', sixWksAgo)
    .in('status', ['confirmed', 'completed'])

  if (error) {
    console.warn('[scheduler] rebook query error:', error.message)
    return { sent: 0, skipped: 0 }
  }

  let sent = 0
  let skipped = 0

  // Group by client_id to only nudge each client once
  const byClient: Record<string, any> = {}
  for (const a of oldAppts || []) {
    if (!a.client_id) continue
    // Keep the MOST RECENT qualifying appt for each client (for pet/service context)
    if (
      !byClient[a.client_id] ||
      byClient[a.client_id].appointment_date < a.appointment_date
    ) {
      byClient[a.client_id] = a
    }
  }

  for (const clientId of Object.keys(byClient)) {
    const a = byClient[clientId]
    const clientRow: any = a.clients
    if (!clientRow || !clientRow.user_id) {
      skipped++
      continue
    }

    // Skip if client has a future appointment already
    const { data: futureAppts } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('client_id', clientId)
      .gte('appointment_date', todayStr)
      .neq('status', 'cancelled')
      .limit(1)
    if (futureAppts && futureAppts.length > 0) {
      skipped++
      continue
    }

    // Skip if we nudged this client in the last 30 days
    const { data: recentNudge } = await supabaseAdmin
      .from('notification_log')
      .select('id')
      .eq('client_id', clientId)
      .eq('trigger_type', 'rebook')
      .gte('sent_at', thirtyDaysAgo)
      .limit(1)
    if (recentNudge && recentNudge.length > 0) {
      skipped++
      continue
    }

    const petName = (a.pets && (a.pets as any).name) || 'your pet'
    const firstName = clientRow.first_name || ''

    const title = '🐾 Time for a fresh groom?'
    const body = (firstName ? 'Hi ' + firstName + '! ' : '') +
      petName + ' is due for a visit — book anytime through the app.'

    const success = await firePush(
      clientRow.user_id,
      title,
      body,
      '/portal',
      'rebook-' + clientId,
    )
    if (success) {
      await logNotification('rebook', null, clientId)
      sent++
    } else {
      skipped++
    }
  }
  return { sent, skipped }
}

// --------------------------------------------------------------------
// HTTP handler
// --------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const results = {
      '15min': await run15MinReminders(),
      day_before: await runDayBeforeReminders(),
      rebook: await runRebookNudges(),
    }

    console.log('[scheduler] results:', JSON.stringify(results))

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[scheduler] fatal:', err?.message || err)
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
