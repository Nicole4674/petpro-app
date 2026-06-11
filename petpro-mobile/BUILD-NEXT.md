# PetPro Mobile — What's Left

_Last updated: June 4, 2026_

## 🗓️ The plan (UPDATED)
**Launch the GROOMER app FIRST (solo), then build the tiny PetParent app.**
Rationale: get through Google's process once, clear any first-time review/wait
periods, learn the store — then the PetParent app (~half a day, very small) ships
through a process Nicole already knows. Groomer app is feature-complete for v1.

### 🚀 Shortest path to the store (groomer app)
1. [ ] Set up EAS (Expo account + eas-cli + eas build config)
2. [ ] App icon + splash screen (final art)
3. [ ] app.json config: name, slug, version, android.package (e.g. com.pamperedlittlepaws.petpro), permissions
4. [ ] Register the package name (Android developer verification page)
5. [ ] Build the AAB with EAS, upload to Play Console
6. [ ] Store listing: title, short + full description, phone screenshots, feature graphic, privacy policy URL (have it), data-safety form, content rating, target audience
7. [ ] Submit for review → live
- Optional for v1 (ship later via OTA/dev build): push notifications, GPS/route, web→app deep link, Tap to Pay.

### After groomer app is live
- [ ] Build PetParent app (simple profile + self-booking; mirrors web client portal)

## ✅ Google Play — DONE
- [x] **D-U-N-S number** — received (~1 week, not 30 days).
- [x] **Google Play developer account** — created as Organization "PetPro Software" under Pamperedlittlepaws LLC; identity verified; no 12-tester requirement. (Account approved in ~1 hour.)
- [ ] Later (at launch): register app package name + create app listing + upload build.

## ✅ Done recently
- Suds robot indicator (Day blocks, Week/Month cards, pulsing "Booked by Suds" badge on appointment detail)
- Week view = full MoeGo-style 7-day time grid (tap any slot to book)
- Price on calendar (Day + Week blocks)
- Agreements screen (view + edit waivers, syncs with web)
- Receipts (appointment, boarding, sale) — Email / Text / Print
- Appointment notes parity: grooming-notes timeline + client notes (view/add/edit/delete, synced via client_notes)
- Punch Cards, Promos, Expenses, Service Zones (web parity)
- Import/Export → web link; login password eyeball; More menu now scrollable
- Flagged Bookings (review/approve/decline Suds's flags)
- Balances (outstanding balances, remind + record payment)
- Waitlist (manage, notify, book, reorder, add)

## 🔜 Next up (groomer app)
- [ ] One more grooming popup tweak (Nicole to describe — optional, not a launch blocker)
- Done since: Flagged Bookings, Balances, Waitlist, Dashboard, Check-Out button, Punch Cards, Promos.

## 🐾 Pet-owner app (the quick, easy build — do during the D-U-N-S wait)
- [ ] Simple client profile
- [ ] Self-booking with Claude validation
- [ ] (mirrors the existing web client portal)

## 🔄 Website → app parity backlog (catch up on changes made during the wait)
_Captured, not started. Nicole will send screenshots to add detail._
- [ ] **Promos** — groomer-side Promos manager in the app (create/share referral & win-back codes: $ or % discount, share link `/portal/signup?...&promo=CODE`, rewards auto-apply on first booking). Mirrors website `Promos.jsx`.
  - Note: the CLIENT side of *applying* a promo lives in the client portal → that's the **PetParent app**, not the groomer app.
- [x] **Free AI migration / Import-Export** — DONE as a web link (More → Import / Export Clients → opens `/import` on web). Decision: it's a one-time, desk-bound onboarding task that leans on the website's Suds migration machinery — not worth rebuilding in-app. App links out instead.
- [x] **SMS permanent on $70 Basic** — already works in app; SMS is on all tiers (allowance cap, not a locked feature). No app change needed.
- [ ] **Punch Cards** — prepaid packages ("buy 5 baths, get 1 free"). Groomer creates a card: name, which services it applies to, # of punches, card price (paid once), expires-after, portal description. Punches auto-suggest at checkout. Mirror website `PunchCards.jsx`.
- [x] **Zones & ZIP codes** — DONE (management). Create/edit/delete zones (name, color, days, ZIP list). Coverage MAP links out to web for now (Leaflet/geocoding is web-only). In More → Service Zones.
- [x] **Expenses** — DONE. Tax-deductible expense tracker: Revenue/Expenses/Profit cards by period, top-category bars, add/edit/delete with tax-help text per category, CSV export via share sheet. In More → Expenses.
- [x] **Password eye toggle on login** — DONE (added show/hide eyeball to the app sign-in).
- [ ] (Add more here as screenshots come in.)

## 🧩 Plan gating (foundation for daycare/training)
**Confirmed rule: plans are ADDITIVE — higher tiers keep everything lower tiers have, plus more.**
- **Basic ($70) + Pro ($129):** SMS, Suds, mobile, grooming, boarding, products
- **Pro+ ($199) + Growing ($399):** all of the above **+ training + daycare**
- **All 4 plans:** products / retail
- [ ] Build plan-gating/locks in the app (gate training + daycare to $199+). Do AFTER those features exist.

## 🆕 Future builds (website first, then gate into app at $199+)
- [ ] **Daycare** — build on website, get working, then add to app (gated $199+)
- [ ] **Training** — build on website, get working, then add to app (gated $199+)
- _Plan: if Google review isn't done when the app is store-ready, build daycare + training in the other chat during the wait._

## 🚀 Launch-time (need a dev build — NOT Expo Go)
- [ ] Mobile/route + GPS tracking
- [ ] Push notifications (new bookings, messages, flags)
- [ ] Web → app deep link (2-way link, app→web already done)

## 🏁 Last, right before store submission
- [x] Dashboard / Home screen — DONE (stat tiles + quick-action grid + today's schedule + boarding)
- [ ] Set up EAS (Expo build + over-the-air updates)
- [ ] Google Play: Organization account under **Pampered Little Paws LLC** (uses D-U-N-S → no 12-tester requirement)
- [ ] Store listing: icon, screenshots, description, data-safety form
- [ ] **Release groomer + pet-owner apps together**

## 💳 After launch
- [ ] **App-open welcome screen (auth landing)** — right now the app opens straight to Login. Add a welcome screen with two choices:
  - **Create Account** → goes to **Plans** (web `/plans`). Picking a plan is what creates the groomer_id + payment (Stripe) + login. New groomers onboard here.
  - **Log In** → existing app login.
  - (JS-only / instant OTA — could even ship pre-launch, but parked for after per Nicole.)
- [ ] **Mobile (GPS/route) in the app** — NOT built yet; was waiting for the app to finish because GPS needs a dev build. This is the mobile-grooming route/Today's Route feature. (Already on the launch-time list under GPS/route.)
- [ ] Tap to Pay
- [ ] Apple/iOS release (same D-U-N-S works for Apple too)

## 🧹 Optional cleanup
- [ ] Migrate expo-av → expo-audio
- [ ] Finish gradient/shadow polish on remaining sub-screens
- [ ] Barcode camera scanning in Add Product
