# 🚐 Mobile Integration — Master Plan

> **Goal:** Beat MoeGo on mobile groomer routing. They have a tappable address. We have a full route engine with smart optimization, ETA texts, and address-level memory.
>
> **Why this matters:** Mobile is the segment where MoeGo is weakest and where Nicole has direct lived experience. Building a great mobile route engine is a real wedge feature.
>
> **Status legend:** `[ ]` not started · `[/]` in progress · `[x]` done
>
> **Tech stack additions:**
> - Google Maps API (free tier covers small shops — Distance Matrix + Directions)
> - Twilio (already wired for SMS)
> - Leaflet OR Google Maps JS SDK for the route map view
>
> **New env vars needed:**
> - `VITE_GOOGLE_MAPS_API_KEY` (Vercel)
> - `GOOGLE_MAPS_API_KEY` (Supabase Edge Functions secrets)

---

## Phase 1 — Tap address opens nav app (parity with MoeGo)
**~30 min. Instant win.**

- [ ] Wrap all address fields in `<a href="https://www.google.com/maps/dir/?api=1&destination=ENCODED_ADDRESS&travelmode=driving">` so phones default to the user's nav app
- [ ] Wrap all phone numbers in `tel:` links
- [ ] Files to touch:
  - `src/pages/ClientDetail.jsx` — client profile address
  - `src/pages/Calendar.jsx` — appointment popup owner contact section
  - `src/pages/BoardingCalendar.jsx` — kennel card owner contact section
  - `src/pages/ClientPortalDashboard.jsx` — shop info if mobile groomer
- [ ] New helper: `src/lib/maps.js` exporting `mapsUrl(address)` and `telUrl(phone)` so we don't repeat URL-encoding 6 times
- [ ] **Test:** Load on phone → tap any address → opens Google Maps with directions pre-filled
- [ ] **Test:** Load on phone → tap any phone number → opens dialer

---

## Phase 2 — Today's Route view (the headline feature)
**Half day. The visual centerpiece.**

- [ ] Create new sidebar item "📍 Route" between Calendar and Boarding (Sidebar.jsx)
- [ ] New file: `src/pages/Route.jsx`
- [ ] New component: `src/components/RouteMap.jsx` (Leaflet-based or Google Maps JS SDK)
- [ ] **Layout:**
  - Top bar: today's date + count of stops + total drive miles estimate + total drive time estimate
  - Map (left side or top on mobile): pins for every stop, color-coded by status
    - Confirmed = blue
    - Pending = yellow
    - Checked-in = green
    - Completed = gray
  - List rail (right side or below on mobile): stops in time order with client + pet + service + ETA
- [ ] Pull data: today's appointments + boarding pickups + boarding drop-offs, joined with client addresses
- [ ] Add Google Maps API key to Vercel env: `VITE_GOOGLE_MAPS_API_KEY`
- [ ] **Test:** Open on phone → see map of today's day → tap a pin to see appointment details popup

---

## Phase 3 — One-tap "Start Route" multi-stop
**~1 hour. Killer differentiator MoeGo doesn't have.**

- [ ] Big button on Route page: "🚗 Start Route — 7 stops"
- [ ] Tapping it builds a multi-waypoint Google Maps URL:
  ```
  https://www.google.com/maps/dir/?api=1
    &origin=current+location
    &destination=LAST_STOP_ADDRESS
    &waypoints=STOP1|STOP2|STOP3
    &travelmode=driving
  ```
