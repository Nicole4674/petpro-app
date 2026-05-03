// =============================================================================
// petpro-smart-book — AI-Powered Smart Booking
// =============================================================================
// Returns the top 3 best appointment slots for a pet in the next N days,
// ranked by Claude with reasoning. Combines:
//   • Pet's grooming history (last 5 visits — pattern matching)
//   • Pet's grooming notes + behavior + allergies + breed (from PetPro Brain)
//   • Open slots in the date range (computed from appointments + blocked_times)
//   • Drive-time efficiency (mobile shops only — not in v1)
//   • Standard cadence (e.g. 6 weeks since last visit)
//
// Branding note: AI is "PetPro AI" to the user — never expose Claude/Anthropic.
//
// Request body (POST):
//   {
//     client_id: string,
//     pet_id: string,
//     service_id: string,
//     days_ahead?: number,        // default 14
//     time_of_day_preference?: 'morning' | 'afternoon' | 'evening' | 'any',
//     preferred_staff_id?: string
//   }
//
// Response:
//   {
//     suggestions: [
//       {
//         appointment_date: 'YYYY-MM-DD',
//         start_time: 'HH:MM',
//         end_time: 'HH:MM',
//         duration_minutes: number,
//         reasoning: string,
//         warnings?: string[]      // e.g. "matted last visit, may need extra time"
//       },
//       ...
//     ]
//   }
//
// Required env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CLAUDE_API_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ─── Brain knowledge for booking decisions (slim subset) ─────────────────────
// Just the pieces relevant to picking slots. The full Brain lives in chat-command.
const BOOKING_BRAIN = `# PETPRO BRAIN — BOOKING DECISIONS

## MATTING & TIME GAPS
- A pet that's been 4+ months since last visit will likely come in matted
- Matted dogs need EXTRA time (add 30-60 minutes buffer)
- Recurring patterns (every 4-6 weeks) = pet stays in good shape, normal time

## ANXIOUS / DRAMATIC BREEDS
- Goldendoodles, Aussies, Goldens, Huskies = often anxious
- Schedule them when groomer is fresh (morning) NOT end of day
- Avoid stacking anxious dogs back-to-back — bathing breaks help
- Cavapoos = usually gentle, low-drama, fits anywhere

## SENIOR DOGS
- Stick with their usual groomer if at all possible
- Schedule when groomer can take it slow
- Earlier in the day if they fatigue easily

## PUPPIES (first-timers especially)
- Plan a slightly longer slot (sessions go longer with breaks)
- Morning is best — puppy is fresh, groomer is fresh
- Avoid Friday-afternoon energy — bad first impression risk

## CADENCE PATTERNS
- Most regular clients want the SAME day of week as their previous visits
- Same time of day if possible (morning vs afternoon habit)
- Recurring 4-6 week cadence is the gold standard

## DRIVE TIME (mobile groomers only)
- Cluster appointments by area when possible
- Going from far north to far south same day = bad
- If a slot lets you stay near other appointments, prefer it
`

// ─── Utility: compute free slots for a single day ─────────────────────────────
// Returns array of { start, end, durationMinutes } for any free time block
// >= the requested service duration.
function computeFreeSlotsForDay(
  date: string,
  busyRanges: Array<{ start: string; end: string }>,
  workStart: string,
  workEnd: string,
  serviceDurationMinutes: number,
  slotIncrementMinutes = 30 // suggest slots on 30-min boundaries
): Array<{ date: string; start: string; end: string; durationMinutes: number }> {
  const toMin = (t: string): number => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }
  const fromMin = (m: number): string => {
    const h = Math.floor(m / 60)
    const mm = m % 60
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  }

  // Sort busy ranges by start time
  const busy = busyRanges
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }))
    .sort((a, b) => a.start - b.start)

  const dayStart = toMin(workStart || "09:00")
  const dayEnd = toMin(workEnd || "17:00")

  // Walk through the day, finding gaps between busy ranges
  const freeBlocks: Array<{ start: number; end: number }> = []
  let cursor = dayStart
  for (const b of busy) {
    if (b.start > cursor) {
      freeBlocks.push({ start: cursor, end: Math.min(b.start, dayEnd) })
    }
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < dayEnd) {
    freeBlocks.push({ start: cursor, end: dayEnd })
  }

  // Within each free block, suggest start times on 30-min boundaries that fit the service
  const suggestions: Array<{ date: string; start: string; end: string; durationMinutes: number }> = []
  for (const block of freeBlocks) {
    let startCandidate = Math.ceil(block.start / slotIncrementMinutes) * slotIncrementMinutes
    while (startCandidate + serviceDurationMinutes <= block.end) {
      suggestions.push({
        date,
        start: fromMin(startCandidate),
        end: fromMin(startCandidate + serviceDurationMinutes),
        durationMinutes: serviceDurationMinutes,
      })
      startCandidate += slotIncrementMinutes
    }
  }

  return suggestions
}

