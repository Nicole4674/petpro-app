-- =============================================================================
-- SMS Quota System Schema v1
-- =============================================================================
-- Per-groomer monthly SMS quota tracking — mirrors the AI token system.
-- Lets PetPro gate SMS sends so we cover Twilio costs at each tier.
--
-- Tier allocations (set by Stripe webhook on subscription sync):
--   basic    ($70):       0 SMS / month  (NO SMS — upgrade prompt only)
--   pro      ($129):  1,000 SMS / month
--   pro_plus ($199):  1,500 SMS / month
--   growing  ($399):  3,000 SMS / month
--
-- Basic tier intentionally has NO SMS — it's an upgrade incentive ("want to
-- text clients? upgrade to Pro"). Keeps Basic tier profitable + cost-predictable.
--
-- All tiers include a Stripe-handled free trial — trial users get the SAME
-- allocation as their tier, so no separate "trial" entry needed.
--
-- These are conservative starting numbers — easy to bump up later if real
-- usage shows we're being too tight. Adjust by editing sync_sms_allocation_for_tier
-- and re-running the backfill (or letting the next subscription sync update them).
--
-- Founders promo: founder_unlimited_sms = true → unlimited (no deduction).
-- Toggle this manually in Supabase for first 2 customers.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── Table: groomer_sms_balance ───
-- One row per groomer. Tracks monthly SMS remaining + the period start so
-- the system knows when to refill. Mirrors groomer_token_balance.

