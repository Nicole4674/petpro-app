# Prelaunch To Do

**Created:** April 22, 2026
**Last updated:** April 24, 2026
**Purpose:** The ONLY 6 things that must happen to flip PetPro from sandbox to live. Everything else (tier gating, client contacts, AI usage caps, rename, staff logins, FlaggedBookings polish) is **post-launch improvement** — the app works without them.

---

## 🎉 STATUS AT A GLANCE — ALL 6 BLOCKERS COMPLETE ✅

| # | Item | Who | Status |
|---|------|-----|--------|
| 1 | Stripe LIVE activation | Nicole | [x] **APPROVED** — `pk_live_51T0tFaQ...` confirmed in dashboard |
| 2 | Terms of Service + Privacy Policy pages live on site | Nicole + Claude | [x] **DONE** — live at `/terms` and `/privacy` |
| 3 | DNS: `app.trypetpro.com` pointed at Vercel | Nicole or Viktor | [x] **DONE** (Nicole) |
| 4 | Swap sandbox Price IDs → live Price IDs in webhook | Claude | [x] **DONE** — live IDs in `Stripe Webhook Code v1.ts` |
| 5 | Swap sandbox Payment Links → live Payment Links | Claude | [x] **DONE** (Nicole confirmed Apr 24) |
| 6 | Add live-mode Stripe webhook endpoint + secret | Claude | [x] **DONE** (Nicole confirmed Apr 24) |

## 🚀 LAUNCH IS UNBLOCKED

Nothing is stopping launch. You can accept real customers today.

---

## Final polish (optional, not blockers)

- [ ] Tip handling (~30 min) — staff tip tracking on payments, staff portal visibility
- [ ] Test Incident Reports end-to-end as you groom (do 1-2 fake incidents per dog)
- [ ] Help/User Guide — Google Doc is fine for v1

Everything else in `PetPro_App_Todo.md` is **post-launch** — build when you have time after real customers start flowing.

---

## NICOLE'S PAPERWORK (start in parallel, no waiting for code)

### 1. Stripe LIVE Activation

**Where:** Stripe dashboard → top-left toggle shows "Sandbox" → click → "Activate account."

