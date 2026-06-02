# 🦦 PetPro — Going Mobile (Native App) Plan

*Captured June 1, 2026. Strategic notes for when Nicole builds the native app.
NOT started yet — this is the roadmap + the gotchas she hit while exploring.*

---

## Why go native (the payoff features)

The native app unlocks things the web app / PWA simply cannot do:

1. **Tap to Pay** — accept contactless card payments on the phone itself (no
   hardware reader). Requires Stripe's native Terminal SDK — web/PWA can't do it.
2. **Live driver GPS tracking** — Amazon/Uber-style "see your groomer en route"
   moving pin for clients. Needs *background* location, which web/PWA can't do
   (the browser stops sending location the moment the groomer switches to Maps).
   Native apps CAN run background location with permission.

Both of these are the headline reasons to go native. Most of PetPro already works
great on web — native is about these specific depth features.

---

## How to build it WITHOUT a full rewrite

- Use **Capacitor** to wrap the EXISTING PetPro web app into a native shell.
  The web app and native app share ONE codebase — not a ground-up rebuild.
- Add native plugins where needed (Stripe Terminal for Tap to Pay, a
  background-geolocation plugin for live tracking).
- Build it on a **separate git branch** so the live web app keeps running and
  nothing ships to real groomers until it's ready.

---

## The Mac problem (and the workaround)

Nicole is on **Windows**. Key facts she learned:

- **Android app** → can be built 100% on Windows. No Mac. Free. START HERE.
- **iPhone app** → Apple requires macOS + Xcode to compile/submit. CANNOT build
  iOS directly on Windows.
- **Workaround (no Mac purchase):** a **cloud build service** (Expo EAS,
  Codemagic, etc.) compiles the iOS app on their Macs in the cloud. Develop on
  Windows, build iOS in the cloud, submit to App Store. Small monthly/per-build
  fee — way cheaper than buying a Mac.
