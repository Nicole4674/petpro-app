-- =============================================================================
-- Punch Cards Schema v1
-- =============================================================================
-- One-time prepaid packages: "Buy 5 baths, get 1 free." Client pays once
-- (online via portal, or at the counter — cash/Zelle/card recorded manually),
-- gets N punches. At checkout, when the service matches, the Take Payment
-- popup suggests "Use punch 3 of 6?" — one tap applies it.
--
-- Three tables:
--   punch_card_types — what the groomer SELLS ("6 Baths for $150")
--   punch_cards      — what a client OWNS (6 punches, 4 left, expires...)
--   punch_card_uses  — history: which punch covered which appointment
--
-- Expiration: per-type optional (expires_months). Blank = never expires —
-- some states restrict expiry on prepaid services, so never-expire is the
-- safe default.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

-- ─── What the groomer sells ───
create table if not exists punch_card_types (
  id              uuid primary key default gen_random_uuid(),
  groomer_id      uuid not null references auth.users(id) on delete cascade,
  name            text not null,            -- "6 Baths — pay for 5!"
  description     text,                     -- optional sales pitch for portal
  service_ids     uuid[] not null default '{}',  -- services a punch covers
  total_punches   int not null check (total_punches > 0),
  price           numeric not null check (price >= 0),
  expires_months  int,                      -- null = never expires
  is_active       boolean not null default true,
  -- Stripe Connect product/price for portal purchases (pass 2 — null until
  -- the type is synced to Stripe; in-person sales never need these)
  stripe_product_id text,
  stripe_price_id   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_punch_card_types_groomer
  on punch_card_types (groomer_id);

alter table punch_card_types enable row level security;

drop policy if exists "Groomers manage own punch card types" on punch_card_types;
create policy "Groomers manage own punch card types"
  on punch_card_types
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

-- Portal clients can see their groomer's active types (to buy one)
drop policy if exists "Clients read active punch card types" on punch_card_types;
create policy "Clients read active punch card types"
  on punch_card_types
  for select
  to authenticated
  using (
    is_active = true
    and groomer_id in (select groomer_id from clients where user_id = auth.uid())
  );

-- ─── What a client owns ───
create table if not exists punch_cards (
  id                uuid primary key default gen_random_uuid(),
  groomer_id        uuid not null references auth.users(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  type_id           uuid references punch_card_types(id) on delete set null,
  -- Snapshots — so editing/deleting the type never corrupts sold cards
  name              text not null,
  service_ids       uuid[] not null default '{}',
  total_punches     int not null,
  punches_remaining int not null,
  price_paid        numeric not null default 0,
  payment_method    text not null default 'in_person',  -- 'stripe' | 'cash' | 'zelle' | 'venmo' | 'card' | 'in_person' | 'comp'
  purchased_at      timestamptz not null default now(),
  expires_at        date,                  -- null = never
  status            text not null default 'active'
                    check (status in ('active', 'used_up', 'expired', 'refunded')),
  created_at        timestamptz not null default now()
);

create index if not exists idx_punch_cards_client on punch_cards (client_id);
create index if not exists idx_punch_cards_groomer on punch_cards (groomer_id);

alter table punch_cards enable row level security;

drop policy if exists "Groomers manage own punch cards" on punch_cards;
create policy "Groomers manage own punch cards"
  on punch_cards
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

-- Clients can see THEIR OWN cards in the portal ("4 of 6 punches left")
drop policy if exists "Clients read own punch cards" on punch_cards;
create policy "Clients read own punch cards"
  on punch_cards
  for select
  to authenticated
  using (client_id in (select id from clients where user_id = auth.uid()));

-- ─── Usage history ───
create table if not exists punch_card_uses (
  id             uuid primary key default gen_random_uuid(),
  punch_card_id  uuid not null references punch_cards(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  groomer_id     uuid not null references auth.users(id) on delete cascade,
  service_name   text,                    -- snapshot for history display
  used_at        timestamptz not null default now()
);

create index if not exists idx_punch_card_uses_card on punch_card_uses (punch_card_id);

alter table punch_card_uses enable row level security;

drop policy if exists "Groomers manage own punch uses" on punch_card_uses;
create policy "Groomers manage own punch uses"
  on punch_card_uses
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Clients read own punch uses" on punch_card_uses;
create policy "Clients read own punch uses"
  on punch_card_uses
  for select
  to authenticated
  using (
    punch_card_id in (
      select pc.id from punch_cards pc
      join clients c on c.id = pc.client_id
      where c.user_id = auth.uid()
    )
  );
