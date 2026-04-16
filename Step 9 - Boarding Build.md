# Step 9 - Boarding Build

**Status:** Spec in progress (not yet built)
**Build Order Rule:** Groomer side FIRST. Client side LAST.
**Date Started:** April 15, 2026

---

## Why This Matters (Nicole's Vision)

Boarding is where competitors fail groomers. Most software either:
- Treats boarding as an afterthought (spreadsheet-style, no kennel logic)
- Charges extra for safety features like daily check sheets
- Hides simple things (photo updates to clients) behind premium plans

PetPro flips that. Boarding is **first-class**, safety is **default**, and "more options the better" is the design philosophy. Every shop should be able to customize their boarding setup so PetPro fits THEIR workflow — not the other way around.

> Nicole's exact quote: *"more details more options the better leaving stuff out will downgrade this app by a lot"*

---

## Reference Material (Photos Nicole Sent)

### Photo 1: Gingr Lodging Calendar (the gold standard)
- Kennel rows down the LEFT side, grouped by category (e.g. "Standard Suites | Large 1, 2, 3, 4, 5...")
- 7 days across the TOP with vacancy counts (e.g. "7W" / "14/15") at the top of each day
- Filters: Show All / Show Only Vacant / Show Only Occupied
- Reservation Type filter dropdown (Boarding | Standard, Daycare, etc.)
- Color-coded legend: Vacant, Occupied, Reservation Start, End, Transfers
- Toggle: Day / Week / Month views

### Photo 2: Gingr Month Calendar
- Daily summary cards stacked: "Boarding - 14 Reservations / Daycare - 24 / Groom - Full Groom - 1"
- Color-coded by service type
- Click into a day for full details

### Photo 3: Veterinary Kennel Card Template (Etsy printable)
**Big format — clipboard size**
Fields:
- Pet Name, Breed
- Age, Sex, Allergies, Disabilities, Color/Markings
- Microchip No., Arrival Date, Departure Date, Spay/Neuter, Vaccinations
- Veterinarian Information
- Owner(s) Name, Owner Phone 1, Owner Phone 2
- Email, Address
- **Instructions section:** Food & Water | Grooming & Activity | Medications & Other

### Photo 4: SmartPractice Daily Log Card (small format)
**Pocket size — kennel tech daily checks**
Header: Animal's Name | M/F | Date In | Owner's Name | Date Out | Home Phone | Emergency Phone
Checkboxes: IN FOR — Surgery / Boarding / Grooming / Other
**Daily log table (6 rows):** Date | Meds | Appetite | Feces | Urine | Vomit | COMMENTS

### Photo 5: Gingr Reservation Form
Fields: Location, Type, Pet(s) typeahead, Confirm for Customer?, Wait List?
Date: Start Date / Start Time + End Date / End Time
Buttons: Add Recurring Dates | Add Another Reservation | Override hours?
Estimate section, Save / Clear / Create Deposit buttons

### Photo 6: Gingr Report Card
- Choose a Reservation
- Rich text Comments/Notes
- Rich text Health Notes
- (PetPro will improve: photos attached, mobile-friendly entry, auto-text to client)

---

## Visual Theme

