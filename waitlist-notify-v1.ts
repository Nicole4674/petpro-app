// =====================================================
// PetPro — Waitlist Auto-Notify (waitlist-notify)
// ---------------------------------------------------
// When an appointment gets cancelled on the calendar,
// the frontend calls this function. It:
//   1. Loads the groomer's waitlist settings from
//      ai_personalization. Exits early if the toggle
//      is off.
//   2. Pulls all waitlist entries with status='waiting'
//      whose preferred_days includes the cancelled
//      slot's day of week.
//   3. Uses Claude Haiku to apply the groomer's
//      free-text filter rules ("no dogs over 50 lbs",
//      etc.) and rank remaining candidates by best
//      service fit.
//   4. Sends the top pick a template offer message
//      via the existing threads + messages tables.
//      (Template uses the groomer's tone + shop name
//      from ai_personalization — no per-call AI cost
//      on the message itself.)
//   5. Marks the waitlist entry as 'notified' and
//      sets expires_at = now + response window.
//   6. Fires a push notification so the client sees
//      it even when the portal is closed.
//
// Input (POST body):
// {
//   groomer_id: string (uuid),
//   cancelled_appointment_id?: string (uuid),
//   start_time: string (ISO timestamp),
//   end_time: string (ISO timestamp),
//   service_id?: string (uuid)
// }
//
// Output:
// {
//   notified: boolean,
//   reason?: string,
//   client_name?: string,
//   pet_name?: string,
//   waitlist_entry_id?: string,
//   message_id?: string,
//   message_text?: string,
//   expires_at?: string,
//   ai_reason?: string
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
// PUSH NOTIFICATION HELPER — fire-and-forget wrapper.
// ---------------------------------------------------
async function sendPushToUser(userId, title, body, url, tag) {
  if (!userId || !title) return
  try {
    var supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    var serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      console.warn('[waitlist-notify/push] SUPABASE_URL or SERVICE_ROLE_KEY missing — skipping push')
      return
    }
    var res = await fetch(supabaseUrl + '/functions/v1/send-push', {
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
    if (!res.ok) {
      var txt = await res.text().catch(function () { return '' })
      console.warn('[waitlist-notify/push] send-push returned', res.status, txt)
    }
  } catch (err) {
    console.warn('[waitlist-notify/push] sendPushToUser failed (non-fatal):', err)
  }
}

// ---------------------------------------------------
// Date / time utilities
// ---------------------------------------------------
function getDayOfWeek(isoDateTime) {
  var d = new Date(isoDateTime)
  var days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[d.getDay()]
}

function formatDateForMessage(isoDateTime) {
  var d = new Date(isoDateTime)
  var weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return weekdays[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate()
}

function formatTimeForMessage(isoDateTime) {
  var d = new Date(isoDateTime)
  var h = d.getHours()
  var m = d.getMinutes()
  var ampm = h >= 12 ? 'pm' : 'am'
  var h12 = h % 12 === 0 ? 12 : h % 12
  var mm = m < 10 ? '0' + m : String(m)
  return h12 + ':' + mm + ampm
}

// ---------------------------------------------------
// HAIKU PICKER — applies the groomer's filter rules
// and ranks candidates by best service fit.
// Returns { picked_id, reason } or picked_id=null if
// nobody is eligible.
// ---------------------------------------------------
async function askHaikuToPick(slotInfo, candidates, filterRules, shopName) {
  if (!claudeKey) {
    console.warn('[waitlist-notify] CLAUDE_API_KEY missing — falling back to first candidate')
    return candidates.length > 0
      ? { picked_id: candidates[0].id, reason: 'First in line (no AI key)' }
      : { picked_id: null, reason: 'No key and no candidates' }
  }

  // Short-circuit: no filter rules + only one candidate → skip Claude call entirely
  if (candidates.length === 1 && (!filterRules || !filterRules.trim())) {
    return { picked_id: candidates[0].id, reason: 'Only candidate, no filter rules' }
  }

  var systemPrompt = [
    'You are the waitlist assistant for ' + (shopName || 'a pet grooming shop') + '.',
    'Your only job: pick the SINGLE best waitlist candidate for an open slot, or say nobody is eligible.',
    '',
    'RULES TO APPLY (in order):',
    '1. HARD FILTER: Apply the groomer\'s filter rules exactly. If a candidate breaks ANY rule, exclude them. No exceptions, no "close enough".',
    '2. SERVICE FIT: Of the remaining candidates, rank by how well their requested service matches the slot\'s service. A perfect match wins. "Any service" is a neutral score.',
    '3. TIE-BREAK: If multiple candidates tie, pick the one highest on the waitlist (lowest position number).',
    '',
    'OUTPUT FORMAT — return ONLY this JSON object, no other text, no markdown code fences:',
    '{',
    '  "picked_id": "<waitlist entry id from the input list>" | null,',
    '  "reason": "<one short sentence explaining why>"',
    '}',
    '',
    'If NO candidate fits the filter rules, return picked_id = null.',
    'NEVER invent a picked_id. It MUST be one of the IDs in the candidate list.',
  ].join('\n')

  var userMsg = [
    'OPEN SLOT:',
    JSON.stringify(slotInfo, null, 2),
    '',
    'GROOMER\'S FILTER RULES (plain English — apply exactly):',
    (filterRules && filterRules.trim()) || '(no special filter rules set — all day-matched candidates are eligible)',
    '',
    'WAITLIST CANDIDATES (already filtered by day-of-week match, sorted by waitlist position):',
    JSON.stringify(candidates, null, 2),
  ].join('\n')

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!res.ok) {
      var errTxt = await res.text().catch(function () { return '' })
      console.error('[waitlist-notify] Haiku API error:', res.status, errTxt)
      return { picked_id: null, reason: 'Claude API error: ' + res.status }
    }

    var json = await res.json()
    var textOut = ''
    if (json.content && Array.isArray(json.content)) {
      for (var block of json.content) {
        if (block.type === 'text') textOut += block.text
      }
    }

    // Strip markdown code fences if the model wrapped its JSON
    textOut = textOut
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    var parsed = JSON.parse(textOut)

    // Safety: picked_id MUST be in our candidate list (never trust the model)
    if (parsed.picked_id) {
      var ok = false
      for (var c of candidates) {
        if (c.id === parsed.picked_id) { ok = true; break }
      }
      if (!ok) {
        console.warn('[waitlist-notify] Haiku returned an ID not in candidate list, rejecting')
        return { picked_id: null, reason: 'AI returned unknown id — rejected' }
      }
    }

    return {
      picked_id: parsed.picked_id || null,
      reason: parsed.reason || 'No reason given',
    }
  } catch (err) {
    console.error('[waitlist-notify] askHaikuToPick failed:', err)
    return { picked_id: null, reason: 'Parse/network error' }
  }
}

