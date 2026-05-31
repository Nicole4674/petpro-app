# 🦦 PetPro — Referrals & Marketing Suite Spec

*Captured May 30, 2026 from Nicole's brain-dump. This is the VISION + build order.
Nothing here is built yet. Build the foundation (Phases 1–5) BEFORE templates/posting.*
*Estimated scope: ~20 phases, roughly a month+ of work.*

---

## Core principles (do not violate)

1. **Suds never freelances.** He can ONLY post content that lives in a template
   the groomer has turned ON. Nothing AI-invents itself into a public post.
2. **Real photos only.** Marketing images come from the groomer's own uploaded
   grooming photos (the photo bucket) — NEVER AI-generated. Real grooms, real dogs.
3. **Template voice = a groomer talking.** Short, punchy, uses real grooming
   knowledge. Not corporate/markety. Sounds like the groomer wrote it.
4. **Groomer is always in control.** Toggles everywhere. They keep Suds's wording
   or tweak it — tweaking = their customizing.
5. **PetPro-only perk.** This whole marketing suite is exclusive to PetPro
   subscribers. It's a reason to be on PetPro.

---

## Foundation — must be built FIRST (before any templates/posting)

### Phase 1 — Remove the new-client booking hard-code
- Today: new clients CANNOT book without contacting the groomer — it's hard-coded
  even though a toggle exists.
- Fix: remove the hard-code so the toggle actually controls behavior.
- Default: **OFF**.
- When groomer flips it ON → confirmation popup:
  *"Are you sure you want NEW clients to book through your portal automatically?"*

### Phase 2 — Referral system (client → client)
- Every client portal has its OWN unique referral link/code.
- Flow: I (existing client) text my neighbor my referral link → she opens it →
  signs up, adds her pet, gets her own new client portal → books with Suds OR the
  groomer → the referral code auto-attaches to her appointment → discount applies
  automatically (e.g. $10 off). **Nothing for the groomer to do.**
- Groomer's side: the booking shows **who referred her** ("Referred by: Linda Dotty")
  right in the appointment popup, so the groomer can thank the referrer.
- The referral link only appears in the portal when the **new-client toggle is ON**
  (from Phase 1). Toggled off = no link shown.
- **Reward setting (per shop):** each groomer chooses whether the discount goes to
  just the new friend, OR both the new client AND the referrer.

### Phase 3 — "Preview the client portal" tab for groomers
- Problem Nicole found: most groomers have NO idea what the portal/booking looks
  like to their clients.
- Add a tab where the groomer can SEE the client portal view.
- Generic/fake data is fine (Viktor could populate realistic fake info).
- Doubles as the place new clients book with the referral code.

### Phase 4 — Photo bucket / gallery tab
- Groomers upload grooming photos from their phones into a photo tab.
- This is the ONLY source of marketing images. Real photos, never AI.
- Suds pulls from this bucket when building posts.

### Phase 5 — Coupons / promo codes for groomers
- Groomers create promo codes + payment links (promo codes, referral codes).
- These are what Suds can reference in marketing.

### Phase 5b — Fix & upgrade the lapsed-client win-back ("rebook nudge")
- **"Win-back fire" = the moment the system auto-sends a "come back" message to a
  client who hasn't booked in a while.**
- CURRENT STATE (verified May 30): the rebook nudge in `push-scheduler-v1.ts`
  sends an **app PUSH notification** (firePush), NOT a text — so it only reaches
  clients who installed the PWA + enabled notifications. And it fires on a fixed
  **42–56 day (6–8 week)** window. This does NOT match Nicole's intent.
- WANTED:
  - Switch from push → **SMS** (send via send-sms, like the waitlist does) so it
    reaches every consented client. Counts against SMS quota.
  - **Customizable duration** chosen by the groomer: 4 / 8 / 12 / 14 weeks, etc.
    Whatever the setting, any client who hasn't booked in that long gets the text.
  - Keep the existing guards: skip if they have a future appt, don't re-nudge too often.
- LATER POLISH (after Phase 5 coupons exist): optionally attach a coupon to the
  win-back, e.g. "Been 14 weeks? Here's a free nail filing 🐾". For now: just the
  SMS fire + the duration setting.

### VERIFIED working (May 30)
- **Waitlist free-messaging → SMS: confirmed.** `offer-cancelled-slot-to-waitlist`
  sends real texts via send-sms, with consent checks, quiet hours, a kill-switch
  toggle, and rollback if send fails. No change needed.

---

## SEPARATE SYSTEM — PetPro groomer→groomer referral (app growth, handoff #86)

