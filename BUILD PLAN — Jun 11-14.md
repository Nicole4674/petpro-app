# PetPro Build Plan — June 11–14, 2026

Written at the end of the Jun 10 mega-session (big five money-makers all shipped:
Review Booster, SMS segments + blast tracking, promo/referral links, punch cards
both passes, SMS top-ups with never-expire extras).

---

## 📋 THURSDAY Jun 11 — Polish Day (5 items, ~half-day each or less)

### 1. Manual "⭐ Send review link" button
- **Where:** appointment popup in `src/pages/Calendar.jsx`
- **What:** button that calls the existing `send-review-request` function for THIS
  appointment on demand — for clients who were skipped (no consent back then,
  booster was off, etc.)
- **Note:** function already handles all guards (once-ever, link set, consent);
  just needs the button + maybe surface the "skipped" reason to the groomer.

### 2. "Have a code?" box on client signup
- **Where:** `src/pages/ClientSignup.jsx`
- **What:** small optional input — client types a promo code (from a Facebook
  post / word of mouth) when arriving WITHOUT a share link. Feeds the same
  promoCode path the URL param uses. Validate format only; real validation
  stays server-side at booking.

### 3. Punch card refund auto-pause
- **What:** Stripe webhook on `charge.refunded` for Connect accounts → find
  punch_cards by payment → set status='refunded'.
- **Files:** new edge function (webhook), needs webhook endpoint registered in
  Stripe Dashboard (Connect events). The one item with actual Stripe setup.

### 4. Token topper migration
- **What:** rebuild AI-token top-up purchase on the same pattern as SMS top-ups
  (create-checkout + confirm functions, idempotent, no dashboard payment link).
  One mental model: "anything you buy extra never expires" — tokens already
  behave this way, this just unifies the plumbing.
- **Reference:** `supabase/functions/create-sms-topup-checkout` + `confirm-sms-topup`

### 5. Zone map view
- **Where:** `src/pages/Zones.jsx`
- **What:** show zones on a Google Map (zip centroids or drawn polygons) so
  groomers SEE their coverage. v1 can be read-only display; drawing tools later.

### 6. FREE AI migration (without a free-AI loophole)
- **Goal:** migrating a shop in should never burn the groomer's AI actions —
  it's the cost of acquiring a $70–399/mo subscriber. But migration mode must
  not become a backdoor for free booking/general AI.
- **Design (agreed Jun 10):** migration mode is a SERVER-ENFORCED restricted
  toolset — when the flag is set, the edge function swaps tools to ONLY:
  add client / add pet / add vaccination / parse files. No booking, no
  availability, no SMS, no general chat tools. Free actions that can only be
  spent giving us their data = no abuse surface.
  1. Skip token deduction when migration flag is set (server-side)
  2. Flag selects the restricted toolset IN THE FUNCTION (never trust client)
  3. Log migration usage; alert if any account exceeds ~2,000 migration
     actions (likely legit big shop, but worth eyes)
  4. Suds politely redirects booking requests: "let's finish moving your
     shop in first — booking lives in the main chat!"
- **Where:** whichever function powers migration chat (check how the Import
  page invokes it — likely petpro-ai-chat or chat-command with a mode flag) +
  its token-deduction call.
- **Also:** fix "Moe Go" → "MoeGo" spelling in migration prompt + import page
  banner; verify the voice-dictation promise in the migration intro actually
  works, or remove that bullet.

---

## 🐶 SATURDAY Jun 13 — Daycare Module

- Rides the boarding rails (~70% reuse: check-in/out, capacity, kennel/run
  assignment) reshaped into half-day / full-day blocks.
- Key decisions to make at session start: packages vs per-day pricing,
  capacity model (headcount vs runs), recurring daycare schedules
  (every Mon/Wed/Fri), report cards per daycare day?
- Sidebar already has the "DAYCARE — SOON" placeholder.

## 🎓 SUNDAY Jun 14 — Dog Training Module

- MoeGo does NOT have this — differentiator.
- Build the skeleton from Nicole's own training knowledge, then her friend
  (one of Houston's top trainers) reacts to the working thing.
- Skeleton scope: session packages (rides punch-card rails?), per-dog progress
  notes, homework for owners (portal-visible), trainer schedule type.
- Sidebar already has the "TRAINING — SOON" placeholder.

---

## ⏳ Waiting on (not build work)
- D-U-N-S number → Google Play (business account, no closed-test requirement)
- Play listing prep: screenshots, feature graphic, privacy policy URL, Data
  Safety form
- Real-world promo link test (first genuinely-referred client proves the chain)

## 🅿️ Parked for later (deliberate)
- Referrer auto-rewards (apply credit at their next checkout automatically)
- Multi-business / Enterprise (next year)
- Abandoned-booking recovery + embeddable booking widget
- Auto top-up opt-in toggle (default OFF if ever built)

## ⚠️ Before buying that SMS top-up test at 1,500 remaining
1. Run `SMS Topups Extra Balance v2.sql` in Supabase (if not already)
2. Redeploy `confirm-sms-topup` + `create-sms-topup-checkout` (if not already)
3. Then buy → expect green "EXTRA TEXTS (NEVER EXPIRE): 500" box + refund self
   in Stripe if desired (credits stay)