// ---------------------------------------------------
// TEMPLATE MESSAGE BUILDER — uses the groomer's tone +
// shop name preferences from ai_personalization. No
// per-call AI cost.
// ---------------------------------------------------
function buildOfferMessage(opts) {
  var firstName = (opts.ownerName || '').split(' ')[0] || 'there'
  var petName = opts.petName || 'your pet'
  var dayDate = formatDateForMessage(opts.slotIso)
  var timeStr = formatTimeForMessage(opts.slotIso)
  var tone = opts.tone || 'friendly'
  var emojiLevel = opts.emojiLevel || 'sometimes'
  var shopName = opts.shopName || ''
  var responseMins = opts.responseMins || 30
  var serviceName = opts.serviceName || ''

  var paw = emojiLevel === 'never' ? '' : ' 🐾'
  var sparkle = emojiLevel === 'often' ? ' ✨' : ''

  var opener
  if (tone === 'professional') {
    opener = 'Hi ' + firstName + ','
    if (shopName) opener += ' this is ' + shopName + '.'
  } else if (tone === 'casual') {
    opener = 'hey ' + firstName.toLowerCase() + '!'
  } else {
    opener = 'Hey ' + firstName + '!' + paw
  }

  var serviceBit = serviceName ? ' for ' + String(serviceName).toLowerCase() : ''
  var middle = ' Good news' + sparkle + ' — a spot just opened up for ' +
    petName + ' on ' + dayDate + ' at ' + timeStr + serviceBit + '.'
  var cta = ' Want it? Reply YES to claim — this offer expires in ' +
    responseMins + ' minutes and it\'s first come first served.'

  return opener + middle + cta
}

