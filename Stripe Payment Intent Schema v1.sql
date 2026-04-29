-- =============================================================================
-- Stripe Payment Intent Schema v1
-- =============================================================================
-- Adds the column we need to link payment rows to actual Stripe charges.
-- When a client pays through the portal via Stripe Connect, we record the
-- payment in our payments table AND store Stripe's PaymentIntent ID so we
-- can:
--   • Tell apart manual card entries (groomer typed "Card" + amount) vs
--     real Stripe-processed charges
--   • Refund through Stripe API later (need the payment_intent_id to refund)
--   • Look up payment status on Stripe's side for debugging or disputes
--   • Reconcile our DB with Stripe records during audits
--
-- This column is NULL for cash/Zelle/Venmo/manual-card payments — only set
-- when Stripe actually processed the charge.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Add the new column
alter table payments
  add column if not exists stripe_payment_intent_id text;


-- 2. Index for fast lookups by payment intent ID. Used when:
--   • Stripe webhook fires for a payment update — we look up which
--     payment row it belongs to
--   • Refund flow — we need to find the original payment row by its
--     PaymentIntent ID
create index if not exists idx_payments_stripe_payment_intent_id
  on payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'payments' and column_name = 'stripe_payment_intent_id';