- **Primary color:** Purple (replaces Gingr's red)
- **Accent:** Paw prints throughout the UI (subtle, charming, industry-appropriate)
- **Tone:** Professional but warm — these are people who love animals
- **Match the rest of PetPro:** Same theme as grooming dashboard for visual consistency

---

## Core Features (Master List)

### 1. Boarding Setup Wizard (per-shop config)
Each shop owner runs this once on signup. Defines THEIR boarding setup.

**Setup type (pick one or combine):**
- Numbered kennels/runs (Kennel 1, 2, 3...)
- Capacity-based (just total dogs/night)
- Sized kennels (small, medium, large categories)
- Suites + standard tiers (premium pricing)

**Custom kennel categories:** Shop names them whatever they want (Luxury Suite, Standard Run, Cat Condo, Puppy Pen, etc.)

**Family bookings:** Toggle ON/OFF — does this shop allow siblings to share a kennel?

### 2. Pricing Configuration (per-shop)
Fully customizable. NO hardcoded prices.
- Base nightly rate (flat, by-weight, or by-kennel-type)
- Late checkout fee logic (e.g. "after 12pm = +1 night")
- Add-on pricing (bath, playtime, meds admin, daycare)
- Holiday surcharges (optional)
- Multi-pet discount (optional)

### 3. Lodging Calendar (Main View)
- Week view (default) — kennels as rows, days as columns
- Day view — single day deep-dive
- Month view — daily totals only
- Vacancy counter at top of each day
- Filters: Show All / Vacant / Occupied
- Click empty cell → New Reservation form
- Click occupied cell → Kennel Card popup

### 4. Reservation Form
**Fields:**
- Location (if multi-location shop)
- Reservation type (Boarding / Daycare / Boarding+Bath combo)
- Pet(s) — typeahead, multi-select for family bookings
- Confirm for Customer? checkbox
- Wait List? checkbox (when fully booked)
- Start Date + Time / End Date + Time
- Add Recurring Dates (for repeat boarders)
- Add Another Reservation (for multi-pet families)
- Override hours? (manager override for after-hours)
- Add-ons: Bath, Playtime, Meds Admin, Daycare
- Live price estimate as form is filled
- Deposit option (Stripe integration)

**Claude AI Validation (the brain):**
- Checks vaccine expiration dates BEFORE confirming
- Checks kennel availability across full date range
- Flags overlapping bookings
- Flags allergy conflicts (food brought from home)
- Flags behavior conflicts (aggressive dog next to anxious dog)
- Suggests best kennel based on dog size/temperament

### 5. Kennel Card (Pet Profile While Boarding)
**When groomer clicks a pet's kennel in the calendar:**

**Pet Identity Section:**
- Pet name, breed, age, sex, color/markings
- Photo
- Microchip number
- Spay/Neuter status

**Owner Contact Section:**
- Owner name(s)
- Owner Phone 1 + Phone 2
- Email
- Emergency contact
- Veterinarian info

**Health Section:**
- Allergies (food, environmental, medication)
- Disabilities or special needs
- Current vaccinations + expiration dates ⚠️ FLAG IF EXPIRED
- Medications + dosing schedule + times

**Stay Instructions Section:**
- Food & water (own food vs facility, amounts, frequency)
- Grooming & activity preferences
- Medications & other instructions
- Behavior notes (anxiety, aggression, escape artist, etc.)

### 6. Printable Kennel Cards (TWO sizes)
**Big format (clipboard size — 8.5x11):**
- Full pet profile + instructions
- Used as the "stay overview" card hung on kennel door

**Small format (pocket card / index card size):**
- Daily log table (Date | Meds | Appetite | Feces | Urine | Vomit | Comments)
- Like the SmartPractice card
- Used by kennel techs walking the rounds

**PDF generation:** Both auto-generate from pet data, ready to print.

### 7. Daily Welfare Check (App + Print)
**Optional per shop** — some require strict logging, some don't.

**Daily checklist for each boarded dog:**
- ✅ Ate breakfast / lunch / dinner (with portion notes)
- ✅ Drank water
- ✅ Walked (track multiple walks per day with timestamps)
- ✅ Bowel movement (normal / loose / none)
- ✅ Urination (normal / none / accident)
- ✅ Vomited? (Y/N + notes)
- ✅ Medication given? (which med, what time, by whom)
- ✅ Behavior: normal / anxious / aggressive / lethargic / playful
- ✅ Free-text observations
- 📸 Optional: photos attached

**Tech accountability:** Every entry stamped with kennel tech name + timestamp.

**Why this matters:** Liability protection. If a dog has a medical emergency, paper trail proves the shop was watching closely. Most competitors hide this in premium tiers.

### 8. Photo Updates to Clients
- Groomer/kennel tech snaps photo from phone or upload
- Add caption ("Bella had the best day playing! 🐾")
- Send to client via SMS (Twilio) or in-app
- Owner gets a notification with the photo
- HUGE emotional reassurance for anxious owners
- Becomes a portfolio for the shop's social media (with consent)

### 9. Live Cam Integration (Premium)
**Phase 1 (easy, ship in v1):**
- Shop pastes existing camera URL (Wyze, Nest, Ring, Reolink, etc.) into config
- Embed as iframe in client portal
- Optional time gating (only viewable during boarded dates)

**Phase 2 (premium tier later):**
- Native camera integration with motion alerts
- "Your dog just woke up!" push notifications
- Charge as add-on revenue

### 10. Check-In / Check-Out Flow
**Check-In:**
- Verify vaccination records (REQUIRED, hard block if expired)
- Confirm food brought from home
- Confirm meds + instructions
- Take arrival photo (proof of condition on arrival)
- Owner signature on liability waiver (digital, saved to file)
- Assign specific kennel
- Print kennel cards (big + small)

**Check-Out:**
- Final welfare summary
- Show client the daily check log (transparency = trust)
- Process final payment (any add-ons added during stay)
- Take departure photo
- Trigger rebook reminder for ~6 weeks out

### 11. Boarding + Grooming Combo
**The "pickup-day bath" upsell:**
- During reservation form, check "Add bath/groom on pickup day"
- Auto-creates linked grooming appointment for departure day
- Claude validates groomer availability
- Shows on grooming calendar AND boarding calendar
- One bill, one workflow

### 12. Reports & Analytics (Future)
- Daily occupancy report
- Monthly revenue by service type
- Most-booked kennels (helps with renovation decisions)
- Repeat boarder loyalty list
- Behavior incident log

---

## Database Schema (Supabase)

**Tables to add for boarding:**

```sql
-- Per-shop boarding config (created via setup wizard)
boarding_settings (
  id, shop_id, setup_type, allow_family_kennels,
  late_checkout_time, late_checkout_fee, daily_checks_required
)

-- Kennel categories (Standard Suite, Large Run, etc.)
kennel_categories (
  id, shop_id, name, description, base_price, max_dogs
)

-- Individual kennels (Large 1, Large 2, etc.)
kennels (
  id, shop_id, category_id, name, position, notes, is_active
)

-- Boarding reservations
boarding_reservations (
  id, shop_id, pet_id, kennel_id, start_date, start_time,
  end_date, end_time, status, total_price, deposit_paid,
  notes, created_by, confirmed
)

-- For multi-pet family bookings (siblings sharing)
boarding_reservation_pets (
  reservation_id, pet_id
)

-- Add-ons booked per reservation
boarding_addons (
  id, reservation_id, addon_type, price, scheduled_for, completed
)

-- Daily welfare logs
welfare_logs (
  id, reservation_id, log_date, ate_breakfast, ate_lunch, ate_dinner,
  walks (jsonb array of timestamps), bowel_movement, urination,
  vomited, vomit_notes, behavior, observations, photos,
  recorded_by, recorded_at
)

-- Medication tracking during stay
medication_logs (
  id, reservation_id, medication_name, dose, given_at, given_by, notes
)

-- Photo updates sent to clients
photo_updates (
  id, reservation_id, photo_url, caption, sent_via, sent_at, sent_by
)

-- Vaccination records (CRITICAL for safety)
pet_vaccinations (
  id, pet_id, vaccine_type, administered_date, expiration_date,
  vet_clinic, document_url
)
```

---

## Build Order (Don't Skip Steps)

**Phase 1: Foundation (Build First)**
1. Database schema (create all tables in Supabase)
2. Boarding setup wizard (so we can configure a test shop)
3. Kennel category + kennel CRUD pages
4. Lodging calendar (week view) — read-only first

**Phase 2: Core Booking Flow**
5. New reservation form (with Claude validation)
6. Kennel card popup (full pet profile)
7. Vaccination tracking + expiration flagging
8. Edit / cancel reservation

**Phase 3: Daily Operations**
9. Daily welfare check form (in-app)
10. Medication log
11. Printable kennel cards (big + small format PDFs)
12. Check-in / check-out flow

**Phase 4: Client Delight**
13. Photo updates to clients (Twilio SMS)
14. Boarding+Grooming combo bookings
15. Add-ons (bath, playtime, etc.)

**Phase 5: Premium**
16. Live cam embed
17. Reports & analytics

**Phase 6: Client-Side Web Portal (LAST)**
18. Public booking page
19. Owner login / view their dog's stay
20. Owner photo gallery
21. Owner self-service rebook

---

## Open Questions (To Answer Later)

- [ ] Wait list logic: Auto-promote when someone cancels?
- [ ] Multi-location shops: How to switch between locations in UI?
- [ ] Cancellation policy: Configurable per shop? (e.g. 48-hr free cancel)
- [ ] Tax calculation: Per shop or per state?
- [ ] Kennel maintenance mode: Block a kennel from booking when it needs cleaning/repair?
- [ ] Recurring boarder packages: e.g. "10 nights for $X" prepaid?
- [ ] Cat boarding: Different setup needed? (most cat condos are vertical not horizontal)

---

## Notes from Nicole

- "more details more options the better leaving stuff out will downgrade this app by a lot"
- "i had a job where you can mark off when they where walked, if they vomited things like that"
- "im very detail oriented and more info the better"
- Ship groomer side first. Client side LAST.
- Theme: Purple + paw prints
- Kennel cards: Two sizes (big with clipboard, small daily log)
- Some shops are strict about daily checks, some don't care — make it OPTIONAL but available
- Safety #1 — printable check sheets protect dogs AND protect shops legally

---

## Status Tracker

- [x] Spec written (April 15, 2026)
- [ ] More UI photos collected (in progress)
- [ ] Database schema reviewed by Nicole
- [ ] Phase 1 build started
- [ ] Phase 1 build completed
