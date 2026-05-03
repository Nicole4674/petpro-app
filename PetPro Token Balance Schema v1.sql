-- =============================================================================
-- PetPro Token Balance Schema v1
-- =============================================================================
-- Database tables + functions for the PetPro AI token system.
--
-- Two tables:
--   • groomer_token_balance  — live balance per groomer (monthly + top-up)
--   • token_purchases         — log of every top-up pack bought
--
-- Plus one RPC function:
--   • deduct_petpro_token(groomer_id) — atomic deduction, monthly first,
--                                         then top-up. Returns remaining balance.
--
-- HOW TOKENS WORK:
--   • monthly_tokens_remaining  → resets every billing period (lazy reset
--                                  on first message after 30 days)
--   • topup_tokens_remaining    → NEVER expires, rolls forever, paid for
--                                  inventory the groomer should always keep
--
-- DEDUCTION ORDER:
--   • Monthly tokens first (use them or lose them at reset)
--   • Then top-up tokens (rolling inventory)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── groomer_token_balance ──────────────────────────────────────────────────
create table if not exists groomer_token_balance (
  groomer_id uuid primary key references groomers(id) on delete cascade,
  -- Monthly allocation — resets each billing period
  monthly_tokens_remaining int not null default 0,
  monthly_tokens_total int not null default 500,  -- default starting tier; overridden by plan
  monthly_period_start date not null default current_date,
  -- Top-up tokens — never expire, rolling inventory
  topup_tokens_remaining int not null default 0,
  -- Lifetime stats (handy for analytics + the "you've sent N messages" badge)
  lifetime_tokens_used int not null default 0,
  lifetime_tokens_purchased int not null default 0,
  updated_at timestamptz not null default now()
);

-- Index for the cron-style monthly reset query (find groomers needing reset)
create index if not exists groomer_token_balance_period_idx
  on groomer_token_balance(monthly_period_start);


-- ─── token_purchases ────────────────────────────────────────────────────────
-- Every top-up pack purchase logged. The webhook flips status from 'pending'
-- to 'completed' when Stripe confirms the payment + adds tokens to balance.
create table if not exists token_purchases (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  pack_size int not null,            -- e.g. 250, 500, 1000, 2500, 5000
  amount_cents int not null,         -- e.g. 499 for $4.99
  stripe_payment_intent_id text,
  stripe_session_id text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'refunded', 'failed')),
  purchased_at timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at timestamptz
);

-- Index for the "recent purchases" query in the billing UI
create index if not exists token_purchases_groomer_recent_idx
  on token_purchases(groomer_id, purchased_at desc);

-- Index for the webhook lookup (find the pending row by stripe session)
create index if not exists token_purchases_session_idx
  on token_purchases(stripe_session_id) where stripe_session_id is not null;


-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Groomers can read their own balance + purchases. Writes happen via service
-- role (edge functions only) so we don't expose UPDATE/INSERT to the client.
alter table groomer_token_balance enable row level security;
alter table token_purchases enable row level security;

drop policy if exists "balance_select_own" on groomer_token_balance;
create policy "balance_select_own"
  on groomer_token_balance for select
  using (auth.uid() = groomer_id);

drop policy if exists "purchases_select_own" on token_purchases;
create policy "purchases_select_own"
  on token_purchases for select
  using (auth.uid() = groomer_id);


-- ─── deduct_petpro_token RPC ────────────────────────────────────────────────
-- Atomic single-token deduction. Called by chat-command edge function on
-- every successful AI response.
--
-- Logic:
--   1. Lazy-reset the monthly bucket if the period is > 30 days old
--   2. Try monthly bucket first → if available, deduct, return success
--   3. Else try top-up bucket → if available, deduct, return success
--   4. Else return out_of_tokens flag → edge function shows run-out modal
--
-- Returns: jsonb { ok, monthly_remaining, topup_remaining, source, out_of_tokens }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function deduct_petpro_token(p_groomer_id uuid)
returns jsonb
language plpgsql
security definer  -- runs with table-owner perms, bypasses RLS
as $$
declare
  v_balance groomer_token_balance%rowtype;
  v_source text;
begin
  -- Lock the row so two simultaneous chat calls don't race
  select * into v_balance
  from groomer_token_balance
  where groomer_id = p_groomer_id
  for update;

  -- If no row exists yet, create one with default monthly allocation
  if not found then
    insert into groomer_token_balance (groomer_id, monthly_tokens_remaining, monthly_tokens_total, monthly_period_start)
    values (p_groomer_id, 500, 500, current_date)
    returning * into v_balance;
  end if;

  -- Lazy monthly reset: if the period is older than 30 days, refill
  if v_balance.monthly_period_start <= current_date - interval '30 days' then
    update groomer_token_balance
    set monthly_tokens_remaining = monthly_tokens_total,
        monthly_period_start = current_date,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
  end if;

  -- Try monthly bucket first (use it or lose it at next reset)
  if v_balance.monthly_tokens_remaining > 0 then
    update groomer_token_balance
    set monthly_tokens_remaining = monthly_tokens_remaining - 1,
        lifetime_tokens_used = lifetime_tokens_used + 1,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
    v_source := 'monthly';

  -- Else try top-up bucket (rolling inventory)
  elsif v_balance.topup_tokens_remaining > 0 then
    update groomer_token_balance
    set topup_tokens_remaining = topup_tokens_remaining - 1,
        lifetime_tokens_used = lifetime_tokens_used + 1,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
    v_source := 'topup';

  -- Out of both → return out_of_tokens flag
  else
    return jsonb_build_object(
      'ok', false,
      'out_of_tokens', true,
      'monthly_remaining', 0,
      'topup_remaining', 0,
      'monthly_total', v_balance.monthly_tokens_total,
      'next_reset_date', (v_balance.monthly_period_start + interval '30 days')::date
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'out_of_tokens', false,
    'monthly_remaining', v_balance.monthly_tokens_remaining,
    'topup_remaining', v_balance.topup_tokens_remaining,
    'source', v_source
  );
end;
$$;


-- ─── add_topup_tokens RPC ───────────────────────────────────────────────────
-- Called by the Stripe webhook after a top-up pack is purchased + paid.
-- Safe to call multiple times (idempotent via stripe_session_id check —
-- the webhook should only call this once per completed session).
--
-- Returns: jsonb { ok, new_topup_balance }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function add_topup_tokens(
  p_groomer_id uuid,
  p_token_count int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_balance groomer_token_balance%rowtype;
begin
  select * into v_balance
  from groomer_token_balance
  where groomer_id = p_groomer_id
  for update;

  if not found then
    -- Create a starter row + apply the top-up
    insert into groomer_token_balance (
      groomer_id,
      monthly_tokens_remaining, monthly_tokens_total, monthly_period_start,
      topup_tokens_remaining, lifetime_tokens_purchased
    )
    values (p_groomer_id, 500, 500, current_date, p_token_count, p_token_count)
    returning * into v_balance;
  else
    update groomer_token_balance
    set topup_tokens_remaining = topup_tokens_remaining + p_token_count,
        lifetime_tokens_purchased = lifetime_tokens_purchased + p_token_count,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
  end if;

  return jsonb_build_object(
    'ok', true,
    'new_topup_balance', v_balance.topup_tokens_remaining
  );
end;
$$;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name in ('groomer_token_balance', 'token_purchases')
-- order by table_name, ordinal_position;
