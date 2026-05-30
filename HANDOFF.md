# 🦦 PetPro — Session Handoff

*Written May 28, 2026 to hand off context from Claude 4.7 → 4.8.*
*Updated May 30, 2026 with payment fixes + portal-payment toggle (see next section).*
*Read this before doing anything else. Then read the linked spec docs.*

---

## ⚡ Latest session — May 30, 2026 (READ FIRST — newest work)

Worked entirely on **client/groomer payments**. Three things, all **edited in code but
NOT yet deployed** unless Nicole has since run the steps below.

### Bugs fixed
1. **TDZ crash on client portal Pay** — `stripe-charge-card/index.ts` referenced
   `groomer.id` before the `groomer` variable existed (error: *"Cannot access 'groomer'
   before initialization"*). Now uses `appointment.groomer_id`.
2. **OVERCHARGE bug (important)** — the charge functions computed totals from the
   catalog `services.price` and ignored the groomer's per-booking `quoted_price`
   override. A $1 Nail Trim (catalog $10) charged the client **$10**. Fixed in BOTH
   `stripe-charge-card` and `stripe-groomer-charge`: now prefer per-pet
   `quoted_price` → fallback catalog price; legacy appts use `final_price`/`quoted_price`
   first. Also aligned "paid so far" math to subtract refunds.
   - `stripe-charge-boarding` was checked and is fine (reads `total_price` off the row).

### Feature added — "Let clients pay through the portal" toggle
- New per-shop toggle in **Shop Settings → Payment Policies**, **default ON**.
- When OFF: grooming + boarding Pay buttons are hidden in the client portal AND the
  backend charge functions refuse (defense in depth).
- Files: `ShopSettings.jsx` (state/load/save/UI), `ClientPortalDashboard.jsx` (gates
  both Pay buttons on `shopSettings.allow_portal_payments === false`),
  `stripe-charge-card` + `stripe-charge-boarding` (backend guard).
- New DB column needed: `allow_portal_payments boolean default true` on `shop_settings`.

### Stripe Connect banner clarity (fixed in code)
- `stripe-connect-refresh` used to mark ANY `disabled_reason` as "restricted," so a
  groomer whose info was merely **pending Stripe review** saw a scary red "Action
  required" banner with nothing to do. Now: "restricted" only when Stripe lists
  `currently_due`/`past_due` items; otherwise "in_review" (calm amber banner, no action).
  Function now also returns `disabled_reason` + `currently_due` so the UI shows the
  real reason. ShopSettings.jsx got a new in_review banner and lists the actual items.

### ⚠️ Open / next steps for Nicole (NOT done yet)
- [ ] Refund the bad **$10 test charge** (use the in-app Refund button so DB + Stripe stay in sync).
- [ ] Run SQL (file: `Portal Payments Toggle Schema.sql`): `alter table shop_settings add column if not exists allow_portal_payments boolean not null default true;` ✅ DONE May 30
- [ ] Deploy edge functions: `stripe-charge-card`, `stripe-charge-boarding`, `stripe-groomer-charge`, `stripe-connect-refresh`.
- [ ] Push frontend (Vercel) for `ShopSettings.jsx` + `ClientPortalDashboard.jsx`.
- [ ] Re-test: $1 appointment should charge **$1.00**; toggle OFF hides Pay button; Stripe banner shows "reviewing" not red.

*(Note: there's a redundant `CHAT_HANDOFF.md` from earlier today — safe to delete; this section supersedes it.)*

---

## Who you're working with

**Nicole Treadwell** — Owner, builder, **and a real professional dog groomer**.
- Email: treadwell4674@gmail.com
- Located in **Cypress, TX (77429)** — NOT Katy. Models keep getting this wrong.
- Shop: **Pampered Little Paws** (13623 Barons Lake Ln, Cypress TX 77429, 281-210-8496)
- Background: professional groomer with deep industry knowledge, **NO prior web dev experience**.

### Her work style — IMPORTANT
- **Always ask for file names before editing.**
- **Go step by step, one at a time.**
- **Never assume.** Ask questions rather than guessing.
- **Guide in correct build order to prevent rework.**
- She wants **detailed step-by-step guidance**, but she's smart and ships fast.
- She does NOT want long-winded preamble. Be direct, warm, and specific.
- She's pragmatic — when something works, she pushes and moves on. Doesn't over-perfect.
- She types casually ("lol", typos) — match her energy but don't lose precision.

### Strict scope
**Only PetPro web app or Mortal Ties (her game)** — no other apps. Small talk fine. Don't build code for anything else.

---

## The product

**PetPro** is an AI-powered pet grooming + boarding SaaS. Solo groomers and small shops.

**Stack:**
- React + Vite frontend
- Supabase (Postgres + Edge Functions + Storage + Auth)
- Anthropic Claude API (now **Haiku 4.5** — switched today to save 75% on costs)
- Stripe Connect for payments + Stripe Terminal for tap-to-pay
- Twilio for SMS, Resend for email
- Vercel for hosting
- PWA capable, installable on phone

**Live URL:** trypetpro.com
**Suds = the AI mascot** (otter). User-facing AI is always called "Suds" not "Claude/Anthropic/AI/etc."

---

## CRITICAL — Architecture quirks (don't fall in the traps I did)

### 1. Two different AI edge functions exist
- **`supabase/functions/chat-command/index.ts`** — THIS is what the in-app chat widget uses (Suds bottom-right). Big file, 6000+ lines. Has ~57 real tools (search clients, book appointment, etc.)
- **`supabase/functions/petpro-ai-chat/index.ts`** — Used by the standalone `/petpro-ai` page only.

**They are separate. Edit BOTH if you're changing Suds' behavior, or you'll fix one and not see the change.**

### 2. shop_settings uses `groomer_id` NOT `user_id`
The chat-command file had legacy code using `.eq('user_id', body.groomer_id)` which silently returned NOTHING — meaning Suds was missing address + business_hours for every groomer. Fixed today. Watch for similar bugs in other functions.

### 3. The `chat-command` function was originally deployed via Supabase Dashboard inline editor
Filename was `chat-command-v2-services.ts` (not `index.ts`). Renamed to `index.ts` today so it can be deployed via `supabase functions deploy chat-command`. Nicole copies/pastes into the Dashboard sometimes — confirm with her how she wants to deploy.

### 4. Anthropic web_search requires a beta header
Add this header to fetch calls: `'anthropic-beta': 'web-search-2025-03-05'`
The tool type is `web_search_20250305`. Already wired in chat-command + petpro-ai-chat.

### 5. The model is now `claude-haiku-4-5-20251001`
Switched today from `claude-sonnet-4-6`. Nicole confirmed Suds sounds the same. ~75% cost savings.

### 6. Prompt caching is active
Big system prompt is cached with `cache_control: { type: 'ephemeral' }`. To bust cache after a system prompt change, bump the marker comment (e.g. `[Prompt v2026-05-28.haiku+websearch]`). 5-min TTL.

---

## What's shipped (recent — last 3 weeks of work)

### Major feature areas
1. ✅ **Full Retail POS** (6+ phases): products catalog, barcode scan, inventory, tips, split pay, custom items, discount reasons, refunds, cash drawer, parked sales, Stripe Terminal (tap-to-pay), sales reports, low-stock email alerts, receipt customization
2. ✅ **POS unification** — "Checkout via POS" button on grooming appointments AND boarding kennel cards. Loads services + attached retail into cart, writes back to mark appointment paid.
3. ✅ **Per-pet split payment** — multi-pet appointments can split bill across multiple payers (mom for Bella, daughter for Max). Works for grooming + boarding.
4. ✅ **Retail attached to appointments** — persistent (Phase 4 v2), visible on appointment popup, rolls into Take Payment bill.
5. ✅ **Mobile pickup flow** — drop-off/pickup state machine, GPS deep-links, SMS at each step.
6. ✅ **Suds AI (chat)** — bottom-right widget. Just switched to Haiku 4.5. web_search tool added.
7. ✅ **Suds AI (PetPro AI page)** — full chat page at `/petpro-ai` with lifted guardrails.
8. ✅ **Subscriptions** — client subscription plans (groomer + client flows).
9. ✅ **Stripe Connect** — fully live, processing real money.
10. ✅ **Onboarding wizard** (10 steps).
11. ✅ **SMS infrastructure** — quota tracking, founders unlimited tier, customizable templates, inbox, reminders cron, inbound Y/N handler.
12. ✅ **Meet Suds page** (`/meet-suds`) — public profile.
13. ✅ **Dashboard improvements** — live clock, multi-pet display fix, revenue accuracy fixes.

### Today's wins (May 28)
- Per-pet split payment (grooming + boarding)
- Dashboard multi-pet bug fix (was showing 1 pet only)
- Color-coded Suds-written grooming notes (`GroomingNotesText` component)
- "Send Test Reminder" button in Shop Settings
- Cancelled-appointment revenue bug (checked_out_at lingered)
- Meet Suds public page
- Roadmap updated with shipped Retail POS items
- POS unification "Checkout via POS" button
- Otter Marketing Suite spec drafted ([Otter Marketing Suite — Build Spec.md](Otter Marketing Suite — Build Spec.md))
- Switched Suds to Haiku 4.5 (75% cost savings)
- web_search tool wired up
- Fixed shop_settings `groomer_id` bug (silently missing data for every groomer)

---

## What's pending / next

### Immediate next builds (Nicole's stated priority order)
1. **Referrals (#86)** — groomer-to-groomer referral program (20% off 3 months for referrer). She wanted to do this "tomorrow" (today). Started thinking about it but hasn't built yet.
2. **Otter Marketing Suite Phase A** — weekend build. See [Otter Marketing Suite — Build Spec.md](Otter Marketing Suite — Build Spec.md) for full plan. Key first features: social post generator, lapsed client win-back, review request automation, before/after card.
3. **Marketing Tokens** — NEW separate token pool (not bundled with Suds tokens). Nicole's decision today. See spec doc for the model.

### Backlog (pending tasks)
- **#11**: Abandoned-cart auto-email for orphan signups
- **#22**: PWA zoom polish — less zoomed on phones
- **#28**: Community via Circle.so (post-launch)
- **#80**: Bug: Suds broke (need to investigate — currently deferred while she figures out Suds' overall direction)
- **#84**: Debug Suds nudge — false "0 clients tomorrow" alert (also deferred)
- **#86**: Referral program (next up)
- **#87**: Facebook review perk — 1 month free for 5-star review
- **#88**: Client SMS consent portal — self-service opt-in
- **#90**: Bulk client import with SMS consent
- **#96**: Fix Pricing.jsx to use shop_settings instead of orphan groomer_settings table
- **#138**: Create `product-photos` Storage bucket in Supabase (manual, Nicole has to do this)
- **#160**: Otter Marketing Suite multi-phase build

### Reminders
- **#123**: Verify subscription plan price IDs match Stripe (low-risk audit)
- **#124**: Verify $200 test charge converted June 6
- **#125**: Cancel test subscription before July 6 (no 2nd charge)

---

## Otter Marketing Suite — the big upcoming build

See full spec at: [Otter Marketing Suite — Build Spec.md](Otter Marketing Suite — Build Spec.md)

**Key business insight**: Every grooming SaaS does RETENTION marketing (reminders, win-backs). NOBODY does ACQUISITION marketing for grooming shops. PetPro can own this lane because Suds has data competitors don't (breed, pets, appointment history, etc.).

**Top 5 acquisition features** (researched competitively):
1. 🌟 GBP Auto-Post Engine (Google Business Profile, local SEO)
2. 📸 "Just-Groomed" Social Card (auto IG/FB post post-appointment)
3. 🔗 Performance-priced referral engine (Booksy-style but own-channel)
4. ⚡ Smart spot-fill (breed-aware cancellation auto-fill)
5. 🏘️ Nextdoor / local-group post generator

**Pricing model decision**: Separate marketing token pool (not bundled with Suds tokens). Each plan includes base allowance, monthly refill, top-up packs for heavy users. Tiers: $70 base / $199 / $399 top.

---

## Suds context — model + prompt notes

- **Current model**: `claude-haiku-4-5-20251001`
- **Identity**: Always "Suds the otter" / "PetPro AI". NEVER say Claude/Anthropic/Sonnet/etc.
- **Tools** (in chat-command): ~57 real action tools (search clients, book, charge, etc.) + `web_search` server tool
- **Tools** (in petpro-ai-chat): `add_grooming_note` + `web_search` only
- **Personality**: Friendly otter, work bestie, matches groomer energy. Can vent with them. Doesn't moralize.
- **Hard guardrails**: Never writes/modifies code. Never claims to be a vet. Never touches card numbers. Everything else open.
- **Shop context**: Every message includes today/tomorrow/yesterday's appointments + recent clients + shop name + ADDRESS + business hours (fixed today — was broken). Pet IDs in `(id:abc123)` format for tools.

### Suds personality tells (don't break these)
- He'll spill technical details if pushed into "admin mode" — Nicole has a debug mode that does this. But he MAY hallucinate tools he doesn't have. Trust the code, not his self-report.
- He's wrong about geography sometimes — fixed today by passing shop address explicitly.
- He's currently saying he can search the web (after this morning's fix).

---

## Token economics (just figured out today)

- **Suds tokens**: 1 token = 1 AI action. Plans include 500-unlimited.
  - Top-up: 250 for $24.99, 500 for $44.99, 1000 for $84.99
  - Real cost per chat msg on Haiku: ~$0.007
  - **Margin: ~92%**

- **Marketing tokens** (planned, NOT BUILT YET): Separate pool. Weighted by action.
  - 1 token: social post, review reply, SMS win-back
  - 3 tokens: welcome sequence
  - 5 tokens: before/after image
  - 10 tokens (Sonnet): full SEO blog
  - Top-up pricing slightly cheaper than Suds tokens (to drive usage = stickiness)

---

## Key file locations cheat sheet

### Frontend
- `src/pages/Calendar.jsx` — huge file, grooming appointments + Take Payment popup
- `src/pages/BoardingCalendar.jsx` — boarding reservations + kennel cards
- `src/pages/Dashboard.jsx` — main groomer landing
- `src/pages/POS.jsx` — standalone Sell page
- `src/pages/Products.jsx` — product catalog
- `src/pages/Refunds.jsx` — refunds page
- `src/pages/RetailReports.jsx` — sales reports
- `src/pages/MeetSuds.jsx` — public Suds profile
- `src/pages/ShopSettings.jsx` — shop config (writes to `shop_settings` using `groomer_id`)
- `src/components/AIChatWidget.jsx` — Suds chat bubble (calls `chat-command`)
- `src/components/AddRetailModal.jsx` — drop-in product picker for appointments
- `src/components/TerminalCheckout.jsx` — Stripe Terminal flow
- `src/components/GroomingNotesText.jsx` — color-codes Suds notes
- `src/lib/attachedRetail.js` — helper for parked retail sales on appointments
- `src/lib/smsTemplates.js` — SMS template render

### Backend (Supabase Edge Functions)
- `supabase/functions/chat-command/index.ts` — **Suds chat widget brain (THE BIG ONE)**
- `supabase/functions/petpro-ai-chat/index.ts` — /petpro-ai page
- `supabase/functions/petpro-smart-book/index.ts` — AI booking validation
- `supabase/functions/send-sms/index.ts` — SMS sending with quota
- `supabase/functions/email-receipt/index.ts` — appointment receipts
- `supabase/functions/email-sale-receipt/index.ts` — POS sale receipts
- `supabase/functions/check-low-stock/index.ts` — daily cron for low-stock alerts
- `supabase/functions/stripe-terminal-token/index.ts` — Stripe Terminal connection token
- `supabase/functions/stripe-terminal-create-pi/index.ts` — Stripe Terminal PaymentIntent
- ...plus many more Stripe + cron functions

### SQL migrations (run order)
She runs SQL via Supabase Dashboard SQL Editor. Recent migrations:
- `Retail POS Schema v1.sql` (products, sales, sale_items, inventory_movements)
- `Retail POS Schema v2.sql` (tips, splits, refunds, cash drawer, custom items)
- `Retail POS Schema v3.sql` (boarding_reservation_id on sales)
- `Retail POS Schema v4.sql` (low_stock_alerts_enabled toggle)
- `Split Payment Per Pet Schema.sql` (pet_id + payer_name on payments)
- `Mobile Pickup Schema v1.sql` + `v1a.sql`

### Docs
- `Otter Marketing Suite — Build Spec.md` — the big marketing plan
- `HANDOFF.md` — this file
- (Plus various smaller notes scattered)

---

## Recent "gotcha" patterns to avoid

1. **`l.product.id` crashes on custom line items** — POS cart can hold service items with `custom: true` and no product. Always guard: `if (l.custom || !l.product) return`
2. **`checked_out_at` lingers after cancellation** — for "is this real revenue?" checks, filter cancelled/no_show/rescheduled FIRST, then check checked_out_at
3. **The widget calls `chat-command`, not `petpro-ai-chat`** — easy to edit the wrong function
4. **shop_settings is `groomer_id` keyed** — not `user_id`
5. **`navigate` is taken in Calendar.jsx** — it's the date navigation function. Use `routerNavigate` for react-router navigate
6. **Prompt cache 5-min TTL** — bump the `[Prompt vX]` marker in system prompt to force reload

---

## How Nicole pushes / deploys

- **Frontend**: Vercel auto-deploys on git push to main branch
- **Edge functions**: Either `supabase functions deploy <name>` OR copy-paste into Supabase Dashboard inline editor (legacy approach)
- **SQL**: Supabase Dashboard → SQL Editor → paste → Run
- **She commits regularly**, usually after every working feature. Asks for commit messages.

### Standard commit message format (her preference)
```
Short title

- Bullet of change
- Another bullet
- Another bullet
```

---

## Misc context

- **Husband Viktor** is building her marketing website (separate from PetPro app)
- She got her **first paying customer** May 2026
- Subscribed to her own pro_plus plan for $200 to test (charge June 6)
- Has Stripe Connect set up + paid first $1 test charge
- Has Google Ads running for the next year for customer acquisition

---

## Open philosophical things she's been thinking about

- **Cost reduction**: Considered switching to Grok API but realized Haiku is cheaper + better for her stack. Switched to Haiku today.
- **Acquisition vs retention** marketing — she now sees acquisition is the moat. Wants Suds to actively grow shops, not just retain.
- **The "I would've loved this when I started" line** is her real marketing copy. It's authentic.
- She's NOT in a rush to onboard tons of users — she'd rather get the product right at low scale before scaling.

---

## When you start, ask her

1. What she wants to work on right now (referrals? Otter Phase A? bug?)
2. Whether she's pushed the latest changes (check git status if needed)
3. If she needs help testing anything that's been recently deployed

---

🦦 **Good luck. She's a great person to build with — direct, decisive, appreciates clear thinking, and has shipped more in 3 weeks than most teams do in a quarter.** Match her energy and respect her time.

— Outgoing Claude (4.7), May 28 2026
