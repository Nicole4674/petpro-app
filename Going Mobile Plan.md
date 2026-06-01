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

## On hold / parked while mobile is the focus
- Referrals & Marketing Suite (see `Referrals & Marketing Spec.md`)
- Photo bucket, coupons, marketing templates, Suds auto-posting
- These resume after — or alongside — the mobile decision.
