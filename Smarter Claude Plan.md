# 🧠 Smarter Claude — Master Plan

> **Goal:** Claude stops being a booking robot. Starts being a memory assistant who knows every pet and client like Nicole does.
>
> **Approach:** RAG (Retrieval Augmented Generation). Before Claude answers, we fetch relevant pet/client/notes data from Supabase and inject it into the conversation context. Claude then speaks like he remembers them personally.
>
> **Pricing context:** AI usage cap is in place per tier. Smarter Claude burns more credits per call (more context = more tokens). To handle this we'll add a "buy more credits" pack so power users who blow through their cap can keep using the AI without waiting for the next billing cycle.
>
> **Status legend:** `[ ]` not started · `[/]` in progress · `[x]` done
>
> **Files most affected:**
> - `chat-command-v2-services.ts` (groomer-side Claude tool definitions)
> - `client-chat-command.ts` (client-side, more guardrailed)
> - `ai_personalization` table (tone, voice, memory toggles)
> - `ai_usage` table (credits + cap)

---

## Phase 1 — Deep pet context tool
**The foundation. Build this first.**

- [ ] New Claude tool: `get_pet_full_context`
- [ ] **Inputs:** `pet_id` OR (`pet_name` + `client_name`) — Claude picks
- [ ] **Returns structured object:**
  - Pet basics: name, breed, weight, age, sex, intact status
  - Health: allergies, medications, vaccination status + expiry, vet contact
  - Behavior: tags (anxious, reactive, etc.), incident history (last 3)
  - Grooming history: last 5 appointments — date, service, groomer, notes, tip given
  - Pattern: typical service interval (avg days between visits), typical service, typical day of week, typical time
  - Owner context: name, communication preferences, payment preferences, recent message highlights
  - Photos: URLs to last 3 visit photos if available
- [ ] Update Claude system prompt: *"When asked about a specific pet, ALWAYS call `get_pet_full_context` first before answering. Speak like you remember the pet personally — use their name, reference past visits, mention behavioral notes when relevant."*
- [ ] **Test:** Ask "what's Teddy here for?" → Claude reads context and replies:
  > *"Teddy's normal full groom + nail trim. He's nervous around clippers — Sarah usually does him in the back room. Last visit was 5 weeks ago. Susan asked you to check his new tick collar fits ok."*

---

## Phase 2 — Pattern recognition tool
**The "you've been doing this for years" feel.**

- [ ] New Claude tool: `get_pet_pattern`
- [ ] **Returns:**
  - Typical interval in days
  - Typical day of week (most-booked day)
  - Typical time of day (morning/afternoon/specific hour)
  - Typical service (most-booked for this pet)
  - Average price paid
  - % of times tipped, average tip
  - Days overdue (vs typical interval)
- [ ] **Use cases:**
  - "When does Teddy usually come in?" → "Every 6 weeks, usually Tuesday around 2 PM"
  - "Is Buddy due?" → "He's 7 weeks since last groom — yes, overdue by a week"
  - "Should I follow up with Susan?" → "Yes — she's 2 weeks past her usual interval, normally she texts to rebook by week 5"
- [ ] **Test:** Ask Claude pattern questions on 5 different pets, verify accuracy

---

## Phase 3 — Notes synthesis
**When you ask "what's the deal here", Claude gives the full picture.**

- [ ] New Claude tool: `read_appointment_context`
- [ ] **Pulls everything for an upcoming appointment:**
  - Appointment basics (date, time, service, multi-pet?)
  - Pet context (from Phase 1)
  - Owner context (preferences, recent messages)
  - Booking notes (special requests for THIS visit)
  - Recent message thread highlights (last 5 messages)
- [ ] Synthesizes into a paragraph: *"Susan booked Teddy for a Full Groom Under 70lbs at 2 PM. He's 5 weeks since last visit (right on schedule). Behavioral note: Teddy hates the dryer and is sensitive around the back legs. Susan's last message asked if you can finish by 3:30 because of school carpool."*
- [ ] **Test:** Ask "tell me about my 2 PM" → Claude reads everything and gives a clean briefing

---

## Phase 4 — Owner relationship memory
**Communication preferences as a first-class field.**

- [ ] **Schema choice:** extend `clients` table with new fields:
  - `comm_preference` (enum: text, call, email)
  - `pickup_pref_time` (text, e.g. "before 4pm because of carpool")
  - `payment_pref` (enum: cash, card_on_file, zelle, venmo, invoice)
  - `personality_notes` (text, free-form: "always brings homemade treats, asks about Sarah's kids")