// ─── Format date as YYYY-MM-DD in local time (no UTC drift) ──────────────────
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ─── Day of week helper (for pattern detection in prompt) ────────────────────
function dayOfWeek(dateStr: string): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const d = new Date(dateStr + "T12:00:00")
  return days[d.getDay()]
}

// ─── Edge function handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const claudeKey = Deno.env.get("CLAUDE_API_KEY")!

    if (!claudeKey) {
      return jsonResponse({ error: "CLAUDE_API_KEY not configured" }, 500)
    }

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401)
    }

    // Parse request
    const body = await req.json()
    const { client_id, pet_id, service_id, days_ahead, time_of_day_preference, preferred_staff_id } = body
    if (!client_id || !pet_id || !service_id) {
      return jsonResponse({ error: "client_id, pet_id, and service_id are required" }, 400)
    }

    const daysAhead = Math.max(1, Math.min(60, days_ahead || 14)) // cap at 60 days
    const groomerId = user.id

    // Service-role client for data loading (bypasses RLS so we can pull broadly)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // ─── 1. Pet info (breed, weight, notes, behavior, allergies) ─────────────
    const { data: pet } = await adminClient
      .from("pets")
      .select("id, name, breed, weight, age, sex, allergies, medications, behavior_tags, grooming_notes, is_senior")
      .eq("id", pet_id)
      .maybeSingle()
    if (!pet) {
      return jsonResponse({ error: "Pet not found" }, 404)
    }

    // ─── 2. Client info (name, address) ──────────────────────────────────────
    const { data: client } = await adminClient
      .from("clients")
      .select("id, first_name, last_name, address")
      .eq("id", client_id)
      .maybeSingle()

    // ─── 3. Last 5 appointments for this pet (pattern detection) ─────────────
    const { data: lastAppts } = await adminClient
      .from("appointments")
      .select("appointment_date, start_time, end_time, status, services(service_name), staff_id")
      .eq("pet_id", pet_id)
      .neq("status", "cancelled")
      .order("appointment_date", { ascending: false })
      .limit(5)

    // ─── 4. Service info ─────────────────────────────────────────────────────
    const { data: service } = await adminClient
      .from("services")
      .select("id, service_name, time_block_minutes, price")
      .eq("id", service_id)
      .maybeSingle()
    if (!service) {
      return jsonResponse({ error: "Service not found" }, 404)
    }
    const serviceDurationMinutes = service.time_block_minutes || 60

    // ─── 5. Shop settings (business hours, is_mobile) ────────────────────────
    const { data: shopSettings } = await adminClient
      .from("shop_settings")
      .select("business_hours_start, business_hours_end, is_mobile, slot_duration_minutes")
      .eq("groomer_id", groomerId)
      .maybeSingle()

    const workStart = shopSettings?.business_hours_start || "09:00"
    const workEnd = shopSettings?.business_hours_end || "17:00"

    // ─── 6. Existing appointments in date range (for conflict checking) ──────
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startDate = isoDate(today)
    const endDateObj = new Date(today)
    endDateObj.setDate(endDateObj.getDate() + daysAhead)
    const endDate = isoDate(endDateObj)

    let apptQuery = adminClient
      .from("appointments")
      .select("appointment_date, start_time, end_time, staff_id, status")
      .eq("groomer_id", groomerId)
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .neq("status", "cancelled")

    if (preferred_staff_id) {
      apptQuery = apptQuery.eq("staff_id", preferred_staff_id)
    }

    const { data: existingAppts } = await apptQuery

    // ─── 7. Blocked times in date range ──────────────────────────────────────
    let blockQuery = adminClient
      .from("blocked_times")
      .select("block_date, start_time, end_time, staff_id")
      .eq("groomer_id", groomerId)
      .gte("block_date", startDate)
      .lte("block_date", endDate)

    if (preferred_staff_id) {
      // Match blocks for this staff OR shop-wide blocks (staff_id is null)
      blockQuery = blockQuery.or(`staff_id.eq.${preferred_staff_id},staff_id.is.null`)
    }

    const { data: blocks } = await blockQuery

    // ─── 8. Compute free slots for each day in range ─────────────────────────
    const allFreeSlots: Array<{ date: string; start: string; end: string; durationMinutes: number; dayLabel: string }> = []

    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const dateStr = isoDate(d)

      // Collect busy ranges for this day
      const busy: Array<{ start: string; end: string }> = []
      ;(existingAppts || []).forEach((a: any) => {
        if (a.appointment_date === dateStr) {
          busy.push({ start: a.start_time, end: a.end_time })
        }
      })
      ;(blocks || []).forEach((b: any) => {
        if (b.block_date === dateStr) {
          busy.push({ start: b.start_time, end: b.end_time })
        }
      })

      const daySuggestions = computeFreeSlotsForDay(
        dateStr,
        busy,
        workStart,
        workEnd,
        serviceDurationMinutes
      )

      // Optional: filter by time-of-day preference
      let filtered = daySuggestions
      if (time_of_day_preference === "morning") {
        filtered = daySuggestions.filter((s) => parseInt(s.start.split(":")[0]) < 12)
      } else if (time_of_day_preference === "afternoon") {
        filtered = daySuggestions.filter((s) => {
          const h = parseInt(s.start.split(":")[0])
          return h >= 12 && h < 17
        })
      } else if (time_of_day_preference === "evening") {
        filtered = daySuggestions.filter((s) => parseInt(s.start.split(":")[0]) >= 17)
      }

      filtered.forEach((s) =>
        allFreeSlots.push({ ...s, dayLabel: dayOfWeek(dateStr) })
      )
    }

    if (allFreeSlots.length === 0) {
      return jsonResponse({
        suggestions: [],
        reason: "No open slots found in the next " + daysAhead + " days that fit this service. Try expanding the date range or removing time-of-day filters.",
      })
    }

    // ─── 9. Build the prompt for Claude ──────────────────────────────────────
    const lastVisitsSummary = (lastAppts || []).map((a: any, idx: number) => {
      const dow = dayOfWeek(a.appointment_date)
      const svc = a.services?.service_name || "unknown service"
      return `   ${idx + 1}. ${a.appointment_date} (${dow}) at ${a.start_time} — ${svc}`
    }).join("\n") || "   (no previous visits — first-time client for this pet)"

    // Cap candidates we send to Claude. Use first ~50 to stay efficient.
    const candidatesToShow = allFreeSlots.slice(0, 50)
    const candidatesText = candidatesToShow.map((s) =>
      `   - ${s.date} (${s.dayLabel}) ${s.start}-${s.end}`
    ).join("\n")

    const userPrompt = `Pick the TOP 3 best appointment slots for this booking.

# THE PET
- Name: ${pet.name}
- Breed: ${pet.breed || "unknown"}
- Weight: ${pet.weight || "unknown"} lbs
- Age: ${pet.age || "unknown"}
- Senior: ${pet.is_senior ? "YES" : "no"}
- Behavior tags: ${(pet.behavior_tags || []).join(", ") || "none"}
- Allergies: ${pet.allergies || "none"}
- Medications: ${pet.medications || "none"}
- Grooming notes from groomer: ${pet.grooming_notes || "(none yet)"}

# THE CLIENT
- Name: ${client?.first_name || ""} ${client?.last_name || ""}
- Address: ${client?.address || "(no address on file)"}

# THE SERVICE
- Service: ${service.service_name}
- Duration: ${serviceDurationMinutes} minutes

# RECENT VISIT HISTORY (most recent first)
${lastVisitsSummary}

# AVAILABLE SLOTS (already filtered for conflicts + business hours)
${candidatesText}

# WHAT TO DO
Pick the TOP 3 slots from the AVAILABLE SLOTS list above that best fit this pet + client.

Use the PetPro Brain rules to decide. Apply your judgment using:
- Pattern matching (last visits' day-of-week + time-of-day)
- Time since last visit (if 4+ months, expect matting → may need extra time)
- Pet behavior (anxious dogs = morning when fresh, senior = slower pace)
- Standard cadence (4-6 weeks for most coated breeds)
- Grooming notes — if it says "always matted" or "anxious" or any flag, factor that in

# RESPONSE FORMAT — STRICT JSON ONLY, NO PROSE
Return ONLY this JSON shape (no markdown fences, no explanation outside the JSON):

{
  "suggestions": [
    {
      "appointment_date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "reasoning": "One sentence — why this slot is good. Mention specifics from the data above.",
      "warnings": ["optional flags like 'matted last visit, may need extra time'"]
    },
    ... up to 3 total
  ]
}

The appointment_date and start_time MUST exactly match one of the AVAILABLE SLOTS above. If something concerning came up (like a long gap since last visit), put that in warnings.`

    // ─── 10. Call Claude with prompt caching on the BOOKING_BRAIN ────────────
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: [
          {
            type: "text",
            text: `You are PetPro AI, the smart-booking assistant for professional dog groomers. You pick the best appointment slots based on pet history, breed knowledge, and groomer wisdom. You ONLY return valid JSON — no markdown, no prose outside the JSON shape.\n\n${BOOKING_BRAIN}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    })

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text()
      console.error("[smart-book] Claude error:", errText)
      return jsonResponse({ error: "PetPro AI is having trouble right now. Try again in a moment." }, 500)
    }

    const claudeData = await claudeResponse.json()
    const rawText = (claudeData.content || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim()

    // ─── 11. Parse + validate Claude's JSON response ─────────────────────────
    let parsed: any
    try {
      // Strip markdown fences if Claude added them despite instructions
      const jsonText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "")
      parsed = JSON.parse(jsonText)
    } catch (parseErr) {
      console.error("[smart-book] JSON parse failed. Raw text:", rawText)
      return jsonResponse({
        error: "PetPro AI returned an unexpected response. Try again.",
        debug: rawText.slice(0, 200),
      }, 500)
    }

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      return jsonResponse({
        error: "PetPro AI returned an unexpected response shape. Try again.",
      }, 500)
    }

    // Validate each suggestion against our available slots + add end_time + duration
    const validatedSuggestions = []
    for (const s of parsed.suggestions) {
      const match = candidatesToShow.find(
        (c) => c.date === s.appointment_date && c.start === s.start_time
      )
      if (!match) {
        console.warn("[smart-book] Claude suggested invalid slot:", s)
        continue // skip ones not in our list (Claude hallucinated)
      }
      validatedSuggestions.push({
        appointment_date: match.date,
        start_time: match.start,
        end_time: match.end,
        duration_minutes: match.durationMinutes,
        day_of_week: match.dayLabel,
        reasoning: s.reasoning || "",
        warnings: Array.isArray(s.warnings) ? s.warnings : [],
      })
    }

    return jsonResponse({
      suggestions: validatedSuggestions,
      total_open_slots: allFreeSlots.length,
      service: {
        id: service.id,
        name: service.service_name,
        duration_minutes: serviceDurationMinutes,
        price: service.price,
      },
    })
  } catch (err: any) {
    console.error("[petpro-smart-book] error:", err)
    return jsonResponse({ error: err.message || "Internal error" }, 500)
  }
})

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