- [ ] Google Maps opens with the entire day pre-loaded — Nicole drives and Maps auto-advances
- [ ] **Edge case:** if more than 9 waypoints, split into 2 trips (Google's limit) and show "Continue route" button after first batch
- [ ] **Test:** Tap button on phone → Google Maps opens with all stops as one trip

---

## Phase 4 — Smart route optimizer
**~Half day. Real ROI on gas + time.**

- [ ] New edge function `supabase/functions/route-optimize/index.ts`
- [ ] Calls Google's Routes API or Distance Matrix API to find the shortest path
- [ ] **Toggle on Route page:** "Optimize order" — when ON, stops sort by drive time instead of appointment time
- [ ] **Soft warning:** if optimized order conflicts with appointment times ("Susan is booked at 11 AM but optimized order says go there at 2 PM — keep manual order?")
- [ ] **Fallback:** if Google API fails, use simple nearest-neighbor algorithm in JS (suboptimal but free)
- [ ] **Test:** Scramble 5 stops geographically → hit Optimize → see them re-ordered by best drive route

---

## Phase 5 — Auto-ETA texts to next client
**~2 hours. Pure delight feature.**

- [ ] On the Route page, each stop has a "✓ Done" button
- [ ] Tapping Done shows: "Text [next client] that you're 15 min away?" with [Yes / Skip] buttons
- [ ] If Yes → fires `send-eta-text` edge function via Twilio
- [ ] **Default text template:** *"Hi Susan! Nicole from PetPro is on her way to Buddy's appointment, ETA about 15 min. See you soon! 🐾"*
- [ ] Customizable in Shop Settings → "ETA text template" (groomer can override)
- [ ] Computes ETA using Google Distance Matrix from current location to next stop
- [ ] **Test:** Tap Done → accept → next client receives text within 5 sec

---

## Phase 6 — Running late detector
**~1 hour. Saves face with grumpy clients.**

- [ ] On Calendar.jsx (or Route.jsx), if current time > current appointment's `end_time` by 5+ min:
  - Show a yellow banner: "⏰ Running late — text next client?"
  - One-tap to send "Hey [name], running ~10 min late, see you shortly!"
- [ ] Use device clock (no edge function needed for the banner — only for the text send)
- [ ] **Test:** Open active appointment → wait past end time → see banner appear

---

## Phase 7 — Visit history per address
**~Half day. The "we know your house" magic.**

- [ ] **DB option A:** Extend `clients` table with `address_notes` text field
- [ ] **DB option B:** New `client_addresses` table (cleaner if a client has multiple service locations)
- [ ] Notes specific to the LOCATION not the client (gate codes, parking tips, dog door, "park in driveway not street")
- [ ] Show on Route page when tapping a stop
- [ ] Show on the appointment popup when viewing details
- [ ] Editable from ClientDetail.jsx
- [ ] **Test:** Add note to Susan's address → next visit shows it on the appointment card AND route stop pin

---

## Phase 8 — Drive time padding in booking
**~3 hours. Prevents over-booking on driving days.**

- [ ] When booking a new appointment in Calendar.jsx, check the previous appointment's end address
- [ ] Call Google Distance Matrix to estimate drive time between previous stop and new stop's address
- [ ] If user tries to book back-to-back without a buffer, soft-warn:
  > "⚠️ This is 22 min from your previous stop — set start time to 9:52 instead of 9:30?"
- [ ] User can dismiss the warning (manual override) or accept the suggestion
- [ ] **Test:** Book 9 AM at address A → try to book 9:30 at address B 22 min away → see suggestion to start at 9:52

---

## Phase 9 — Print route sheet
**~1 hour. Some groomers want paper backup.**

- [ ] Print button on Route page
- [ ] Generates clean printable HTML: stops in order, addresses, times, client + pet + service, address notes
- [ ] No app chrome (sidebar hidden via @media print CSS)
- [ ] Includes shop logo at top + total mileage + total drive time
- [ ] **Test:** Click Print → page renders cleanly with no app chrome → prints to one page if 8 stops or fewer

---

## Phase 11 — Mobile-aware booking modal (Nicole's observation)
**Bigger feature. Multi-day. Touches Calendar booking flow + AI booking rules.**

**The insight:** mobile groomers book differently from shop groomers. A shop picks the open time slot — that's it. A mobile groomer needs to consider drive time to existing stops AND location of the new client. Booking 11 AM at address A and 11 AM at address B 25 min apart = a wasted hour.

**What to build:**
- [ ] When `shop_settings.is_mobile = true`, the Calendar booking modal shows extra context:
  - Drive time + distance from previous stop on that day
  - Drive time + distance to next stop on that day
  - Suggested time slot if the proposed time creates a long drive ("11 AM works, but 11:30 reduces drive time by 18 min")
- [ ] "Zone view" mode in Calendar: group appointments by area/zone (Cypress north, Cypress south, etc.) so groomer can think geographically
- [ ] Soft-warn if user tries to book back-to-back stops > 20 min drive apart with < 15 min buffer
- [ ] AI booking rules: "Cluster bookings within 5 miles when possible" as a settable rule for mobile shops
- [ ] When client books via portal, suggest times that fit the groomer's existing route, not just open slots

**Why call this out now (per Nicole):** if this touches a lot of files, it's cheaper to do it WHILE we're in mobile-features territory rather than retrofit later when the booking flow has shifted further away from us.

**Files this will touch:**
- Calendar.jsx booking modal
- BoardingCalendar.jsx booking modal
- ClientPortalDashboard.jsx booking flow (if clients book via portal)
- BookingRules.jsx (new rule type for mobile clustering)
- src/lib/maps.js (drive-time helpers)
- New edge function: `route-distance-check`

**Defer for now** — Phase 1-10 first, then come back here when we've shipped the basics and have user feedback.

---

## Phase 10 — Mobile groomer toggle in Shop Settings
**~30 min. Hides Route from storefront groomers.**

- [ ] New toggle in Shop Settings: "🚐 I'm a mobile groomer (or have mobile staff)"
- [ ] When OFF: the Route sidebar item is hidden, drive-time padding warnings don't fire
- [ ] When ON: Route page accessible, drive-time padding active, ETA text feature available
- [ ] Stored in `shop_settings.is_mobile`
- [ ] **Test:** Toggle off → Route page disappears from sidebar → toggle on → Route page appears

---

## Suggested execution order

1. Phase 1 (tap-to-nav) — 30 min, instant win
2. Phase 2 (Route view) — half day, the headline
3. Phase 3 (one-tap multi-stop) — 1 hour, the killer differentiator
4. **Pause and use it for 2-3 mobile grooms in real life** — gather feedback
5. Phase 5 (ETA texts) — high client-delight value
6. Phase 4 (optimizer) — once you're sure the basics work
7. Phase 6, 7, 8, 9, 10 — polish and edge cases

---

## Stuck points to flag in advance

- **Google Maps API key billing:** Free tier is 28,000 requests/month. For one shop that's plenty. For 100 shops we'll need to plan billing — Maps API requires a credit card on file even for the free tier.
- **iOS PWA limitations:** if Nicole adds PetPro to her iPhone home screen, some nav app handoffs work differently. Test on a real iPhone.
- **Multi-stop Google Maps limit:** 9 waypoints max via URL scheme. Most shops won't hit it but big boarding facilities + groomers might.

---

## Files I'll be touching (running tally)

| File | Purpose | Phase |
|---|---|---|
| `src/lib/maps.js` | Helper for URL building | 1 |
| `src/pages/ClientDetail.jsx` | Tap-to-nav addresses | 1, 7 |
| `src/pages/Calendar.jsx` | Tap-to-nav, late detector, drive padding | 1, 6, 8 |
| `src/pages/BoardingCalendar.jsx` | Tap-to-nav | 1 |
| `src/pages/ClientPortalDashboard.jsx` | Tap-to-nav for shop info | 1 |
| `src/pages/Route.jsx` | NEW — Today's Route view | 2, 3, 5, 9 |
| `src/components/RouteMap.jsx` | NEW — Map component | 2 |
| `src/components/Sidebar.jsx` | Add Route nav item | 2, 10 |
| `src/pages/ShopSettings.jsx` | Mobile toggle, ETA template | 5, 10 |
| `supabase/functions/route-optimize/index.ts` | NEW — Optimizer | 4 |
| `supabase/functions/send-eta-text/index.ts` | NEW — ETA Twilio sender | 5 |

---

## Acceptance criteria (whole feature)

- [ ] Mobile groomer can open the app on their phone, see today's route, tap "Start Route", and Google Maps drives them through the day
- [ ] Each client gets a heads-up text when Nicole is on her way
- [ ] Address-level notes ("park in driveway") show up at the right moment
- [ ] Booking a new appointment respects drive time so the calendar can't be over-stuffed
- [ ] Storefront groomers don't see this feature at all (clean UX)
