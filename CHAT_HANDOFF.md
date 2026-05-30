# PetPro — Chat Handoff

_Last updated: May 30, 2026_

## Who I am / how to help me
- I'm Nicole — professional dog groomer building **PetPro**, an AI-powered pet grooming + boarding SaaS.
- **No prior web dev experience.** Go step by step, one thing at a time. Ask questions instead of assuming. Guide in the correct build order to avoid rework.

## What PetPro is
AI-powered grooming **and** boarding management in one web app for solo groomers and small facilities.

**Tech stack:**
- React frontend
- Supabase (database + edge functions)
- Claude API (AI booking brain)
- Twilio (SMS/text)
- Stripe (subscription payments + client/boarding charges)
- Whisper API (voice commands)
- Vercel (hosting)

**Core features:**
- Groomer dashboard with hands-free voice booking
- Claude "booking brain" that prevents bad bookings (breed vs. time slot, allergies, medications, boarding capacity/overlaps)
- Automated text reminders + rebook notifications
- Client self-booking portal with Claude validation
- Monthly tiered subscription pricing

## Bugs found & fixed this session

### Bug 1 — TDZ crash on client portal Pay (FIXED in code)
Clicking **Pay** threw `Cannot access 'groomer' before initialization`.
- **Cause:** temporal dead zone in `supabase/functions/stripe-charge-card/index.ts`
  — line 143 used `groomer.id` before the `groomer` variable was created (line 177).
- **Fix:** changed line 143 to `.eq('groomer_id', appointment.groomer_id)`.

### Bug 2 — OVERCHARGE: ignored custom price `quoted_price` (FIXED in code)
A Nail Trim with a $10 catalog price was overridden to **$1** by the groomer.
The whole UI showed $1, but the client was charged **$10**.
- **Cause:** both charge functions computed the total from the catalog
  `services.price` and never read the per-booking `quoted_price` override
  (the field the rest of the app uses: prefer `final_price` ?? `quoted_price`
  ?? catalog `services.price`).
- **Fix applied to BOTH:**
  - `stripe-charge-card/index.ts` (client portal pay)
  - `stripe-groomer-charge/index.ts` (groomer charges client from calendar)
  - Now: per-pet `quoted_price` first → fallback catalog price; legacy appt uses
    `final_price`/`quoted_price` before catalog. Also aligned the "paid so far"
    math to subtract refunds (matches the portal).
- **Checked & safe:** `stripe-charge-boarding/index.ts` reads `total_price` off
  the reservation row directly — no overcharge risk.

## ⚠️ Open / next steps — NOT done yet
- [ ] **Refund the bad $10 test charge.** Use the in-app **Refund** button in the
      appointment's Payment History (keeps Stripe + your DB in sync) rather than
      refunding only in the Stripe dashboard.
- [ ] **Redeploy both fixed functions** (edits don't go live until deployed):
      ```
      supabase functions deploy stripe-charge-card
      supabase functions deploy stripe-groomer-charge
      ```
- [ ] **Re-test the $1 appointment** from the client portal — it should now
      charge exactly $1.00, not $10.00.
- [ ] (Optional) Spot-check any other place that charges a card to be sure it
      uses `quoted_price`, not raw catalog price.

## Handy reference
- Error `Cannot access 'X' before initialization` = a variable is used on a line
  *above* where it's declared with `const`/`let`. Fix by moving the declaration up
  or using a value already available.
- Project folder: `PetPro/`
- Stripe edge functions live in: `supabase/functions/stripe-*`
