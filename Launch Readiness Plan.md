# Launch Readiness Plan

**Created:** April 22, 2026
**Goal:** Stage everything so launch day is a "flip 3 switches" event, not a scramble.

---

## The Big Idea

PetPro can sit in "build mode" for as long as Nicole wants. The app is technically live at app.trypetpro.com, but:
- The marketing site trypetpro.com isn't up yet (Viktor building)
- Google hasn't indexed the app
- Stripe is in SANDBOX — real cards cannot be charged
- Nobody has the URL

So keep building until everything feels right, THEN flip three switches on a chosen launch day.

---

## The Three Launch Switches

### Switch 1: Stripe Sandbox → Live
**What it means:** Real customers can be charged real money. No more test cards.

**What's needed from Nicole:**
- SSN (business owner identity verification)
- EIN (from Pamperedlittlepaws LLC)
- Bank account (routing + account number — this is where Stripe sends your money)
- Driver's license photo (or passport)

**The flip itself (day-of):**
1. Go to dashboard.stripe.com → click "Switch to live account" button (top right)
2. Fill in the 4 items above
3. Stripe reviews (usually instant, sometimes up to 24 hours)
4. Once approved, recreate the 4 products in LIVE mode (same names, prices, descriptions — we have them in `Stripe Setup Complete.md`)
5. Regenerate the 4 payment links in LIVE mode (new URLs, no `test_` prefix)
6. Swap the 4 URLs in Plans.jsx (one-line change per tier)
7. Test with a real card at $70 (Nicole subscribes to her own Basic tier to confirm it works), then refund herself via Stripe dashboard

**Time:** ~30 minutes if docs ready, up to 24 hours if Stripe review is slow.

---

### Switch 2: Marketing Site DNS (trypetpro.com)
**What it means:** The public world can find PetPro via trypetpro.com.

**What's needed:**
- Viktor's marketing site deployed to Vercel with a preview URL
- Access to the DNS provider where trypetpro.com is registered (Cloudflare, GoDaddy, Namecheap — wherever Nicole bought the domain)
- A CNAME or A record pointing trypetpro.com at Viktor's Vercel deployment

**The flip itself (day-of):**
1. Log into DNS provider
2. Add CNAME: `trypetpro.com` → `<viktor-vercel-url>.vercel.app`
3. Add CNAME: `www.trypetpro.com` → same
4. Wait 10-60 minutes for DNS propagation
5. Visit trypetpro.com → marketing site should appear
6. Click Subscribe buttons → confirm they go to LIVE Stripe payment links (not sandbox)

**Time:** 30-60 minutes including DNS propagation wait.

**Note:** app.trypetpro.com is already pointed correctly. This switch is ONLY for the root domain trypetpro.com.

---

### Switch 3: Signup Gate (optional)
**What it means:** Decide whether random people who find app.trypetpro.com can sign up, or if signup is invite-only.

**Three options:**

**Option A — Open signup (simplest):**
- Anyone at app.trypetpro.com → /signup → can create an account
- Free to create an account, but features are gated by Stripe subscription tier
- No code changes needed — this is the current state
- Risk: Low. Worst case someone creates a free account and poke around, sees nothing, leaves.

**Option B — Waitlist / Coming Soon gate:**
- app.trypetpro.com shows a "Coming Soon" landing page that collects email
- Emails go into a Supabase waitlist table
- Launch day: flip a feature flag to hide the gate and reveal the real signup
- Good if Nicole wants to build hype before launch or do a controlled beta
- Requires: build a `/coming-soon` page + a feature flag toggle

**Option C — Invite-only with access codes:**
- Signup requires a valid invite code
- Nicole generates codes and shares with hand-picked beta groomers
- Good for a controlled rollout where Nicole can personally support each early user
- Requires: add invite_codes table + signup flow change

**My recommendation:** **Option A (open signup)** unless Nicole specifically wants a beta or hype-building moment. Open signup lets organic traffic convert; gates add friction. Stripe sandbox already protects from financial risk.

---

## Pre-Launch Checklist (everything that should be DONE before flipping switches)

### Stripe Stack (currently in progress)
- [x] #89 Create 5 tier products + payment links (SANDBOX)
- [ ] #90 Add subscription_tier column to groomers table
- [ ] #91 Stripe webhook: update subscription_tier on subscribe/cancel
- [ ] Wire 4 sandbox payment links into Plans.jsx Subscribe buttons
- [ ] #92 Gate client portal behind Pro tier+ ($129+)
- [ ] #93 Gate AI features behind Pro+ tier ($199+)
- [ ] #94 Gate Growing-tier features behind $399+
- [ ] #95 AI usage tracking + cap enforcement
- [ ] End-to-end test: test card on each tier, confirm tier gets set in DB correctly
- [ ] End-to-end test: cancel a test subscription, confirm user is downgraded