NOTE: This is DIFFERENT from Phase 2 (which is a groomer's clients referring friends).
This one is groomers referring *other groomers* to subscribe to PetPro itself.

**Model — "monthly referral credit" (like Claude's 3/3, but 1/1 refilling monthly):**
- Each PetPro subscriber has **1 referral credit per month** (1/1 ticket).
- They share their personal code/link (e.g. `trypetpro.com/signup?ref=NICOLE-4XK2`).
- When the referred groomer **signs up AND pays their first bill**, BOTH the referrer
  and the new groomer get **30% off that billing month**.
- Using the credit empties it (1/1 → 0/1); it **refills to 1/1 at the next month**.
- Repeatable monthly: refer 1/month for 3 months = 30% off for 3 months. Max one
  30%-off reward active per month (does NOT stack to 60%).
- Rationale: 30% to retain a happy customer who brings another paying customer is
  cheaper than advertising.

**Build pieces (multi-session — NOT a one-sitting build):**
1. ✅ DONE — DB: `groomer_referral_codes` + `groomer_referrals` tables, `referred_by_code`
   on groomers, RLS. (File: `Groomer Referral Schema v1.sql`.) Monthly credit is DERIVED
   (a referral row this calendar month = credit used), no refill cron needed.
2. ✅ DONE — UI: `/refer` page (`src/pages/ReferGroomer.jsx`) shows shop-based code, share
   link, 1/1 monthly credit meter, referral history. Sidebar link "🎁 Refer & Save 30%".
   Code generated on first visit by `get-referral-code` edge function (shop-name slug +
   unique fallback).
3. ✅ DONE — Signup attribution: `/signup?ref=CODE` captured in `Signup.jsx`, passed to
   `signup-groomer-with-captcha`, which stamps `referred_by_code` and inserts a
   `groomer_referrals` row (status 'signed_up'). Referred user sees a 30%-off banner.
4. ✅ DONE — Reward trigger: in the PLATFORM billing webhook (`Stripe Webhook Code v1.ts`,
   deployed as `stripe-webhook`), `handleCheckoutCompleted` now calls `applyReferralReward`.
   It creates/reuses a `REFERRAL30` coupon (30% off, duration: once) and applies it to BOTH
   the referred groomer's and the referrer's subscription, then flips the referral row to
   'rewarded'. NOTE: because groomers pay via static payment links, the first charge is full
   price — the 30% lands on each party's NEXT invoice (not the month they just paid). Banner
   wording updated to "30% off a month" to match. Stripe allows only one discount per
   subscription, so it can't stack past 30%.
5. ⚠️ PARTIAL — Guards: reward only fires on a real paid bill (webhook = real payment) ✅.
   "Only 1 reward per referrer per month" is NOT separately enforced yet — but the
   single-discount-per-subscription rule means a referrer can't exceed 30% off in a month
   anyway. Revisit if we want to also CAP how many referrals earn in a month.

**Suggested first slice (safe, testable on its own):** DB schema + the "Refer a
Groomer" page that shows the code/link and 1/1 credit status. The Stripe reward
automation (step 4) is the complex part — do it as its own step after.

---

## Marketing layer — built AFTER the foundation

### Phase 6 — Marketing templates (~10 to start)
- Short, punchy, groomer-voice. Example: *"Use this code to save $5"* + a photo
  from the grooming bucket + the code.
- Each template has an **on/off toggle** at the bottom.
- Groomer keeps Suds's wording or tweaks it (= customizing).
- Instructions shown at the TOP of the marketing tab so groomers understand the system.

### Phase 7 — Suds auto-posting engine
Posting rules (groomer stays in control):
- Suds can ONLY post from templates that are toggled **ON**.
- **All toggles OFF → auto-posting OFF**, with confirm popup:
  *"Are you sure you don't want marketing on?"*
- **Auto-generate toggle:**
  - OFF = groomer writes/keeps exactly what they want; e.g. 5 templates on = 5 days
    of posts, then it stops.
  - ON = after those posts run out, Suds generates MORE (still groomer-voice,
    still from the bucket).
- **"Ask before post" toggle:**
  - "Ask before post" = Suds drafts, groomer approves each one (don't-trust-the-system mode).
  - "Don't ask" = Suds posts on its own, groomer does nothing (full-blown marketing).
- If only some templates are on (e.g. 2), Suds posts those and may prompt:
  *"Want Suds to customize 2 more?"* — anything beyond needs approval.
- All on + auto-generate + don't-ask = full hands-off marketing machine.

### Phase 8 — Social connections (Facebook + Instagram)
- Groomer connects their Facebook + Instagram and sets what Suds may post.
- Each day Suds grabs: a marketing code (groomer-made) + a real photo (from bucket)
  + an on-template caption → creates one FB post + one IG post.

---

## Notes / open questions for build time
- Referral codes: each client portal gets a distinct code; booking stores referrer
  name so it surfaces in the groomer's appointment popup.
- Discount amount: groomer-configurable (example used: $5 / $10 off).
- Marketing suite is gated to PetPro subscribers (perk / upsell).
- Pricing: earlier handoff mentioned a SEPARATE marketing token pool (not bundled
  with Suds tokens) — revisit when we get to posting.

---

*Build order is intentional: 1 → 2 → 3 → 4 → 5 (foundation), THEN 6 → 7 → 8
(marketing). Don't build templates/posting until the foundation exists.*
