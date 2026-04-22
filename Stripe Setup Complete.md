# Stripe Setup Complete

**Date:** April 22, 2026
**Business:** Pamperedlittlepaws LLC
**Status:** Sandbox mode complete. Live mode pending SSN/EIN/bank/DL submission.

---

## What Got Built

All 4 PetPro subscription tiers now exist as products in Stripe with matching shareable Payment Links. The Enterprise tier is "Contact Sales" only - no Stripe product.

---

## Tier Structure (Locked In)

| Tier | Price | Trial | What's Included |
|------|-------|-------|-----------------|
| **Basic** | $70/mo | 30 days | Calendar, bookings, clients, pets, SMS reminders, grooming + boarding management, time clock |
| **Pro** | $129/mo | 30 days | Everything in Basic + client self-booking portal + staff management (logins) + staff scheduling |
| **Pro+** | $199/mo | 14 days | Everything in Pro + AI booking brain + voice booking mode |
| **Growing** | $399/mo | 14 days | Everything in Pro+ + full payroll (run payroll, taxes, year-end forms) |
| **Enterprise** | Custom | N/A | Contact Sales — multi-location, custom integrations, white-glove |

---

## Product Descriptions (as entered in Stripe)

### PetPro Basic ($70/mo)
> Solo groomer essentials. Unlimited bookings, unlimited clients, automated SMS appointment reminders, and grooming + boarding management in one simple dashboard.

### PetPro Pro ($129/mo)
> Everything in Basic, plus a branded client self-booking portal, staff management with individual logins, and staff scheduling. Give your clients the power to book themselves and your team the tools to run the schedule together.

### PetPro Pro+ ($199/mo)
> Everything in Pro, plus the PetPro AI booking brain that automatically prevents bad bookings by checking breeds, time slots, allergies, medications, and boarding capacity. Includes hands-free voice booking mode for the grooming floor.

### PetPro Growing ($399/mo)
> The complete PetPro platform. Everything in Pro+, plus full in-house payroll — run payroll, handle taxes, and generate year-end forms. The all-in-one solution for growing grooming and boarding businesses.

### PetPro Enterprise
> Custom plan for multi-location grooming and boarding businesses. Includes everything in Growing plus dedicated onboarding, custom integrations, priority support, and white-glove setup.

---

## Payment Link Configuration (applied to all 4 paid tiers)

**Checked (ON):**
- Collect customer names
- Collect customer addresses
- Require customers to provide a phone number (needed for Twilio SMS)
- Include a free trial (30 days for Basic/Pro, 14 days for Pro+/Growing)

**Unchecked (OFF):**
- Enable Managed Payments (new feature, not needed)
- Collect tax automatically (Stripe Tax setup comes later, separately)
- Collect business names
- Limit the number of payments

**Pricing model:** Flat rate for all tiers (not tiered, not usage-based)
**Billing period:** Monthly
**Payment type:** Subscription (Recurring)
**Payment methods:** Card, Apple Pay, Klarna, Cash App Pay, Amazon Pay (default Stripe set)

---

## How the Free Trial Works

Stripe handles the entire trial mechanic automatically. No code needed for the trial itself.

1. Customer clicks Subscribe button → lands on Stripe checkout
2. Customer enters credit card (required upfront — weeds out junk signups)
3. Stripe creates the subscription in "trial" status — card is NOT charged
4. 30 days (or 14 days) pass
5. Day N+1: Stripe auto-charges the monthly price and starts renewal cycle
6. If customer cancels any day during trial: $0 charged, subscription ends

What we still need to code (next session):
- Webhook so Stripe tells our Supabase when a subscription starts, renews, or cancels
- subscription_tier column on groomers table so we know who has what
- Feature gating based on tier

---

## Stripe Account Info

- **Business name:** Pamperedlittlepaws LLC
- **Business website entered:** https://app.trypetpro.com/plans
- **Account mode:** Sandbox (test mode)
- **Dashboard URL:** https://dashboard.stripe.com
- **Still TODO for LIVE mode:** SSN, EIN, bank account, driver's license

---

## What's Next (in order)

1. **Task #90** — Add `subscription_tier` column to groomers table in Supabase (one SQL command)
2. **Task #91** — Build Stripe webhook Edge Function (listens for Stripe events, updates Supabase)
3. **Wire payment links into Plans.jsx** so Subscribe buttons go to Stripe
4. **Task #92** — Gate client portal behind Pro+ ($129+)
5. **Task #93** — Gate AI features behind Pro+ ($199+)
6. **Task #94** — Gate payroll behind Growing ($399+)
7. **Task #95** — AI usage tracking + cap enforcement
8. **Submit live-mode info** — SSN, EIN, bank, DL — then regenerate all 4 payment links as REAL links

---

## Where the Payment Links Live

See `Stripe Sandbox Links.md` in this same folder for the 4 URLs.

Also shared with Viktor (marketing site builder) — he'll use these on trypetpro.com until live links are ready.
