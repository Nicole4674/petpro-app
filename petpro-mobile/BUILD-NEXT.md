# PetPro Mobile — What's Left

_Last updated: June 4, 2026_

## 🗓️ The plan
D-U-N-S number is submitted (takes up to 30 business days). Use that wait as the
build window: finish the groomer app + build the pet-owner app, then **launch
both apps together** once the D-U-N-S arrives.

## ⏳ Waiting on (no action needed)
- [ ] **D-U-N-S number** — submitted to Dun & Bradstreet (EIN letter + Secretary of State letter uploaded). Arrives by email, up to ~30 business days. Save the number when it comes — needed for Google Play (and Apple later).

## ✅ Done recently
- Suds robot indicator (Day blocks, Week/Month cards, pulsing "Booked by Suds" badge on appointment detail)
- Week view = full MoeGo-style 7-day time grid (tap any slot to book)
- Price on calendar (Day + Week blocks)
- Agreements screen (view + edit waivers, syncs with web)
- Receipts (appointment, boarding, sale) — Email / Text / Print
- Appointment notes parity: grooming-notes timeline + client notes (view/add/edit/delete, synced via client_notes)

## 🔜 Next up (groomer app)
- [ ] One more grooming popup tweak (Nicole to describe)

## 🐾 Pet-owner app (the quick, easy build — do during the D-U-N-S wait)
- [ ] Simple client profile
- [ ] Self-booking with Claude validation
- [ ] (mirrors the existing web client portal)

## 🚀 Launch-time (need a dev build — NOT Expo Go)
- [ ] Mobile/route + GPS tracking
- [ ] Push notifications (new bookings, messages, flags)
- [ ] Web → app deep link (2-way link, app→web already done)

## 🏁 Last, right before store submission
- [ ] Dashboard / Home screen (quick-jump buttons)
- [ ] Set up EAS (Expo build + over-the-air updates)
- [ ] Google Play: Organization account under **Pampered Little Paws LLC** (uses D-U-N-S → no 12-tester requirement)
- [ ] Store listing: icon, screenshots, description, data-safety form
- [ ] **Release groomer + pet-owner apps together**

## 💳 After launch
- [ ] Tap to Pay
- [ ] Apple/iOS release (same D-U-N-S works for Apple too)

## 🧹 Optional cleanup
- [ ] Migrate expo-av → expo-audio
- [ ] Finish gradient/shadow polish on remaining sub-screens
- [ ] Barcode camera scanning in Add Product
