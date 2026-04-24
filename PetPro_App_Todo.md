# PetPro — App Polish To-Do

**Start date:** 4/23 after work
**Goal:** knock these out, grab the next list, polish, launch.

Work through one at a time. Check off as we finish each.

---

## Current List

- [x] **Calendar quick-jump shortcut** — MoeGo-style 1-14 weeks out grid under the mini calendar in the grooming sidebar. Jumps from today and switches to day view. ~~Boarding calendar~~ skipped (no sidebar to fit it in).
- [x] **Collapsible calendar sidebar** — `‹` / `›` toggle button at top-right of sidebar. Collapses to 28px strip for full-width calendar (great on phone). State saved in localStorage so it sticks.
- [x] **Shop location on client portal detail view** — address shown with 📍 pin in the purple branding banner at the top of the client portal dashboard. Includes a "Get Directions →" link that opens Google Maps (tap-friendly on phones).
- [x] **Edit contact info + emergency contact (both sides)** — groomer side can edit client's contact info, client side can edit their own info and emergency contact. Covers launch-checklist tasks #97 + #98.
  - [x] Part A — DB schema `client_contacts` table (live in Supabase)
  - [x] Part B — Groomer side "📞 Contacts" tab in ClientDetail.jsx (add/edit/delete, emergency + pickup-authorized flags, relationship suggestions)
  - [x] Part C — Client portal "Emergency & Pickup Contacts" card on Overview (clients add/edit/delete their own)
- [x] **Staffing system with roles** — Phase 1 done: (1) Kiosk clock-in at `/kiosk` with 4-digit PIN per staff; (2) Staff personal portal at `/staff/login` + `/staff/me` with read-only schedule + hours this week; (3) Auto-link trigger: staff signs up by email and auto-connects to their staff_members row; (4) RootRedirect routes staff users to `/staff/me`, clients to `/portal`, owners/groomers to Dashboard. Phase 2 (sidebar role-gating) is post-launch polish.
- [x] **Smart Client Signup Match (CRITICAL pre-launch)** — fixed `create_client_on_signup` DB trigger so existing unclaimed clients (groomer-entered, no user_id) get LINKED when they sign up for the portal, instead of creating a duplicate row. Matches by email + groomer_id. SQL: `Smart Client Signup Match v1.sql`.
- [x] **Edit Client button on ClientDetail.jsx** — inline edit on Contact Information card. Edit name (marriage changes), phone, email, address, preferred contact. Warns if client already has portal access that email-change won't change their login.
- [x] **Drag-to-reschedule appointments** — grab an appt block, drag it to a new slot. Works in day AND week view. Confirm modal shows old/new time + groomer (if day-view drop changes groomer). Conflict check blocks moves that would double-book. Cancelled / checked-out appts aren't draggable. Drop target cells highlight purple while dragging. Recurring appts default to "this one only" with a warning.
- [x] **Color palette choice (bright vs. neutral)** — staff color picker now shows two rows of preset swatches: 8 BRIGHT (purple, blue, cyan, green, amber, orange, red, pink) + 8 NEUTRAL (tan, taupe, cream, sage, dusty rose, stone, slate, charcoal). Custom color picker stays as fallback for anything unusual. Available on both AddStaff form (StaffList.jsx) and Edit Staff (StaffDetail.jsx).
- [x] **Revenue stats panel on calendar sidebar** — fully MoeGo-matched now. Total Pets (unique pet count) + Finished appts added to the sidebar revenue block. Pets are counted across multi-pet bookings via appointment_pets.
- [x] **Client portal: edit first + last name** — added First + Last name fields to Contact Information edit form on the client portal.
- [x] **Inactive / Active client status** — added `is_active` column to clients table (default true). `💤 Mark Inactive` / `♻️ Reactivate` button on ClientDetail header. Inactive clients hidden from Clients list by default; "Show inactive (N)" checkbox reveals them grayed out. INACTIVE badge shows on the client's name + in the list.
- [x] **Search pets OR clients when booking** — both Calendar and BoardingCalendar search by pet name too. Pet matches show as "🐾 [pet name] — [owner]" and auto-add the pet to the booking when selected.
- [x] **Delete messages / delete thread** — × button on each message bubble (hover on desktop / always on mobile). Groomer can delete any message; client can only delete their own. Plus a "🗑️ Delete chat" button in the thread header to wipe the whole conversation.
- [x] **Mass text (day-of cancellation)** — 📣 Mass Text button on Calendar header. Pick a date, modal shows every client with an appt that day (with their phone + appt times), uncheck any to skip, type one message, hit Send. Invokes `send-sms` edge function for each recipient. Shows sent/failed counts after. Clients without phone auto-excluded.

---

## Known Bugs to Fix Before Invites Go Out

- [x] **Client portal confirm-email redirect lands on groomer dashboard** — fixed. App.jsx `/` route was blindly sending any logged-in user to the groomer Dashboard. Added `RootRedirect` component that checks if the user has a `clients` row → routes to `/portal`. Groomers still go to Dashboard.

## Build BEFORE launch (Nicole's tomorrow list)

