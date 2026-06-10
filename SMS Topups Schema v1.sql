-- =============================================================================
-- SMS Top-ups Schema v1
-- =============================================================================
-- One-time SMS credit purchases: $10 → +500 texts, added to the groomer's
-- remaining balance immediately. The anti-MoeGo move — no $100/mo SMS add-on
-- subscription trap, just a one-time top-up when you run dry.
--
-- Money goes to PETPRO (platform Stripe account), not the groomer's Connect.
--
-- One row per purchase. stripe_session_id is unique → the confirm step is
-- IDEMPOTENT (refresh/double-redirect can't grant credits twice).
--
-- Note: top-ups add to monthly_sms_remaining only. The monthly refill resets
-- remaining to the TIER total at the start of each month — top-ups are for
-- finishing out the current month, which is exactly when groomers need them.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

create table if not exists sms_topups (
  id                uuid primary key default gen_random_uuid(),
  groomer_id        uuid not null references auth.users(id) on delete cascade,
  sms_amount        int not null,
  price_paid        numeric not null,
  stripe_session_id text not null,
  created_at        timestamptz not null default now()
);

create unique index if not exists idx_sms_topups_session
  on sms_topups (stripe_session_id);

create index if not exists idx_sms_topups_groomer
  on sms_topups (groomer_id, created_at desc);

alter table sms_topups enable row level security;

drop policy if exists "Groomers read own topups" on sms_topups;
create policy "Groomers read own topups"
  on sms_topups
  for select
  to authenticated
  using (groomer_id = auth.uid());

-- INSERTs happen via service_role (confirm-sms-topup edge function) only.
