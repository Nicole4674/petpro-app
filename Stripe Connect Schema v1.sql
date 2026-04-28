-- =============================================================================
-- Stripe Connect Schema v1
-- =============================================================================
-- Adds the columns we need on the groomers table to track each shop's
-- Stripe Connect onboarding state. This is the "client payments" Stripe
-- (separate from the subscription Stripe that bills groomers monthly).
--
-- After this runs, each groomer gets 4 new columns:
--   • stripe_connect_account_id     → Stripe's ID once they link, e.g. acct_1ABC...
--   • stripe_connect_status         → text: 'not_started' | 'pending' | 'enabled' | 'restricted'
--   • stripe_connect_charges_enabled → can they accept card payments yet? (true/false)
--   • stripe_connect_payouts_enabled → can Stripe send money to their bank yet? (true/false)
--
-- The PetPro app reads these columns to decide what to show in Shop Settings:
--   • not_started  → "Connect Stripe Account" button
--   • pending      → "Verification in progress... finish onboarding" link
--   • enabled      → "Connected ✓ Daily payouts to ****1234" + Manage button
--   • restricted   → "Action required by Stripe — click to fix"
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Stripe Connect account ID — set once the groomer creates their account
alter table groomers
  add column if not exists stripe_connect_account_id text;


-- 2. Onboarding status — drives the UI state in Shop Settings
alter table groomers
  add column if not exists stripe_connect_status text
    default 'not_started'
    check (stripe_connect_status in ('not_started', 'pending', 'enabled', 'restricted'));


-- 3. Can they accept charges? Stripe sets this true after KYC verification
alter table groomers
  add column if not exists stripe_connect_charges_enabled boolean
    default false;


-- 4. Can they receive payouts? Stripe sets this true after bank account is verified
alter table groomers
  add column if not exists stripe_connect_payouts_enabled boolean
    default false;


-- 5. Index on stripe_connect_account_id so webhook lookups are fast.
--    When Stripe sends us an "account.updated" event, we look up the
--    groomer by their account_id to update their status.
create index if not exists idx_groomers_stripe_connect_account_id
  on groomers(stripe_connect_account_id)
  where stripe_connect_account_id is not null;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'groomers'
--   and column_name like 'stripe_connect_%'
-- order by column_name;
