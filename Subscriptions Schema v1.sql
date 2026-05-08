-- =============================================================================
-- Subscriptions Schema v1 — Custom client subscription plans
-- =============================================================================
-- Lets each groomer create their own subscription products (e.g. "$30/mo
-- unlimited nail trims") that clients can sign up for via Stripe Connect.
-- This is the schema for the WHOLE feature — Phase 1 only writes to
-- subscription_plans. Phases 2-4 will use client_subscriptions + usage.
--
-- Designed to support multiple plan types from day one (no future migrations):
--   • Service-based  — covers specific services unlimited or capped
--   • Discount-based — % off everything
--   • Bundle         — N of service A + M of service B per period
--   • Frequency      — auto-books a recurring appointment
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- =============================================================================


-- ─── Table: subscription_plans (groomer creates these) ─────────────────────
create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references auth.users(id) on delete cascade,
  -- Display
  name text not null,                                  -- "Nail Trim Club"
  description text,                                    -- shown to clients
  emoji text default '🐾',                              -- visual flavor
  -- Pricing
  price_cents integer not null check (price_cents >= 0),  -- $30.00 = 3000
  billing_interval text not null default 'month'
    check (billing_interval in ('week', 'month', 'year')),
  -- What's covered (one or both can be set)
  covered_service_ids uuid[] default '{}',             -- specific services (empty = all)
  -- Usage cap: { service_id_str: max_per_period } e.g. { "abc-123": 4 } = 4 nail trims/mo
  -- Use null/empty for "unlimited"
  usage_caps jsonb default '{}',
  -- Optional discount mode (alternative to coverage)
  discount_pct integer check (discount_pct >= 0 and discount_pct <= 100),
  -- Optional auto-book frequency (alternative to coverage)
  auto_book_interval_weeks integer check (auto_book_interval_weeks > 0),
  -- Stripe link (created via edge function on the groomer's Connect account)
  stripe_product_id text,
  stripe_price_id text,
  -- State
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_plans_groomer_active
  on subscription_plans (groomer_id, active);


-- ─── Table: client_subscriptions (client subscribes to a plan) ─────────────
-- Phase 2 writes to this when a client signs up + when Stripe webhooks fire.
create table if not exists client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id) on delete restrict,
  -- Stripe linkage on the groomer's Connect account
  stripe_subscription_id text,
  stripe_customer_id text,
  -- Lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'paused', 'canceled', 'incomplete')),
  -- Billing window — used for usage cap reset each period
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_subscriptions_client
  on client_subscriptions (client_id, status);
create index if not exists idx_client_subscriptions_groomer_active
  on client_subscriptions (groomer_id, status)
  where status = 'active';


-- ─── Table: subscription_usage (Phase 3 — track per-period usage) ──────────
-- One row per appointment that was covered by a subscription. Lets us
-- count "Bella has used 3 of 4 nail trims this month" + show history.
create table if not exists subscription_usage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references client_subscriptions(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- For reporting later
  used_at timestamptz not null default now(),
  notes text
);

create index if not exists idx_subscription_usage_lookup
  on subscription_usage (subscription_id, period_start);


-- ─── RLS policies ──────────────────────────────────────────────────────────
alter table subscription_plans enable row level security;
alter table client_subscriptions enable row level security;
alter table subscription_usage enable row level security;

-- subscription_plans: groomer reads/writes their own; clients read active plans of their groomer
drop policy if exists "Groomers manage their own plans" on subscription_plans;
create policy "Groomers manage their own plans"
  on subscription_plans
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Clients see active plans of their groomer" on subscription_plans;
create policy "Clients see active plans of their groomer"
  on subscription_plans
  for select
  to authenticated
  using (
    active = true
    and groomer_id in (select groomer_id from clients where user_id = auth.uid())
  );

-- client_subscriptions: groomer sees their shop's; client sees their own
drop policy if exists "Groomers see their shop subscriptions" on client_subscriptions;
create policy "Groomers see their shop subscriptions"
  on client_subscriptions
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Clients see their own subscriptions" on client_subscriptions;
create policy "Clients see their own subscriptions"
  on client_subscriptions
  for select
  to authenticated
  using (client_id in (select id from clients where user_id = auth.uid()));

-- subscription_usage: groomer reads their shop's; clients read their own
drop policy if exists "Groomers see usage on their subs" on subscription_usage;
create policy "Groomers see usage on their subs"
  on subscription_usage
  for select
  to authenticated
  using (subscription_id in (select id from client_subscriptions where groomer_id = auth.uid()));

drop policy if exists "Clients see their own usage" on subscription_usage;
create policy "Clients see their own usage"
  on subscription_usage
  for select
  to authenticated
  using (
    subscription_id in (
      select cs.id
      from client_subscriptions cs
      join clients c on c.id = cs.client_id
      where c.user_id = auth.uid()
    )
  );


-- ─── Auto-update updated_at on plans + subscriptions ───────────────────────
create or replace function public.update_subscription_timestamp()
  returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_subscription_plans_updated on subscription_plans;
create trigger trg_subscription_plans_updated
  before update on subscription_plans
  for each row execute function public.update_subscription_timestamp();

drop trigger if exists trg_client_subscriptions_updated on client_subscriptions;
create trigger trg_client_subscriptions_updated
  before update on client_subscriptions
  for each row execute function public.update_subscription_timestamp();


-- =============================================================================
-- VERIFY
-- =============================================================================
-- select count(*) from subscription_plans;        -- 0
-- select count(*) from client_subscriptions;       -- 0
-- select count(*) from subscription_usage;         -- 0
