-- =============================================================================
-- Add Subscription Tier Columns v1
-- =============================================================================
-- Purpose: Add Stripe subscription tracking columns to the groomers table so
--          the app knows which tier each user is on, whether they're in trial,
--          and when their billing period ends.
--
-- Task: #90 - Add subscription_tier column to groomers/users table
-- Date: April 22, 2026
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query → paste → Run
-- =============================================================================

-- Add the 6 subscription columns to the groomers table
alter table groomers
  add column if not exists subscription_tier text,
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz;


-- Add CHECK constraints so bad values can't sneak in

-- subscription_tier can only be one of these 5 values (or NULL for no subscription)
alter table groomers
  drop constraint if exists groomers_subscription_tier_check;

alter table groomers
  add constraint groomers_subscription_tier_check
  check (subscription_tier is null or subscription_tier in (
    'basic',
    'pro',
    'pro_plus',
    'growing',
    'enterprise'
  ));


-- subscription_status can only be one of Stripe's standard statuses (or NULL)
alter table groomers
  drop constraint if exists groomers_subscription_status_check;

alter table groomers
  add constraint groomers_subscription_status_check
  check (subscription_status is null or subscription_status in (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired'
  ));


-- Add an index on stripe_customer_id so webhook lookups are fast
create index if not exists idx_groomers_stripe_customer_id
  on groomers(stripe_customer_id);

create index if not exists idx_groomers_stripe_subscription_id
  on groomers(stripe_subscription_id);


-- =============================================================================
-- Verify: run this to see all 6 new columns on a sample groomer row
-- =============================================================================
-- select
--   id,
--   full_name,
--   subscription_tier,
--   subscription_status,
--   stripe_customer_id,
--   stripe_subscription_id,
--   trial_ends_at,
--   current_period_end
-- from groomers
-- limit 1;