- [ ] OR cleaner: new `client_preferences` table linked by client_id
- [ ] Add UI section on `ClientDetail.jsx`: "About this client" panel to edit these
- [ ] Claude tool: `get_client_preferences` — returns these to inject into context
- [ ] Update Claude system prompt: *"Always respect comm_preference. If text, never suggest calling. If a personality_note exists, weave it into messages naturally."*
- [ ] **Test:** Set Susan's pref to "text only, never call" → Claude refuses to suggest calling and texts instead

---

## Phase 5 — Behavior + incident alerts
**Proactive surfacing of incidents at the right moment.**

- [ ] Claude tool: `get_pet_incidents` — pulls from `incidents` table (already exists)
- [ ] When prepping for an appointment OR asked about a pet, surface incidents proactively:
  > "Heads up — last March, Teddy snapped at the dryer. Susan was warned. Maybe use the cool setting today."
- [ ] Show in chat AND optionally as a yellow banner on the appointment popup
- [ ] **Test:** Add an incident to Buddy → ask Claude about Buddy → Claude mentions it unprompted

---

## Phase 6 — Service prediction
**Suggests upsells based on real signals, not random.**

- [ ] Claude tool: `suggest_services_for_pet`
- [ ] **Logic inputs:**
  - Coat type (from breed defaults + pet record)
  - Time since last service
  - Last 3 services on this pet
  - Photos from last visit (if AI vision is enabled)
  - Service catalog with prices + time blocks
- [ ] **Returns:** recommended service + reasoning
  > *"Buddy is 8 weeks out. Last 3 visits were Full Groom Under 10lbs. His coat photo from last visit shows mild matting — suggest deshed addon today (+$15)."*
- [ ] **Test:** Ask "what should I do for Buddy?" → Claude suggests services with reasoning, not generic recommendations

---

## Phase 7 — Conversational tone calibration
**Claude sounds like the groomer, not like a chatbot.**

- [ ] Claude already reads `ai_personalization.tone` and `emoji_level`
- [ ] **Extend:** when greeting a client by name, vary the greeting based on tone:
  - Warm: "Hi Susan!"
  - Professional: "Good morning, Susan,"
  - Playful: "Hey Susan! 🐾"
- [ ] Add new field `personality_examples` (text) where Nicole can write 3-5 sample messages in her own voice
- [ ] Claude reads these as few-shot examples and mimics the voice
- [ ] **Test:** Set Nicole's personality_examples to her actual texting style → Claude's outgoing messages sound like Nicole

---

## Phase 8 — Anniversary / recall in chat
**Smart Nudges, but in the chat itself.**

- [ ] Smart Nudges already exist on the chat widget
- [ ] **Extend so:** when groomer chats with Claude on any topic, he can proactively interject:
  > "While you're here — Buddy is overdue by 2 weeks, want me to text Susan?"
- [ ] Trigger logic: every chat turn, run a low-cost check for any pet > 1 week past typical interval, surface ONE if relevant
- [ ] **Test:** Chat with Claude any topic → he interjects relevant overdue rebooks naturally (not annoyingly)

---

## Phase 9 — Buy more AI credits add-on
**Mid-tier-feature. Power users keep using AI past their cap.**

- [ ] **New page:** `src/pages/AddCredits.jsx`
- [ ] **One-time Stripe Payment Links** (cheaper than Viktor):
  - +500 credits = $9
  - +1500 credits = $19
  - +5000 credits = $49
  - Unlimited rest of month = $79
- [ ] **Stripe webhook handler:** `stripe-credits-webhook`
  - When one-time payment completes with metadata `credit_pack=500`, bumps `ai_usage.monthly_cap_extra` by 500
- [ ] AI usage check function reads `monthly_cap + monthly_cap_extra` instead of just `monthly_cap`
- [ ] Reset on next billing cycle: extra credits expire with the period (clean rollover, no accumulation forever)
- [ ] **Dashboard UI:** when usage > 80% of cap, show banner:
  > "You've used 800/1000 credits this month. Buy more so the AI doesn't pause →"
- [ ] **Test:** Spend down to 0 credits → buy 500 pack → confirm credits restored → ask Claude something → confirm count goes down again

---