**What Stripe will ask for:**
- Business legal name: Pamperedlittlepaws LLC
- EIN (business tax ID)
- SSN (personal verification)
- Bank account (where payouts go — routing + account number)
- Driver's license (photo upload)
- Business address + phone
- Website URL (needs to be live when they review — that's why #2 and #3 matter)

**Timeline:** 30-60 minutes to submit, then **1-3 business days** for Stripe to approve. Do this early.

**Once approved, Stripe gives you:**
- New live `sk_live_...` secret key
- 4 new live Price IDs (one per tier)
- 4 new live Payment Links

Send those to Claude when you get them. That unlocks items #4, #5, #6.

---

### 2. Terms of Service + Privacy Policy

**Why needed:** Stripe requires both to be publicly viewable on your site before they approve live mode.

**Plan:**
- Claude generates starter boilerplate for both (standard SaaS language, covers the basics)
- Nicole reviews + edits to match her actual business
- Added as two new pages: `/terms` and `/privacy`
- Link both in the footer of Plans.jsx and Signup.jsx

**When to tackle:** Any session Nicole wants. Short session, ~45 min.

---

### 3. DNS — Point `app.trypetpro.com` to Vercel

**Translation in plain English:** Telling the internet "when someone types `app.trypetpro.com`, send them to my PetPro app."

**Setup pattern:**
- `trypetpro.com` → Viktor's marketing/sales site
- `app.trypetpro.com` → Nicole's PetPro app on Vercel

**Who does it:**
- If Nicole owns `trypetpro.com` → Nicole does 3 clicks in her domain registrar (GoDaddy / Namecheap / wherever). Claude walks her through it.
- If Viktor owns it → Viktor does the 3 clicks. Nicole just texts him "add `app.trypetpro.com` pointing to my Vercel" when ready.

**Time:** 10-15 minutes. Happens same day as launch.

**UNKNOWN TO CONFIRM:** Does Nicole or Viktor own `trypetpro.com`?

---

## CLAUDE'S CODE CHANGES (launch day, ~30 min total)

### 4. Swap Sandbox Price IDs → Live Price IDs in Webhook

**File:** `Stripe Webhook Code v1.ts` (Supabase Edge Function: `stripe-webhook`)

**Current (SANDBOX):**
```typescript
const PRICE_TO_TIER: Record<string, string> = {
  'price_1TOtWmLx8nm3a7PZNUYZuMbt': 'basic',     // $70
  'price_1TOtqULx8nm3a7PZMlqDZaHa': 'pro',       // $129
  'price_1TOtupLx8nm3a7PZYktElWcP': 'pro_plus',  // $199
  'price_1TOtzFLx8nm3a7PZI6CsmUIO': 'growing',   // $399
}
```

**Action:** Replace 4 sandbox IDs with the 4 live IDs from Stripe. Redeploy Edge Function.

---

### 5. Swap Sandbox Payment Links → Live Payment Links

**Files:**
- `src/pages/Plans.jsx` (`PAYMENT_LINKS` constant)
- `src/pages/Signup.jsx` (`PAYMENT_LINKS` constant — same map)

**Current (SANDBOX):**
```javascript
const PAYMENT_LINKS = {
  basic:    'https://buy.stripe.com/test_4gMdRa98G7AzgMQ5U59MY00',
  pro:      'https://buy.stripe.com/test_28E7sMgB8f31cwA4Q19MY01',
  pro_plus: 'https://buy.stripe.com/test_7sY6oI1GedYX548gyJ9MY02',
  growing:  'https://buy.stripe.com/test_bJe9AUet0bQP68ceqB9MY03',
}
```

**Action:** Replace with 4 live-mode Payment Links (URLs won't have `test_` in them). Then `git push` — Vercel auto-deploys.

---

### 6. Add Live-Mode Webhook Endpoint + Secret

**Where:** Stripe dashboard (live mode, not sandbox) → Developers → Webhooks → Add endpoint.

**Endpoint URL:** `https://egupqwfawgymeqdmngsm.supabase.co/functions/v1/stripe-webhook` (same URL as sandbox)

**Events to select (same 5 as sandbox):**
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

**After Stripe creates it:** Copy the new live `whsec_...` signing secret. Add to Supabase Edge Function secrets as `STRIPE_WEBHOOK_SECRET_LIVE` (or overwrite `STRIPE_WEBHOOK_SECRET` — we'll decide that day based on whether we keep sandbox running in parallel).

Also update `STRIPE_SECRET_KEY` in Supabase secrets to the new `sk_live_...` key.

---

## REFERENCE — WHAT'S ALREADY DONE (don't redo)

- [x] Stripe sandbox account set up, 4 products + 1 Contact Sales tier created (Task #89)
- [x] `subscription_tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `current_period_end` columns added to `groomers` table (Task #90)
- [x] Stripe webhook deployed to Supabase Edge Functions, signature verification working, tested end-to-end subscribe AND cancel flows (Task #91)
- [x] Plans.jsx built with 5 tier cards + comparison table (Task #96)
- [x] Plans.jsx + Signup.jsx wired to route users to Stripe checkout with `client_reference_id` attached (Task #100)

**Proven working:** subscribe flow, cancel flow, webhook writes tier to groomers row, UUID matching.

---

## RESUME INSTRUCTIONS (for Claude next session)

If Nicole says "back to prelaunch" — read this file first.

**Current state (April 22, 2026):**
- All sandbox Stripe work is DONE and verified end-to-end.
- Nothing is blocking launch on the Stripe side EXCEPT Nicole submitting LIVE mode paperwork.
- Recommended next step when Nicole resumes launch work: start item #2 (Terms + Privacy) because it can be done anytime and is a prereq for #1 approval.

**Don't touch during launch prep:**
- Tier gating (#92, #93, #94)
- Client contacts (#97, #98)
- AI usage caps (#95)
- "Claude" → "PetPro AI" rename
- Staff logins (#58) / Staff profiles (#99)
- FlaggedBookings polish (#55)

Those are all POST-launch improvements. Do them when Nicole is back in app-building mode, not in launch-prep mode.

---

## LOG

- **April 22, 2026:** File created. All sandbox Stripe flow complete. Nothing started on live-mode paperwork yet.