### Pre-Launch Punch List (from Pre-Launch Punch List.md)
- [ ] #97 Client contacts table + multi-contact support
- [ ] #98 Emergency contact (via is_emergency flag on contacts)
- [ ] #99 Staff profile build-out (photo, specialties, certifications, bio)

### Still Outstanding
- [ ] #55 Phase 6 Step 4: Enhance FlaggedBookings page
- [ ] #58 Staff logins with role-based dashboards (can slip to post-launch if needed)

### Quality Pass (day before launch)
- [ ] Global "Claude" → "PetPro AI" rename sweep across the codebase
- [ ] Every page loads without errors
- [ ] Mobile test: groomer side (iPhone + Android)
- [ ] Mobile test: client portal (iPhone + Android)
- [ ] Test a full booking flow as a groomer
- [ ] Test a full booking flow as a client
- [ ] Test push notifications end-to-end
- [ ] Test SMS reminders (with Twilio live)
- [ ] Confirm all vaccine photo uploads work
- [ ] Confirm shop logo upload works
- [ ] Privacy policy page live (exists — confirm it loads)
- [ ] Terms of service page live (exists — confirm it loads)
- [ ] Contact page mailto works

### Accounts & Infrastructure
- [x] Supabase — live
- [x] Vercel — live (app.trypetpro.com)
- [x] Anthropic API — live, billing set up
- [x] Twilio — live
- [x] Stripe — SANDBOX done, LIVE pending
- [ ] Domain DNS control confirmed (who owns trypetpro.com DNS, how Nicole logs in)
- [ ] Viktor's marketing site deployed and preview URL shared

---

## Recommended Build Order (from here to launch)

### Phase 1: Finish Stripe (next session, maybe 2 sessions)
1. #90 Add subscription_tier column (5 min — ONE SQL command)
2. #91 Build Stripe webhook (~30-45 min)
3. Wire payment links into Plans.jsx (~15 min)
4. #92, #93, #94 Tier gates (~1-2 hours)
5. #95 AI usage tracking (~1-2 hours)
6. End-to-end test in sandbox (~30 min)

### Phase 2: Pre-Launch Punch List (2-3 sessions)
1. #97 Client contacts table + UI (~3-5 hours)
2. #98 Emergency contact flag (~30 min — comes free with #97)
3. #99 Staff profile build-out (~2-3 hours)

### Phase 3: Cleanup (1 session)
1. Global Claude → PetPro AI rename
2. #55 FlaggedBookings polish
3. #58 Staff logins (optional — can slip to post-launch)
4. Quality pass checklist

### Phase 4: Launch Day (4-8 hours)
1. Switch 1: Stripe live (30 min with docs ready)
2. Switch 2: DNS (30-60 min with propagation wait)
3. Switch 3: Signup gate decision (0-30 min depending on option)
4. Smoke test: have a friend sign up + subscribe with real card, confirm end-to-end works
5. Refund the smoke test
6. Announce. Marketing site live, app live, Stripe live.

---

## Rough Timeline

If Nicole does 2-3 hour sessions per day:
- Phase 1 (Stripe finish): 2-3 days
- Phase 2 (Punch list): 3-4 days
- Phase 3 (Cleanup): 1-2 days
- Phase 4 (Launch): 1 day

Total: ~7-10 days of focused build + 1 launch day.

Can be compressed with longer sessions or stretched over weeks. No pressure from anything external — Stripe sandbox waits patiently.

---

## What Makes Launch Day Safe

- Products, descriptions, prices, tier structure are ALREADY designed and tested in sandbox
- Webhook and gating logic ALREADY tested in sandbox (same code works in live)
- The only "new" thing on launch day is real money moving — and that's insured by Stripe
- If something breaks post-launch: pause Stripe live mode (takes 1 click), revert the 4 payment links to sandbox, investigate, fix, flip back. Zero data loss.

---

## Nicole's Decision Points

1. **When to launch?** — up to you. Right now the minimum is: finish Phase 1 + Phase 2 + a light Phase 3. That's ~7 days of work.
2. **Open signup or waitlist?** — decide before launch day, Option A default unless you want hype.
3. **Beta test or straight launch?** — consider inviting 3-5 groomer friends through a sandbox demo before going live, to catch issues.

---

## Files Cross-Referenced

- `Stripe Setup Complete.md` — tier structure, product descriptions, how trial works
- `Stripe Sandbox Links.md` — the 4 sandbox payment URLs (replace with LIVE on switch 1)
- `Pre-Launch Punch List.md` — detailed specs for #97, #98, #99
- `Build Progress Log.md` — session history
- `PetProCommand.md` — older reference doc, accounts/logins

---

## After Launch

Post-launch tasks (no rush):
- #58 Staff logins with role-based dashboards
- Customer support workflow (how Nicole handles inbound questions)
- Monitor Stripe dashboard for failed charges, set up email alerts
- Monitor Supabase for error logs
- First-week user feedback gathering
- Iterate based on what real customers say
