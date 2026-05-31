-- =============================================================================
-- Groomer Referral Schema v1  (PetPro app growth — groomer→groomer, handoff #86)
-- =============================================================================
-- Model: each PetPro groomer has 1 referral credit per MONTH ("1/1").
--   • They share their personal code/link.
--   • A referred groomer signs up + pays their first bill → BOTH get 30% off
--     that billing month.
--   • The "1 per month" cap is DERIVED from this table (a referral row dated in
--     the current calendar month = credit used). No refill cron needed — it
--     naturally resets when the month changes.
--
-- This schema is the FOUNDATION only. The Stripe reward automation (applying the
-- 30% coupon when the referred groomer pays) is a separate later step.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → paste → Run.
-- Safe to re-run (uses "if not exists").
-- =============================================================================

-- 1. One permanent referral code per groomer ---------------------------------
create table if not exists groomer_referral_codes (
  groomer_id  uuid primary key references groomers(id) on delete cascade,
  code        text unique not null,
  created_at  timestamptz not null default now()
);

-- 2. Each referral event (one row per person they refer) ----------------------
create table if not exists groomer_referrals (
  id                   uuid primary key default gen_random_uuid(),
  referrer_groomer_id  uuid not null references groomers(id) on delete cascade,
  referred_groomer_id  uuid references groomers(id) on delete set null,
  code                 text not null,
  -- pending_signup: link clicked / shared, no paid account yet
  -- signed_up:      referred groomer created an account (not paid yet)
  -- rewarded:       referred groomer paid first bill → 30% applied to both
  -- expired/void:   never converted / reversed
  status               text not null default 'pending_signup'
    check (status in ('pending_signup','signed_up','rewarded','expired','void')),
  reward_month         date,        -- billing month the 30% applies to
  referrer_rewarded    boolean not null default false,
  referred_rewarded    boolean not null default false,
  created_at           timestamptz not null default now(),
  signed_up_at         timestamptz,
  rewarded_at          timestamptz
);

create index if not exists idx_groomer_referrals_referrer on groomer_referrals(referrer_groomer_id);
create index if not exists idx_groomer_referrals_referred on groomer_referrals(referred_groomer_id);
create index if not exists idx_groomer_referrals_code     on groomer_referrals(code);

-- 3. Stamp who referred a groomer at signup (handy for attribution) -----------
alter table groomers
  add column if not exists referred_by_code text;

-- 4. Row Level Security -------------------------------------------------------
-- groomers.id == auth.uid(), so a groomer can read their own code + the
-- referrals they made. Writes happen via edge functions (service role), which
-- bypasses RLS — so we only need read policies here.
alter table groomer_referral_codes enable row level security;
alter table groomer_referrals       enable row level security;

drop policy if exists "groomer reads own referral code" on groomer_referral_codes;
create policy "groomer reads own referral code"
  on groomer_referral_codes for select
  using (groomer_id = auth.uid());

drop policy if exists "groomer reads own referrals" on groomer_referrals;
create policy "groomer reads own referrals"
  on groomer_referrals for select
  using (referrer_groomer_id = auth.uid());

-- =============================================================================
-- Verify:
--   select * from groomer_referral_codes limit 5;
--   select * from groomer_referrals limit 5;
-- =============================================================================
