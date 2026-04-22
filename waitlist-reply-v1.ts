// =====================================================
// PetPro — Waitlist Reply Handler (waitlist-reply)
// ---------------------------------------------------
// Called from ClientPortalThread.jsx whenever a client
// sends a message AND they have a pending waitlist offer.
// It classifies the reply as yes / no / unclear and:
//   - YES + auto_book  -> creates appointment, marks waitlist 'booked',
//                         pings groomer, posts PetPro AI reply in thread
//   - YES + notify_groomer -> marks 'accepted', pings groomer,
//                             posts PetPro AI reply in thread
//   - NO               -> releases entry back to 'waiting',
//                         pings groomer, posts PetPro AI reply in thread
//   - unclear          -> does nothing (client may be asking a question;
//                         regular message flow handles it)
//
// All user-facing copy uses "PetPro AI" — never "Claude".
//
// Input (POST body):
// {
//   thread_id: string (uuid),
//   message_text: string
// }
//
// Authorization: client's user access token in Authorization header.
//
// Output:
// {
//   handled: boolean,
//   verdict?: 'yes' | 'no' | 'unclear',
//   action?: 'booked' | 'accepted' | 'released'
// }
// =====================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

var supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

var claudeKey = Deno.env.get('CLAUDE_API_KEY') ?? ''

// ---------------------------------------------------
// Push notification helper — fire-and-forget
// ---------------------------------------------------
async function sendPushToUser(userId: string, title: string, body: string, url: string, tag?: string) {
  if (!userId || !title) return
  try {
    var supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    var serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) return
    await fetch(supabaseUrl + '/functions/v1/send-push', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        title: title,
        body: body || '',
        url: url || '/',
        tag: tag || undefined,
      }),
    })
  } catch (err) {
    console.warn('[waitlist-reply/push] non-fatal:', err)
  }
}

// ---------------------------------------------------
// Format a YYYY-MM-DD into a short "Apr 22" style label
// ---------------------------------------------------
function formatDateShort(ymd: string): string {
  if (!ymd) return ''
  var parts = String(ymd).split('-')
  if (parts.length !== 3) return ymd
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  var mIdx = parseInt(parts[1], 10) - 1
  if (mIdx < 0 || mIdx > 11) return ymd
  return months[mIdx] + ' ' + parseInt(parts[2], 10)
}

// Format "HH:MM" into "h:MM am/pm"
function formatTime12h(hhmm: string): string {
  if (!hhmm) return ''
  var p = String(hhmm).split(':')
  var h = parseInt(p[0], 10)
  var m = parseInt(p[1] || '0', 10)
  var ampm = h >= 12 ? 'pm' : 'am'
  var h12 = h % 12 === 0 ? 12 : h % 12
  var mm = m < 10 ? '0' + m : String(m)
  return h12 + ':' + mm + ampm
}

// Turn ISO "2026-04-27T10:00:00" into "Apr 27 at 10:00am"
function formatSlotLabel(iso: string): string {
  if (!iso) return ''
  var datePart = iso.split('T')[0] || ''
  var timePart = (iso.split('T')[1] || '').slice(0, 5)
  return formatDateShort(datePart) + ' at ' + formatTime12h(timePart)
}

// ---------------------------------------------------
// Classify message as yes / no / unclear
// Cheap local shortcut first, then Haiku as fallback.
// ---------------------------------------------------
async function classifyReply(messageText: string): Promise<string> {
  var t = (messageText || '').trim().toLowerCase()
  if (!t) return 'unclear'
  var literalYes = ['y', 'yes', 'yes!', 'yep', 'yeah', 'yup', 'sure', 'ok', 'okay']
  var literalNo = ['n', 'no', 'no!', 'nope', 'nah', 'pass', 'cant', "can't"]
  if (literalYes.indexOf(t) >= 0) return 'yes'
  if (literalNo.indexOf(t) >= 0) return 'no'

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: 'You are classifying a reply to an appointment-slot offer. The client was asked if they want an open grooming slot. Reply with EXACTLY one word, lowercase, no punctuation: "yes" if they accept, "no" if they decline, or "unclear" for anything else (questions, confusion, time requests).',
        messages: [{ role: 'user', content: messageText }],
      }),
    })
    if (!resp.ok) return 'unclear'
    var data = await resp.json()
    var out = ''
    if (data && data.content) {
      for (var b of data.content) { if (b.type === 'text') out += b.text }
    }
    out = (out || '').trim().toLowerCase().replace(/[^a-z]/g, '')
    if (out === 'yes' || out === 'no' || out === 'unclear') return out
    return 'unclear'
  } catch (err) {
    console.warn('[waitlist-reply] classify failed (non-fatal):', err)
    return 'unclear'
  }
}