- **Testing iPhone:** daughter's iPhone works great for testing via Apple
  TestFlight once the cloud service builds the app. (iPhone tests, doesn't build.)

Decision so far: **NOT buying a Mac** just for this. Use Android-first + cloud
build for iOS.

---

## Nicole's chosen plan (June 1, 2026) — START WHEN SHE HAS TIME

Timeline estimate: **4–6 months**, started when she has bandwidth (not now).
Site is feature-rich enough to pause adding features and focus on polishing into apps.

1. **Build the Android GROOMER app first** (Capacitor wrap, free, on Windows).
2. **Self-test ~1 week** to confirm it works.
3. **Release to Android groomers** for real testing (no iPhones yet).
4. **Build the client-portal app** (needed for better notifications) — test it
   while the groomer app is being tested.
5. **Apple version LAST** — months out, only if the app is doing well. Decision then:
   buy a Mac (Nicole's always wanted one) OR use a cloud build service. Focus
   solely on iOS at that stage.

## Cost reality (researched June 1, 2026) — no Mac required

- **Cloud build service:**
  - **Expo EAS** — FREE tier = 15 Android + 15 iOS cloud builds/month (iOS builds
    on their Macs, no Mac needed). Paid plans ~$19–$99/mo only if you outgrow free.
  - **Codemagic** — FREE tier = 500 Mac-build minutes/month, then ~$0.095/min.
- **App store accounts (unavoidable, not the build tool):** Apple Developer
  **$99/year**, Google Play **$25 one-time**.
- **Bottom line:** likely **$0 to start** on builds; the only sure costs are the
  store accounts. NOT buying a Mac unless/until the app earns it. Nicole is fine
  with a monthly fee; just didn't want a multi-thousand-dollar Mac purchase upfront.

App store review scrutinizes background location — "show clients their groomer is
en route" is a legitimate, approvable reason.

---

## Strategic note (worth re-reading before committing months to this)

Referrals + the marketing suite are **acquisition** (bring in MORE groomers =
revenue). The native app is **feature depth** for groomers already on board.
Nicole's own handoff calls acquisition the moat. Going all-in on native pauses
the acquisition engine. Not a wrong call — just a real trade-off to make with
eyes open. Parked for now per Nicole's decision: referrals (built, not promoted)
+ marketing suite (spec'd, not built) wait while mobile is explored.

---

## ✅ SESSION 1 PROGRESS (June 1, 2026) — app foundation built & working

**Decision locked:** building the REAL native app with **React Native + Expo** (the
ground-up path, NOT the Capacitor wrap). Frontend rebuilt natively; Supabase backend
shared/reused. Confirmed Tap to Pay + background GPS work on this stack via EAS.

**What's built and WORKING on Nicole's phone (via Expo Go):**
- Expo project at `PetPro/petpro-mobile/` (separate from the website, same git repo).
- **Login** against the real Supabase (same accounts as the website). Session persists
  via AsyncStorage (stays logged in between opens).
- **Home screen** — greets by shop name, shows TODAY's real appointments (time · pet ·
  client · service) pulled live from the DB. Refresh button.
- **Bottom tab navigation:** 🏠 Home · 📅 Schedule · 🐾 Clients · ☰ More.
  Schedule/Clients are placeholders; More has signed-in email + Sign out.

**Key setup facts (IMPORTANT for next session):**
- **Pinned to Expo SDK 54** to match the phone's Play Store Expo Go. (create-expo-app
  gave SDK 56 beta which Expo Go didn't support — downgraded to 54. If Expo Go updates,
  can bump SDK later.)
- Supabase URL + anon key are in `petpro-mobile/lib/supabase.js` (anon key is public/safe).
- Packages installed: @supabase/supabase-js, @react-native-async-storage/async-storage,
  react-native-url-polyfill, @react-navigation/native, @react-navigation/bottom-tabs,
  react-native-screens, react-native-safe-area-context.
- File layout: `App.js` (auth + tab navigator), `lib/supabase.js`, `screens/HomeScreen.js`,
  `screens/ScheduleScreen.js`, `screens/ClientsScreen.js`, `screens/MoreScreen.js`.

**How to start it again later (Windows):**
1. Open a terminal → `cd C:\Users\tread\PetPro\PetPro\petpro-mobile`
2. `npx expo start` (add `--clear` if it acts stale)
3. Open Expo Go on phone → scan QR (Android: scan from inside Expo Go; phone + PC on same Wi-Fi).
4. Editing a file + saving auto-updates the phone (Fast Refresh); press `r` in terminal to force reload.

**Design intent (Nicole's note):** match the website look closely (MoeGo-style web/app
parity). Grooming Schedule = Day/Week/Month with ← → arrows like the web Calendar, sized
for phone. Can add mobile niceties like per-appointment prices on cards.

**Also built in Session 1 (continued):**
- **Schedule tab → Day view**: ‹ date › arrows, tap date = jump to today, Day/Week/Month
  selector (Day live; Week/Month still placeholders), appointment cards show time · pet ·
  client · service · price. (`screens/ScheduleScreen.js`)
- **Clients tab → list + search** (`screens/ClientsScreen.js`) and **Client Detail** drill-in
  (`screens/ClientDetailScreen.js`): contact info + pets w/ breed·weight·age·sex.
- Added **@react-navigation/native-stack** (Clients tab is now a stack: list → detail).
- **Tab bar safe-area fix** — floats above Android system buttons (SafeAreaProvider + insets).
- Shared **`lib/petAge.js`** in the mobile app (0.75 → "9 months"), mirrors the web helper.

- **Appointment detail** drill-in (`screens/AppointmentDetailScreen.js`) — tappable from
  BOTH Home and Schedule. Home & Schedule tabs are now stacks too. Shows pet, client,
  phone, date/time, service, price, status badge, notes.

- **Schedule Week + Month views DONE** — Day/Week/Month toggle all functional. Week =
  7 day-pills with busy dots; Month = calendar grid with dots + today highlight; tap a day
  → its appointment list; ‹ › arrows shift by view; date label taps back to today.

- **First WRITE action DONE** — "Check In" button on appointment detail updates
  checked_in_at + status='checked_in'; confirmed it reflects on the website (two-way sync
  works, RLS allows the groomer's own writes). This proves the app can both read and write.

- **More tab → menu + Boarding** — More is now a stack/menu (`screens/MoreScreen.js`)
  with live "🛏️ Boarding" (`screens/BoardingScreen.js`: active + upcoming stays, pets via
  boarding_reservation_pets, "Here now" tag) and greyed placeholders for Retail/POS, Staff,
  Settings. Boarding reservations confirmed loading.

- **Polish + depth added:** Ionicons on the tab bar (via @expo/vector-icons, bundled with
  Expo — no install). Call / Text / Directions quick-action buttons on Client detail
  (Linking → dialer/SMS/maps) and Call/Text on Appointment detail. **Pet detail screen**
  (`screens/PetDetailScreen.js`: health/handling, allergies, meds, vax expiry w/ EXPIRED
  flag, aggression banner) reached via Client detail → tap pet. Client detail also lists
  the client's **upcoming appointments** (tappable → appointment detail).
- LESSON: emoji can "tofu" on some devices — use @expo/vector-icons or plain words for
  anything important, not emoji.

- **Pull-to-refresh** on Home, Schedule, Clients, Boarding (swipe down to reload).
- **Home "Boarding today"** section — shows dogs checking in / going home today (separate
  from the Boarding tab which shows all active+upcoming with "Here now").
- **CREATE flow DONE** — "+ Add" client form (`screens/AddClientScreen.js`) inserts a new
  client; confirmed it shows on the website. Clients list refetches on focus. App now does
  full read + update (check-in) + create.

## SESSION 2 (June 2, 2026) progress
- **Booking flow DONE** (`screens/AddAppointmentScreen.js`) — launched from Client detail
  "+ Book Appointment": pick pet → groomer (staff) → service → date/time (native picker) →
  saves appointment. Status saved as **'unconfirmed'** (matches website; client text-reply
  or manual Confirm confirms it — NOT auto-confirmed). Assigns staff_id.
- **Filtering parity fixes** (website hides these, app now does too): pets exclude
  is_archived + is_memorial (Client detail + booking); staff picker only status='active'
  (no disabled like Sophia); Clients list excludes is_active=false.
- **Status badges** on Home + Schedule appointment cards (color-coded, `lib/apptStatus.js`).
- **Confirm action** on appointment detail (unconfirmed → confirmed), alongside Check In.
- Date picker installed: @react-native-community/datetimepicker (Expo Go OK).
- Nicole keeping a running list of UI tweaks to apply during the design pass.

- **More menu fully lit:** Boarding, **Staff** (`StaffScreen.js`, list w/ status), **Retail**
  (`RetailScreen.js`, products w/ price + low-stock flag), **Settings** (`SettingsScreen.js`:
  shop info + working "let clients pay through portal" toggle that writes to shop_settings +
  account email). No more "soon" placeholders.

- **Messages DONE** — new 💬 tab (5 tabs now: Home/Schedule/Clients/Messages/More).
  Conversation list (`MessagesScreen.js`, grouped by client w/ unread badges) → texting
  thread (`ThreadScreen.js`, iMessage-style bubbles, marks inbound read, send via send-sms
  Twilio). Confirmed a real text sent + received.

## ✅ FUNCTIONAL v1 COMPLETE (June 2, 2026)
The app now covers every core area, reads + writes, synced to the website:
Login · Home (today + boarding) · Schedule (Day/Week/Month) · Clients (search/add/detail) ·
Pets (health) · Appointments (detail/confirm/check-in/book) · Boarding · Staff · Retail ·
Settings (live toggle) · Messages (real SMS). Native call/text/directions, pull-to-refresh,
status badges, vector icons, archived/inactive filtering matching the website.

## NEXT PHASE: 🎨 DESIGN PASS (Nicole's priority)
Make it LOOK like the website. Nicole has been keeping a running list of UI tweaks. Approach:
build a shared design system (colors, spacing, card/header components, fonts) and apply
across all screens at once. Pull her UI list + reference the web screens.

**Still-future / nice-to-have function:** more appointment ACTIONS (check-out/complete,
(check-in, take payment, etc.); Boarding; rest of "More"; then a DESIGN PASS to match the
website look closely (Nicole's priority). Tap-to-Pay + background GPS later via EAS dev build.

---

## On hold / parked while mobile is the focus
- Referrals & Marketing Suite (see `Referrals & Marketing Spec.md`)
- Photo bucket, coupons, marketing templates, Suds auto-posting
- These resume after — or alongside — the mobile decision.
