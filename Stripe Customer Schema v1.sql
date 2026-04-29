-- =============================================================================
-- Stripe Customer Schema v1
-- =============================================================================
-- Adds the column we need on the clients table to track each client's
-- Stripe Customer ID. This is set the first time the client adds a card
-- through the client portal — and used every time they pay (or get
-- charged for a no-show, pre-payment, etc.) after that.
--
-- Important: with Stripe Connect (direct charges), each client's
-- Customer record lives on their GROOMER'S connected account — not on
-- PetPro's platform account. So this stripe_customer_id is scoped to
-- the groomer that the client belongs to. Same human can be a customer
-- at two different groomers and have two different stripe_customer_ids
-- in two separate clients rows.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Stripe Customer ID column on clients table
alter table clients
  add column if not exists stripe_customer_id text;


-- 2. Index for fast lookups by customer ID. We don't query by this often
--    on the app side (we mostly look up by client.id), but Stripe webhook
--    handlers occasionally need to find a client by customer_id and an
--    index speeds that up.
create index if not exists idx_clients_stripe_customer_id
  on clients(stripe_customer_id)
  where stripe_customer_id is not null;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'clients' and column_name = 'stripe_customer_id';
