# 🐾 PetPro Build Backlog

> Parking lot for everything we're NOT building right now, organized by phase.
> When a phase becomes active, we pull items out of here and work them end-to-end.
>
> Last updated: April 16, 2026

---

## 🔨 Build Now (Active)

**Current path:** Payroll skeleton → finish remaining chunks so you can run payroll daily at the shop.

- [x] **Chunk 3A.6 — Paycheck Detail page** ✅ BUILT (April 17, 2026) — PaycheckDetail.jsx, /payroll/paycheck/:id route, PayPeriods drill-down, matching .pd-* styles. **⚠️ PENDING VISUAL VERIFICATION — can't test until staff exist in the system (blocked by the "anything staffing I can't test until last" rule).**
- [ ] **Chunk 3B — Deductions** (pre-tax / post-tax deductions on paychecks)
- [ ] **Chunk 3C — PDF pay stubs** (downloadable stub per paycheck)
- [ ] **Chunk 3D — Year-End Forms** (W-2 / 1099 generation)
- [ ] **Chunk 3E — QuickBooks export** (CSV for accountant)
- [ ] **Chunk 3F — YTD Dashboard polish**

---

## 🧪 Staffing Testing Phase

> Pick this up when we're ready to do real staff login testing.
> When we start, run these in order.

### Bug: Sidebar doesn't restrict when logged in as staff
- **Symptom:** Logged in as Sophia (pamperedlittlepaws@gmail.com, role=groomer), sidebar still shows full owner view (Payroll, Staff List, Tax Settings, Reports, Year-End Forms, etc.)
- **What's already been done:**
  - Staff Login Link v2.sql ran successfully — Sophia's auth_user_id is linked to her staff_members row
  - Staff RLS Self Read v1.sql ran successfully — policy `staff_can_read_own_row` exists on staff_members
  - Confirmed via SQL: Sophia's row has `role = 'groomer'`, `auth_user_id = d5fa9cd9-666d-4c12-abc9-88f3f2023ae4` ✓
- **Why it's still broken:** Unknown. `canAccess()` in usePermissions.js should return false for groomer on staff.view_payroll etc., but sidebar shows all items. Possible causes: stale React state, browser auth session cache, or usePermissions hook is falling through to owner fallback for some reason.
- **Next step to diagnose:** Add 4 temporary console.log lines to `src/hooks/usePermissions.js` to log (a) user.id, (b) staffData result, (c) staffErr, (d) final role. Then Sophia logs in with DevTools console open and we see exactly what's happening.

### Cleanup: Orphan staff_members row
- Orphan Sophia row still exists: `id = c7dcc406-a039-4905-a65e-f7b5ee1ba285`, NULL auth_user_id
- Fix: Rerun `Staff Cleanup v1.sql` (already in /PetPro/ folder). It's scoped safely to Sophia's email + NULL auth_user_id only.

### Feature: Staff visual indicator
- Problem: Nicole couldn't tell at a glance whether she was signed in as staff vs. owner. Sidebar looked the same.
- Idea: Add a badge or role chip at the top of the sidebar (e.g., "👤 Sophia A. — Groomer") so staff know which account they're in.
- Could also change sidebar accent color by role (owner = purple, groomer = teal, kennel_tech = amber, etc.)

### Deferred feature: Invite Staff Flow
- Proper "Add Staff" button on Staff page → sends invite email → new user creates password → auto-creates staff_members row linked to auth
- Would replace the manual SQL linking we did for Sophia
- Depends on: Supabase email templates configured

---

## ✨ Dashboard Polish Phase

> Pick this up after staffing testing works. These are the "feels premium" touches
> that Nicole says will make employees actually like the system.

### Role-specific dashboard content
- Groomers see grooming widgets only (no boarding)
- Kennel techs / bathers see boarding widgets only (no grooming)
- Front desk sees booking overview
- Owners see everything

### Manager override toggle
- Some staff do multiple jobs (groom + bathe, or groom + occasional boarding help)
- Manager or Owner should be able to toggle on cross-role content per staff member
- Default OFF — only the role's primary content shows

### Personal greeting
- Top of dashboard: "Hello, [First Name]"
- Small touch, big feel — competitors don't do this
- Pull from staff_members.first_name (or groomers.first_name for owner)

---

## 📱 SMS to Clients Phase

> **IMPORTANT — Updated priority order (April 17, 2026):**
> SMS to clients is NOT an early launch task. Nicole clarified: clients and SMS
> only come AFTER the full core site is built AND she has tested it herself
> for a few weeks AND her husband has done a cold re-import test.
>
> Core business tool (grooming, boarding, staff, payroll, AI brain) has to be
> rock solid first. Clients/SMS is an ATTACHMENT to a working core, not a launch feature.

- [ ] Set up Twilio account (free trial first, paid when clients start using)
- [ ] Add Twilio API keys to Supabase secrets / Vercel env vars
- [ ] Build SMS sending helper in `src/lib/twilio.js`
- [ ] Appointment confirmation text when a booking is created
- [ ] Appointment reminder text (24 hours before)
- [ ] Rebook prompt text (4-6 weeks after last grooming, based on breed)
- [ ] Client opt-in / opt-out field on Clients page
- [ ] SMS log table so Nicole can see what was sent

---

## 📞 Phone + Payments Phase (Coming Soon on marketing site)

> Nicole's plan: ship these AFTER initial launch. Keep them on the marketing site as "Coming Soon" so it sets expectations.

### Twilio Voice + AI phone answering
- AI answers incoming calls using Claude + Whisper
- Voice booking flow for clients
- Message-taking if Nicole is busy

### Stripe subscription billing
- Tiered monthly plans (Solo Groomer / Small Shop / Multi-location)
- Stripe subscription management page
- Trial period handling

---

## 🌐 Client Portal Phase

> Self-service portal for clients. Only starts after core business tool is rock solid.

- [ ] Client login (separate auth flow from groomers/staff)
- [ ] Self-booking calendar (uses Claude validation brain)
- [ ] View pet's grooming history
- [ ] Update their own pet info / allergies / photos
- [ ] View and pay invoices (once Stripe is live)

---

## 🎯 Marketing Site Phase (Very End)

- Landing page with feature highlights
- Pricing page (Stripe tied in)
- "Coming Soon" badges on Phone AI and Payments
- Demo video / screenshots
- Sign-up flow for new groomer accounts

---

## 📝 General Notes

- **Knowledge-cutoff reminder:** Always re-check exact Twilio / Stripe pricing when we start those phases — may have changed.
- **Test rollout plan (Nicole's):** Once payroll skeleton is done, launch to own shop first. Nicole = manager, husband = kennel tech, daughter = groomer. Test every feature daily. Fix bugs at night. Open to other shops once rock solid.
- **Never assume rule:** Always ask Nicole for file names before editing. Go step by step. One thing at a time.
