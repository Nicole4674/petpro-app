-- =============================================================================
-- Stripe Refund Schema v1
-- =============================================================================
-- Adds the columns we need on the payments table to track refunds. When a
-- groomer hits "Refund" on a Stripe-paid charge:
--   1. We call Stripe's refund API
--   2. Stripe returns a refund ID + the amount refunded
--   3. We update the payment row with refunded_amount + stripe_refund_id
--      so the UI can show "Refunded $X" instead of the original "Paid $X"
--
-- Columns:
--   • refunded_amount      → how much was refunded (supports partial refunds)
--   • refunded_at          → timestamp of the refund
--   • stripe_refund_id     → Stripe's refund ID (for audit + retries)
--
-- All columns are NULL by default — only set when a refund happens.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Refunded amount column. NULL = not refunded. Non-zero = partial or full refund.
alter table payments
  add column if not exists refunded_amount numeric(10, 2);


-- 2. When the refund happened. NULL = not refunded.
alter table payments
  add column if not exists refunded_at timestamptz;


-- 3. Stripe's refund ID. Lets us reference the refund on Stripe's side
--    for support, disputes, or retries.
alter table payments
  add column if not exists stripe_refund_id text;


-- 4. Index on stripe_refund_id so webhook lookups are fast (Stripe sends
--    refund.updated events that we may handle later).
create index if not exists idx_payments_stripe_refund_id
  on payments(stripe_refund_id)
  where stripe_refund_id is not null;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'payments'
--   and column_name in ('refunded_amount', 'refunded_at', 'stripe_refund_id')
-- order by column_name;