// ===================================================
// MAIN HANDLER
// ===================================================
Deno.serve(async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    var body = await req.json()
    var groomerId = body.groomer_id
    var startIso = body.start_time
    var endIso = body.end_time
    var cancelledApptId = body.cancelled_appointment_id || null
    var slotServiceId = body.service_id || null
    var staffId = body.staff_id || null

    // Validate input
    if (!groomerId || !startIso || !endIso) {
      return new Response(
        JSON.stringify({ notified: false, reason: 'Missing groomer_id, start_time, or end_time' }),
        { status: 400, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    // 1. Load waitlist settings + shop voice preferences
    var { data: settings } = await supabaseAdmin
      .from('ai_personalization')
      .select('waitlist_auto_notify_enabled, waitlist_auto_notify_instructions, waitlist_response_window_minutes, waitlist_on_yes_action, shop_name, tone, emoji_level')
      .eq('groomer_id', groomerId)
      .maybeSingle()

    if (!settings || !settings.waitlist_auto_notify_enabled) {
      return new Response(
        JSON.stringify({ notified: false, reason: 'Auto-notify disabled in settings' }),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    var responseMins = settings.waitlist_response_window_minutes || 30
    var filterRules = settings.waitlist_auto_notify_instructions || ''
    var shopName = settings.shop_name || ''
    var tone = settings.tone || 'friendly'
    var emojiLevel = settings.emoji_level || 'sometimes'

    // 2. Determine slot's day of week
    var slotDay = getDayOfWeek(startIso)

    // 3. Pull waitlist candidates matching the day
    var { data: allCandidates, error: wlErr } = await supabaseAdmin
      .from('grooming_waitlist')
      .select('id, client_id, pet_id, service_id, position, preferred_days, preferred_time_start, preferred_time_end, any_time, notes, clients(first_name, last_name, phone, user_id), pets(name, breed, weight), services:service_id(service_name, price)')
      .eq('groomer_id', groomerId)
      .eq('status', 'waiting')
      .contains('preferred_days', [slotDay])
      .order('position', { ascending: true })

    if (wlErr) {
      console.error('[waitlist-notify] Waitlist fetch error:', wlErr)
      return new Response(
        JSON.stringify({ notified: false, reason: 'Waitlist fetch error: ' + wlErr.message }),
        { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    if (!allCandidates || allCandidates.length === 0) {
      return new Response(
        JSON.stringify({ notified: false, reason: 'No eligible waitlist entries match the day', day: slotDay }),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    // 4. Load slot's service name (for Haiku + template)
    var slotServiceName = null
    if (slotServiceId) {
      var { data: svc } = await supabaseAdmin
        .from('services')
        .select('service_name')
        .eq('id', slotServiceId)
        .maybeSingle()
      if (svc) slotServiceName = svc.service_name
    }

    // 5. Build compact candidate summary for Haiku
    var candidateSummary = allCandidates.map(function (c) {
      return {
        id: c.id,
        position: c.position,
        client_name: c.clients ? (c.clients.first_name + ' ' + c.clients.last_name) : 'Unknown',
        pet: c.pets ? {
          name: c.pets.name,
          breed: c.pets.breed,
          weight_lbs: c.pets.weight,
        } : null,
        requested_service: c.services ? c.services.service_name : 'Any service',
        preferred_time_start: c.preferred_time_start,
        preferred_time_end: c.preferred_time_end,
        any_time: !!c.any_time,
        notes: c.notes || '',
      }
    })

    var slotInfo = {
      day_of_week: slotDay,
      start_iso: startIso,
      end_iso: endIso,
      service: slotServiceName || 'unspecified',
    }

    // 6. Ask Haiku to pick
    var pick = await askHaikuToPick(slotInfo, candidateSummary, filterRules, shopName)

    if (!pick.picked_id) {
      return new Response(
        JSON.stringify({ notified: false, reason: 'No candidate passed filter rules', ai_reason: pick.reason }),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    // 7. Find picked candidate
    var picked = null
    for (var c of allCandidates) {
      if (c.id === pick.picked_id) { picked = c; break }
    }

    if (!picked || !picked.clients) {
      return new Response(
        JSON.stringify({ notified: false, reason: 'Picked candidate missing client data' }),
        { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    // 8. Build the offer message
    var ownerName = picked.clients.first_name + ' ' + picked.clients.last_name
    var petName = picked.pets ? picked.pets.name : 'your pet'
    var displayServiceName = slotServiceName || (picked.services ? picked.services.service_name : null)

    var msgText = buildOfferMessage({
      ownerName: ownerName,
      petName: petName,
      slotIso: startIso,
      serviceName: displayServiceName,
      responseMins: responseMins,
      tone: tone,
      emojiLevel: emojiLevel,
      shopName: shopName,
    })

    // 9. Find / create thread
    var { data: existingThread } = await supabaseAdmin
      .from('threads')
      .select('id')
      .eq('groomer_id', groomerId)
      .eq('client_id', picked.client_id)
      .maybeSingle()

    var threadId = existingThread ? existingThread.id : null
    if (!threadId) {
      var { data: newThread, error: threadErr } = await supabaseAdmin
        .from('threads')
        .insert({
          groomer_id: groomerId,
          client_id: picked.client_id,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (threadErr || !newThread) {
        console.error('[waitlist-notify] Thread create error:', threadErr)
        return new Response(
          JSON.stringify({ notified: false, reason: 'Could not start message thread' }),
          { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
        )
      }
      threadId = newThread.id
    }

    // 10. Insert message (sender_type='groomer' — looks like the groomer sent it)
    var { data: newMsg, error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        thread_id: threadId,
        groomer_id: groomerId,
        client_id: picked.client_id,
        sender_type: 'groomer',
        text: msgText,
        attachment_url: null,
        read_by_groomer: true,
        read_by_client: false,
      })
      .select()
      .single()

    if (msgErr || !newMsg) {
      console.error('[waitlist-notify] Message insert error:', msgErr)
      return new Response(
        JSON.stringify({ notified: false, reason: 'Message insert failed' }),
        { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
      )
    }

    // 11. Bump thread's last_message_at
    await supabaseAdmin
      .from('threads')
      .update({ last_message_at: newMsg.created_at })
      .eq('id', threadId)

    // 12. Mark waitlist entry as notified + set expiry
    var expiresAt = new Date(Date.now() + responseMins * 60 * 1000).toISOString()
    await supabaseAdmin
      .from('grooming_waitlist')
      .update({
        status: 'notified',
        notified_at: new Date().toISOString(),
        expires_at: expiresAt,
        offered_slot_start: startIso,
        offered_slot_end: endIso,
        offered_appointment_id: cancelledApptId,
        staff_id: staffId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', picked.id)

    // 13. Fire push to the client (fire-and-forget)
    if (picked.clients.user_id) {
      sendPushToUser(
        picked.clients.user_id,
        '🎉 A spot opened up for ' + petName + '!',
        'Reply YES within ' + responseMins + ' min to claim it.',
        '/portal/messages',
        'waitlist-offer-' + picked.id
      )
    }

    // Done!
    return new Response(
      JSON.stringify({
        notified: true,
        client_name: ownerName,
        pet_name: petName,
        waitlist_entry_id: picked.id,
        message_id: newMsg.id,
        message_text: msgText,
        expires_at: expiresAt,
        ai_reason: pick.reason,
      }),
      { status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
    )

  } catch (err) {
    console.error('[waitlist-notify] Unhandled error:', err)
    return new Response(
      JSON.stringify({ notified: false, reason: 'Server error: ' + String(err) }),
      { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders) }
    )
  }
})