- [ ] **Incident Reports** — DB table `incidents` (pet_id, client_id, staff_id, type, severity, description, action_taken, client_notified, photos, follow_up_flag). New "🚨 Incidents" tab on PetDetail.jsx + ClientDetail.jsx. "+ Log Incident" button on appointment popup. Badge on pet profile "⚠️ X PAST INCIDENTS" so groomer sees aggression/medical history before handling. **Critical for animal businesses — liability + insurance + client communication record.** ~45 min.
- [ ] **Tip handling** — track staff tips on payment completion. Add `tip_amount` field to payments. Staff can see total tips on their Staff Portal (/staff/me). Owner sees tip summary on payroll reports. ~30 min.

## POST-LAUNCH features (ongoing build queue — mark "Coming Soon" in app)

All of these get **"Coming Soon" badges** in the sidebar so users see active development + reduce churn from unmet needs.

### Tier 1 — high impact, build first after launch

- [ ] **Payment Processing (Stripe Connect)** — each shop connects their own Stripe account. Enable online payment links via SMS + in-person tap-to-pay. PetPro takes a small % per transaction (revenue stream). Label as "Coming Soon — Pro+" on lower tiers to drive upgrades. ~3-4 hours.
- [ ] **Client signed waivers / e-signature** — store signed waivers per client (grooming, boarding, photo release, emergency authorization). Typed signature OK for v1. Legal protection for boarding + aggressive pets. ~30-45 min.
- [ ] **Before/after grooming photos** — attach 2 photos per appointment. Show on appointment popup + pet profile + client portal. Social media marketing gold. ~30 min.
- [ ] **"Coming Soon" sidebar badges + `/roadmap` page** — add SOON pills to all below items in the groomer sidebar. Build a dedicated `/roadmap` page listing Shipping Soon / In Development / Planned features. Add voting so clients can upvote what they want next (retention gold). ~45 min.

### Tier 2 — retention + revenue

- [ ] **Loyalty / Rewards Program** — visits-based rewards (e.g., 10 grooms = 1 free). Automatic tracking. Notify client when earned. Redeem at checkout.
- [ ] **Gift Cards** — sell/redeem prepaid gift cards. Digital codes texted to recipient. Integrated with Stripe if payments live.
- [ ] **Referral Program** — unique referral links per client. "Your referral gets 20% off, you get $10 credit." Auto-apply on signup.
- [ ] **Online Reviews / Testimonials** — prompt happy clients to leave reviews. Display rotating testimonial widget on Plans.jsx.
- [ ] **Vaccine expiry auto-alerts** — text client 30 days before vax expires. Lives alongside existing vaccine tab. Skip unless clients ask for it.

### Tier 3 — analytics + scale

- [ ] **Advanced Analytics / Reports** — dashboards for revenue trends, service popularity, client retention, staff productivity, pet breed distribution, etc. Export to CSV/PDF.
- [ ] **Multi-Location Dashboard** — for shops with 2+ locations. Aggregate view across shops + per-location drill-down. Premium tier feature.
- [ ] **Mobile Apps (iOS/Android native)** — PWA works fine today; native apps for richer push notifications, biometric login, App Store presence.
- [ ] **Role-based sidebar gating for staff** — hide owner-only menus (Payroll, Shop Settings, Plans) from limited staff roles. RLS already blocks data access; this just cleans the UI.
- [ ] **Phase 6 Step 4: Enhance FlaggedBookings page** — better filters, bulk approve/reject, trend view of which rules fire most.

### Tier 4 — polish + founder deal sunset

- [ ] **Founder deal sunset** (after 100 signups) — remove banner, flip `founder: true` flags in TIERS[0] and TIERS[1], flip comparison table `✓*` back to `—` on AI rows, remove yellow footnote.
- [ ] **Tier gating #92-94** — gate client portal behind Pro+ ($129+), AI features behind Pro+ ($199+), Growing features behind $399+. Only activate AFTER founder window closes.

## User-Facing Documentation

- [ ] **PetPro User Manual / Help Guide** — simple visual guide Nicole can link from the app or share with new signups. Options:
  - **Easiest:** Google Doc or Notion page with screenshots + captions. Publish link, share with clients. No code needed. Update anytime.
  - **Medium:** Build `/help` page inside PetPro with sections (Getting Started, Calendar, Clients, Boarding, Staff, AI Features). Each section: screenshot + 2-3 sentence explanation + "Try it now →" button. Add "📖 Help" link to main sidebar.
  - **Later:** Record short Loom videos (2-3 min per feature), embed in /help page.
  - **Scope for first version:** start with Google Doc while you finish launch, upgrade to in-app /help page post-launch.

## Post-Launch (after 100 signups)

- [ ] Founder deal sunset (remove banner, flip `founder: true` flags, add tier gating for #92-94)
- [ ] Phase 6 Step 4: Enhance FlaggedBookings page
- [ ] Role-based sidebar gating for staff (hide owner menus from limited staff)
- [ ] Tier gating (#92 client portal behind Pro+, #93 AI behind Pro+, #94 Growing-tier features behind $399+)
- [ ] Vaccine expiry auto-alerts (would be nice but you said you have vax in client profile; skip unless clients ask)

## Quick Launch Reminder

Staff invite link: `https://app.trypetpro.com/staff/login` — click "🔗 Copy Staff Invite Link" button on Staff List page. Send this + their email to every staff member you add. They click "Set up your account" first time to set password.

---

## Notes

- Add more items here tomorrow as they come up.
- When all boxes above are checked, grab the next list and repeat.
- Once there's nothing left to tweak → launch.
