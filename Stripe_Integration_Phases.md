# Stripe Integration — Client Payments

> Goal: let groomers' clients pay through the client portal (card on file, tipping, prepay, no-show fees) — eliminating the Zelle/Venmo/Cash chaos. Money goes directly to each groomer's bank account via Stripe Connect.

---

## Two Separate Stripe Systems

| | What it does | Who pays whom | Payout |
| --- | --- | --- | --- |
| **Stripe Subscriptions** *(already built)* | Groomers pay PetPro | Groomer → Nicole | Weekly (Mondays) |
| **Stripe Connect** *(this build)* | Clients pay groomers for services | Client → Groomer | Daily |

PetPro never touches client money. Stripe Connect routes it directly to each groomer's bank.

---

## Phase 1 — Stripe Connect Foundation

**Goal:** every groomer can link their own Stripe account so they can receive client payments.

- [ ] Enable Stripe Connect (Express) in Stripe dashboard
- [ ] Database migration:
  - [ ] Add `stripe_connect_account_id` to `groomers`
  - [ ] Add `stripe_customer_id` to `clients`
- [ ] Build "Connect Your Stripe Account" onboarding page in Shop Settings
- [ ] Stripe onboarding flow (bank verification, ID, etc.)
- [ ] Configure daily payouts as default
- [ ] Test full onboarding end-to-end with my own account

**What Nicole does:** Run through the Stripe Connect onboarding herself first to verify it works, then verify Pampered Little Paws can receive a test payment.

---

## Phase 2 — Save Cards on File

**Goal:** clients can add credit cards in their portal and store them securely with Stripe.

- [ ] Build "My Cards" page in client portal
- [ ] Add new card flow (Stripe Payment Element)
- [ ] Remove card flow
- [ ] Default card selection
- [ ] All card data stored on Stripe — never in PetPro database

**Security note:** PCI compliance handled entirely by Stripe (we never see the card number).

---

## Phase 3 — "Pay Now" on Appointments (Client Portal)

**Goal:** clients can pay for an upcoming or current appointment from the portal.

- [ ] Pay Now button on appointment card in client portal
- [ ] Tip selector: 10% / 15% / 25% / Custom
- [ ] Pay with NEW card or SAVED card
- [ ] Receipt emailed automatically via Resend after success
- [ ] Money lands in groomer's Stripe Connect account
- [ ] Payment row written to `payments` table with `stripe_payment_intent_id`
- [ ] Update appointment balance in real time

---

## Phase 4 — Groomer-Side Integration

**Goal:** the groomer (Nicole) sees Stripe payments alongside Cash/Zelle/Venmo and can manage them.

- [ ] Stripe payments show in payment history with their method labeled "Card"
- [ ] On the appointment Take Payment modal, add option to charge a client's saved card (no chasing for Zelle)
- [ ] Refund button for Stripe charges (full or partial refund)
- [ ] Daily payout summary widget on Dashboard
- [ ] "Pending Payouts" / "Paid Out Today" totals

---

## Phase 5 — Per-Shop Payment Settings

**Goal:** each groomer customizes how payments work for their shop.

### Toggles

- [ ] **Require pre-payment to book** (boolean) — clients must pay card before booking is confirmed
- [ ] **No-show fee** (decimal amount) — auto-charge if appointment marked no-show
- [ ] **Pass card fees to client** (boolean — MoeGo style) — adds the Stripe ~3% fee onto the client's bill so groomer keeps 100% of the price

### Why the "Pass fees to client" toggle matters

Working in this field there are two types of groomers:

- **Type A — Loves their clients.** Will absorb the Stripe fee themselves and just bake it into their pricing or count it as a tax write-off. Wants the client experience to feel clean — no surprise fees at checkout.
- **Type B — In it for the margins.** Doesn't want to lose 3% on every charge. Wants client to pay the fee.

PetPro caters to both with one toggle. Default off (groomer absorbs) — but Type B groomers can flip it on per shop.

### Implementation

- [ ] Per-groomer setting: `require_prepay_to_book` (boolean, default false)
- [ ] Per-groomer setting: `no_show_fee_amount` (decimal, default 0)
- [ ] Per-groomer setting: `pass_fees_to_client` (boolean, default false)
- [ ] Booking flow: if pre-pay required, charge card before confirming booking
- [ ] No-show flow: auto-charge fee on no-show status change
- [ ] Pay flow: if `pass_fees_to_client` true → add 3% on top of total at checkout, show "Service: $100 / Card fee: $3.20 / Total: $103.20"
- [ ] All three toggles surfaced in Shop Settings → Payments section

---

## Phase 6 — Boarding Parity

**Goal:** apply the same payment flow to boarding so clients can pay for stays the same way.

- [ ] Pay Now button on boarding stay in client portal
- [ ] Tipping on boarding stays
- [ ] Saved cards work on boarding
- [ ] Refund flow on boarding payments
- [ ] Daycare + training inherit this system when built later

---

## Decisions Locked In

- **Stripe Connect type:** Express (simpler onboarding, PetPro hosts dashboard)
- **Payouts:** Daily for client payments, weekly Mondays for PetPro subscription
- **Tipping presets:** 10% / 15% / 25% / Custom
- **Card on file:** Yes, save with client permission
- **Pre-pay required:** Optional per groomer (default OFF)
- **No-show fee:** Optional per groomer (default OFF)
- **Pass card fees to client (MoeGo style):** Optional per groomer (default OFF) — caters to both client-first groomers and margin-focused groomers
- **Scope:** Grooming + Boarding now. Daycare + Training in 6 months.

---

## Pre-Work Before Phase 1 Build

1. Log into Stripe dashboard → check if **Connect** appears in left sidebar
2. If yes → enable Express
3. If not → tell Claude, may need to apply for Connect access first
4. Send screenshot of the Stripe dashboard so Claude can confirm setup

---

## Status Log

- Created: 2026-04-28
- Owner: Nicole
- Build partner: Claude
- Current phase: **Phase 1 — pending Nicole's Stripe Connect check**