create table if not exists groomer_sms_balance (
  groomer_id uuid primary key references auth.users(id) on delete cascade,
  monthly_sms_total int not null default 0,
  monthly_sms_remaining int not null default 0,
  monthly_period_start date not null default current_date,
  founder_unlimited_sms boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups (PK already covers this, but explicit is fine)
create index if not exists idx_groomer_sms_balance_period
  on groomer_sms_balance (monthly_period_start);


-- ─── RLS — groomers can only read/edit their own balance ───
alter table groomer_sms_balance enable row level security;

drop policy if exists "Groomers read their own SMS balance" on groomer_sms_balance;
create policy "Groomers read their own SMS balance"
  on groomer_sms_balance
  for select
  to authenticated
  using (groomer_id = auth.uid());

-- INSERT/UPDATE only via service_role (edge functions). No direct client writes.


-- =============================================================================
-- Helper: deduct_sms_quota
-- =============================================================================
-- Atomic deduction with automatic monthly refill check + founder bypass.
--
-- Called from the send-sms edge function before each Twilio send.
--
-- Returns a JSON object:
--   { ok: true,  remaining: 1499, total: 1500, source: 'monthly' }
--   { ok: true,  remaining: -1,   total: -1,   source: 'founder_unlimited' }
--   { ok: false, remaining: 0,    total: 1500, reason: 'Out of SMS for this month' }
--
-- Logic:
--   1. If founder_unlimited_sms = true → return ok, no deduction
--   2. If balance row missing → create with 0 (groomer hasn't been allocated yet,
--      e.g. trial just started before webhook synced — fail safely)
--   3. If new month vs monthly_period_start → reset remaining = total, period = today
--   4. If remaining >= p_count → deduct + return ok
--   5. Else → return ok=false with remaining unchanged
-- =============================================================================

create or replace function deduct_sms_quota(
  p_groomer_id uuid,
  p_count int default 1
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_balance groomer_sms_balance%rowtype;
  v_today date := current_date;
  v_first_of_month date := date_trunc('month', v_today)::date;
begin
  -- Fetch the balance row
  select * into v_balance
  from groomer_sms_balance
  where groomer_id = p_groomer_id;

  -- 1. Founder bypass — unlimited, no deduction
  if v_balance.founder_unlimited_sms = true then
    return jsonb_build_object(
      'ok', true,
      'remaining', -1,
      'total', -1,
      'source', 'founder_unlimited'
    );
  end if;

  -- 2. No row → groomer hasn't been allocated yet. Fail safely.
  if v_balance is null or v_balance.groomer_id is null then
    return jsonb_build_object(
      'ok', false,
      'remaining', 0,
      'total', 0,
      'reason', 'No SMS quota allocated. Subscription may not have synced yet.'
    );
  end if;

  -- 3. Monthly refill — if we're in a new month, reset remaining to total
  if v_balance.monthly_period_start < v_first_of_month then
    update groomer_sms_balance
    set monthly_sms_remaining = monthly_sms_total,
        monthly_period_start = v_first_of_month,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
  end if;

  -- 4. Enough remaining? Deduct + return ok
  if v_balance.monthly_sms_remaining >= p_count then
    update groomer_sms_balance
    set monthly_sms_remaining = monthly_sms_remaining - p_count,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
    return jsonb_build_object(
      'ok', true,
      'remaining', v_balance.monthly_sms_remaining,
      'total', v_balance.monthly_sms_total,
      'source', 'monthly'
    );
  end if;

  -- 5. Not enough — block
  return jsonb_build_object(
    'ok', false,
    'remaining', v_balance.monthly_sms_remaining,
    'total', v_balance.monthly_sms_total,
    'reason', 'Out of SMS for this month. Upgrade your plan or wait until ' ||
              to_char(v_first_of_month + interval '1 month', 'Mon DD') || '.'
  );
end;
$$;


-- =============================================================================
-- Helper: sync_sms_allocation_for_tier
-- =============================================================================
-- Called from the Stripe webhook on subscription create/update.
-- Sets the monthly_sms_total based on the tier and refills monthly_sms_remaining
-- to the new total (so an upgrade unlocks the bigger bucket immediately).
-- =============================================================================

create or replace function sync_sms_allocation_for_tier(
  p_groomer_id uuid,
  p_tier text
)
returns void
language plpgsql
security definer
as $$
declare
  v_total int;
begin
  -- Map tier → SMS allocation
  v_total := case p_tier
    when 'basic'    then 0      -- Basic tier does NOT include SMS — upgrade to Pro for messaging
    when 'pro'      then 1000
    when 'pro_plus' then 1500
    when 'growing'  then 3000
    else 0   -- unknown tier or canceled → 0
  end;

  insert into groomer_sms_balance (
    groomer_id,
    monthly_sms_total,
    monthly_sms_remaining,
    monthly_period_start,
    updated_at
  )
  values (
    p_groomer_id,
    v_total,
    v_total,
    current_date,
    now()
  )
  on conflict (groomer_id) do update
  set monthly_sms_total = excluded.monthly_sms_total,
      monthly_sms_remaining = excluded.monthly_sms_total,  -- refill on tier change
      monthly_period_start = current_date,
      updated_at = now();
end;
$$;


-- =============================================================================
-- Backfill: existing groomers get an SMS allocation based on their current tier
-- =============================================================================
-- Skips groomers that already have a balance row (idempotent).
-- =============================================================================

insert into groomer_sms_balance (groomer_id, monthly_sms_total, monthly_sms_remaining, monthly_period_start)
select
  g.id,
  case g.subscription_tier
    when 'basic'    then 0
    when 'pro'      then 1000
    when 'pro_plus' then 1500
    when 'growing'  then 3000
    else 0
  end as total,
  case g.subscription_tier
    when 'basic'    then 0
    when 'pro'      then 1000
    when 'pro_plus' then 1500
    when 'growing'  then 3000
    else 0
  end as remaining,
  current_date
from groomers g
where not exists (
  select 1 from groomer_sms_balance b where b.groomer_id = g.id
);


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select b.groomer_id, g.email, b.monthly_sms_total, b.monthly_sms_remaining,
--        b.founder_unlimited_sms, g.subscription_tier
-- from groomer_sms_balance b
-- join groomers g on g.id = b.groomer_id
-- order by g.email;
--
-- Test the deduct function:
-- select deduct_sms_quota('YOUR_GROOMER_ID_HERE'::uuid, 1);
--
-- To grant founder unlimited (run for each founder):
-- update groomer_sms_balance
-- set founder_unlimited_sms = true
-- where groomer_id = (select id from auth.users where email = 'founder@example.com');