## Phase 10 — Tone adjust per relationship
**Some clients are best friends, some are formal. Claude adapts.**

- [ ] New field on `clients`: `relationship_tone` (formal / warm / playful / professional)
- [ ] Claude reads this and adjusts replies + sent messages accordingly
- [ ] Default: inherit from `ai_personalization.tone` (shop-wide tone) unless client-specific is set
- [ ] **Test:** Set Susan to "playful," set Janet to "formal" → both get bookings confirmed in their voice

---

## Phase 11 — Memory recall test mode (dev tool)
**For tuning the depth of context Claude pulls.**

- [ ] Hidden dev page: `/dev/quiz-claude` (only platform owner whitelist sees it)
- [ ] Picks a random pet/client → asks Claude "tell me everything you know about [pet]"
- [ ] Lets Nicole grade if Claude got the details right
- [ ] Helps tune which fields the deep-context tool pulls
- [ ] **Test:** Quiz Claude on Buddy → he should recall service history, behavior, owner prefs, recent visits

---

## Suggested execution order

1. **Phase 9 (Credit pack)** — first, so power users have an out before we crank up Claude's token usage
2. **Phase 1 (Deep pet context)** — the foundation everything else builds on
3. **Phase 2 (Pattern recognition)** — biggest "wow" with smallest cost
4. **Phase 3 (Notes synthesis)** — the daily magic
5. **Phase 4 (Owner preferences)** — needs new schema, do once Claude is reading more
6. **Phase 5, 6, 7, 8, 10, 11** — polish and refinement

---

## Cost / token awareness

Each Claude call now will roughly double in token count because we're injecting more context. Examples:

| Call type | Before tokens | After tokens | Cost impact |
|---|---|---|---|
| Simple booking | ~500 in / 200 out | ~500 in / 200 out | No change |
| "What's Teddy here for?" | ~500 / 200 | ~2,500 / 400 | ~5x cost |
| Pattern question | n/a (couldn't answer) | ~3,000 / 300 | new feature |
| Briefing | n/a | ~4,000 / 500 | new feature |

**With Haiku 4.5 pricing (cheap), even 5x cost per call is sustainable for a $129/mo plan if usage stays under ~2000 calls/month. Phase 9 (credit packs) covers anyone who blows through that.**

---

## Stuck points to flag

- **Privacy:** RAG context includes a LOT of client info. Make sure the client portal Claude has STRICTER context filtering — clients shouldn't be able to ask Claude "tell me about Susan" and get details about another client.
- **Cap enforcement:** Phase 9 credit pack must hard-block AI calls when balance hits 0. Currently the cap warns but might not stop the call. Verify before this rolls out.
- **Personality examples token budget:** if Nicole writes 50 examples, the system prompt blows up. Cap to ~5 best examples per shop.

---

## Files I'll be touching (running tally)

| File | Purpose | Phase |
|---|---|---|
| `chat-command-v2-services.ts` | Groomer Claude tools (get_pet_full_context, get_pet_pattern, etc.) | 1, 2, 3, 4, 5, 6, 8 |
| `client-chat-command.ts` | Client portal Claude (stricter context) | 1 (filtered) |
| Migration SQL | Extend `clients` table with prefs fields | 4 |
| `src/pages/ClientDetail.jsx` | "About this client" prefs panel | 4, 10 |
| `src/pages/AddCredits.jsx` | NEW — buy more credits | 9 |
| `supabase/functions/stripe-credits-webhook/index.ts` | NEW | 9 |
| `src/components/AIChatWidget.jsx` | Surface 80% usage banner | 9 |
| `src/pages/ChatSettings.jsx` | Add `personality_examples` editor | 7 |
| `ai_personalization` table | Add `personality_examples` field | 7 |
| `ai_usage` table | Add `monthly_cap_extra` field | 9 |

---

## Acceptance criteria (whole feature)

- [ ] Asking Claude about ANY pet returns a personalized, accurate response that references real data
- [ ] Claude can answer "is X overdue" / "when does X usually come" / "what should I do for X"
- [ ] Owner communication prefs are respected (no calls if text-only)
- [ ] Behavioral incidents surface proactively at the right moments
- [ ] Power users can buy extra credits when they blow through the monthly cap
- [ ] Privacy intact: client-side Claude can't leak data about other clients
- [ ] Costs stay sustainable per tier (Phase 9 catches anyone who exceeds)