// ---------------------------------------------------
// Post a PetPro AI reply as a groomer-sourced message in the thread
// so the client sees it in their chat view.
// ---------------------------------------------------
async function postThreadReply(threadId: string, groomerId: string, clientId: string, text: string) {
  try {
    var { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        thread_id: threadId,
        groomer_id: groomerId,
        client_id: clientId,
        sender_type: 'groomer',
        text: text,
        read_by_groomer: true,
        read_by_client: false,
      })
      .select('created_at')
      .single()
    if (error) {
      console.error('[waitlist-reply] post thread reply failed:', error.message)
      return
    }
    // Bump thread last_message_at
    await supabaseAdmin
      .from('threads')
      .update({ last_message_at: data.created_at })
      .eq('id', threadId)
  } catch (err) {
    console.warn('[waitlist-reply] post reply non-fatal error:', err)
  }
}

// ===========================================================
// HTTP HANDLER
// ===========================================================
Deno.serve(async function (req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Auth: get client from token
    var authHeader = req.headers.get('Authorization') || ''
    var token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ handled: false, error: 'no token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    var { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !authData || !authData.user) {
      return new Response(JSON.stringify({ handled: false, error: 'bad token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up client record from auth user
    var { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('id, groomer_id, first_name, last_name')
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (!clientRow) {
      return new Response(JSON.stringify({ handled: false, error: 'no client' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    var clientId = clientRow.id
    var groomerId = clientRow.groomer_id

    var body = await req.json()
    var threadId = body.thread_id
    var messageText = body.message_text || ''

    if (!threadId) {
      return new Response(JSON.stringify({ handled: false, error: 'no thread_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1) Is there a pending waitlist offer?
    var nowIso = new Date().toISOString()
    var { data: offers } = await supabaseAdmin
      .from('grooming_waitlist')
      .select('id, pet_id, service_id, staff_id, offered_slot_start, offered_slot_end, expires_at, pets:pet_id(name)')
      .eq('client_id', clientId)
      .eq('groomer_id', groomerId)
      .eq('status', 'notified')
      .gt('expires_at', nowIso)
      .order('notified_at', { ascending: false })
      .limit(1)

    if (!offers || offers.length === 0) {
      return new Response(JSON.stringify({ handled: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    var offer = offers[0]
    if (!offer.offered_slot_start || !offer.offered_slot_end) {
      return new Response(JSON.stringify({ handled: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2) Classify reply
    var verdict = await classifyReply(messageText)
    if (verdict === 'unclear') {
      return new Response(JSON.stringify({ handled: false, verdict: 'unclear' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    var petName = (offer.pets && offer.pets.name) || 'your pet'
    var clientFirst = clientRow.first_name || 'Client'
    var clientLast = clientRow.last_name || ''
    var slotLabel = formatSlotLabel(offer.offered_slot_start)

    // -------------------------------------------------
    // CLIENT SAID NO — release entry back to waitlist
    // -------------------------------------------------
    if (verdict === 'no') {
      await supabaseAdmin
        .from('grooming_waitlist')
        .update({
          status: 'waiting',
          expires_at: null,
          offered_slot_start: null,
          offered_slot_end: null,
          offered_appointment_id: null,
        })
        .eq('id', offer.id)

      sendPushToUser(
        groomerId,
        'ℹ️ Waitlist pass',
        clientFirst + ' ' + clientLast + ' passed on the ' + slotLabel + ' slot — back on the waitlist.',
        '/waitlist',
        'waitlist-pass-' + offer.id
      )

      await postThreadReply(threadId, groomerId, clientId, 'No worries! You\'re still on the waitlist for the next opening 🐾')

      return new Response(JSON.stringify({ handled: true, verdict: 'no', action: 'released' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // -------------------------------------------------
    // CLIENT SAID YES — check groomer's on-yes preference
    // -------------------------------------------------
    var { data: prefs } = await supabaseAdmin
      .from('ai_personalization')
      .select('waitlist_on_yes_action')
      .eq('groomer_id', groomerId)
      .maybeSingle()
    var onYes = (prefs && prefs.waitlist_on_yes_action) || 'notify_groomer'

    // Mode A: auto-book
    if (onYes === 'auto_book') {
      var slotStart = offer.offered_slot_start
      var slotEnd = offer.offered_slot_end
      var apptDate = slotStart.split('T')[0]
      var startTime = (slotStart.split('T')[1] || '').slice(0, 5)
      var endTime = (slotEnd.split('T')[1] || '').slice(0, 5)

      console.log('[waitlist-reply] auto-booking:', apptDate, startTime, '-', endTime)

      var { data: newAppt, error: apptErr } = await supabaseAdmin
        .from('appointments')
        .insert({
          groomer_id: groomerId,
          client_id: clientId,
          pet_id: offer.pet_id,
          service_id: offer.service_id || null,
          staff_id: offer.staff_id || null,
          appointment_date: apptDate,
          start_time: startTime,
          end_time: endTime,
          status: 'confirmed',
          service_notes: 'Auto-booked from waitlist by PetPro AI',
        })
        .select('id')
        .single()

      if (apptErr) {
        console.error('[waitlist-reply] auto-book insert failed:', apptErr.message, JSON.stringify(apptErr))
        // Fall back to notify_groomer path
        await supabaseAdmin
          .from('grooming_waitlist')
          .update({ status: 'accepted' })
          .eq('id', offer.id)

        sendPushToUser(
          groomerId,
          '🎉 Waitlist YES — needs manual booking',
          clientFirst + ' ' + clientLast + ' said YES to ' + slotLabel + ' (auto-book failed, please book manually)',
          '/portal/messages',
          'waitlist-yes-' + offer.id
        )

        await postThreadReply(threadId, groomerId, clientId, 'Got it! The groomer will confirm your booking shortly 🐾')

        return new Response(JSON.stringify({ handled: true, verdict: 'yes', action: 'accepted' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Junction row so Calendar.jsx renders the appt
      await supabaseAdmin
        .from('appointment_pets')
        .insert({
          appointment_id: newAppt.id,
          pet_id: offer.pet_id,
          service_id: offer.service_id || null,
        })

      await supabaseAdmin
        .from('grooming_waitlist')
        .update({ status: 'booked' })
        .eq('id', offer.id)

      sendPushToUser(
        groomerId,
        '✅ Waitlist auto-booked!',
        clientFirst + ' ' + clientLast + ' (' + petName + ') is on the books for ' + slotLabel,
        '/calendar',
        'waitlist-book-' + offer.id
      )

      await postThreadReply(threadId, groomerId, clientId, 'You\'re all set! ' + petName + ' is booked for ' + slotLabel + '. See you then 🐾')

      return new Response(JSON.stringify({ handled: true, verdict: 'yes', action: 'booked' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mode B: notify_groomer (default)
    await supabaseAdmin
      .from('grooming_waitlist')
      .update({ status: 'accepted' })
      .eq('id', offer.id)

    sendPushToUser(
      groomerId,
      '🎉 Waitlist YES!',
      clientFirst + ' ' + clientLast + ' (' + petName + ') said YES to ' + slotLabel + ' — tap to book',
      '/portal/messages',
      'waitlist-yes-' + offer.id
    )

    await postThreadReply(threadId, groomerId, clientId, 'Awesome! The groomer has been notified and will confirm your ' + slotLabel + ' spot shortly 🐾')

    return new Response(JSON.stringify({ handled: true, verdict: 'yes', action: 'accepted' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[waitlist-reply] handler error:', err)
    return new Response(JSON.stringify({ handled: false, error: String(err && (err as any).message ? (err as any).message : err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
