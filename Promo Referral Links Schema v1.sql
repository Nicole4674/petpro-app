-- =============================================================================
-- Promo / Referral Links Schema v1
-- =============================================================================
-- Groomer creates a promo ("Free nail filing for new clients"). Every client
-- sees a share link in their portal. Friend clicks → signs up → books through
-- Suds → reward auto-applies. Referrer optionally earns their own reward
-- (groomer decides per promo — nobody gets boxed in).
--
-- Tables/columns:
--   promos                        — one row per promo offer
--   clients.promo_code            — code the client signed up with (null = none)
--   clients.referred_by_client_id — which existing client shared the link
--   clients.promo_redeemed_at     — stamped when the reward gets applied to a
--                                   booking (null = signed up but not used yet)
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

create table if not exists promos (
  id                 uuid primary key default gen_random_uuid(),
  groomer_id         uuid not null references auth.users(id) on delete cascade,
  name               text not null,                -- internal label ("Spring referral")
  code               text not null,                -- goes in the share link (SPRING24)
  -- What the NEW CLIENT gets — groomer's own words ("Free nail filing!")
  new_client_reward  text not null,
  -- Optional auto-discount math so Suds can apply real $ at booking.
  -- 'none' = reward is a freebie/add-on, no price change (groomer honors it).
  discount_type      text not null default 'none'
                     check (discount_type in ('none', 'amount', 'percent')),
  discount_value     numeric not null default 0,
  -- Eligibility + referrer reward — per-promo choices
  new_clients_only   boolean not null default true,
  reward_referrer    boolean not null default false,
  referrer_reward    text,                         -- "$5 off your next groom"
  is_active          boolean not null default true,
  expires_at         date,                         -- null = never expires
  max_uses           int,                          -- null = unlimited
  use_count          int not null default 0,
  created_at         timestamptz not null default now()
);

-- A groomer can't reuse the same code twice (codes are per-groomer, so two
-- different shops CAN both have "SPRING24")
create unique index if not exists idx_promos_groomer_code
  on promos (groomer_id, code);

alter table promos enable row level security;

-- Groomers manage their own promos
drop policy if exists "Groomers manage own promos" on promos;
create policy "Groomers manage own promos"
  on promos
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

-- Portal clients can READ their groomer's active promos (to build share links)
drop policy if exists "Clients read their groomer's active promos" on promos;
create policy "Clients read their groomer's active promos"
  on promos
  for select
  to authenticated
  using (
    is_active = true
    and groomer_id in (select groomer_id from clients where user_id = auth.uid())
  );

-- ─── Client columns ───
alter table clients add column if not exists promo_code text;
alter table clients add column if not exists referred_by_client_id uuid;
alter table clients add column if not exists promo_redeemed_at timestamptz;
