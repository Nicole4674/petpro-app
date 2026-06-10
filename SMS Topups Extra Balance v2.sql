-- =============================================================================
-- SMS Top-ups Extra Balance v2 — match the token model (NEVER EXPIRE)
-- =============================================================================
-- v1 added top-up texts to the MONTHLY balance — which resets at the start
-- of each month, so a groomer who bought 500 on the 28th could silently lose
-- the unused ones. That's a fine-print gotcha and the opposite of how PetPro
-- tokens work ("top-ups roll over forever").
--
-- v2 matches tokens exactly:
--   • extra_sms_balance — separate bucket, NEVER expires, survives resets
--   • Sending uses the monthly allowance FIRST, then dips into extras
--   • Top-ups land in extras
--
-- deduct_sms_quota return shape gains an `extra` field; `remaining` now
-- reports monthly + extra combined (what the groomer can actually send).
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

-- ─── 1. The never-expire bucket ───
alter table groomer_sms_balance
  add column if not exists extra_sms_balance int not null default 0;

-- ─── 2. Deduction: monthly first, then extras ───
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
  select * into v_balance
  from groomer_sms_balance
  where groomer_id = p_groomer_id;

  -- 1. Founder bypass — unlimited, no deduction
  if v_balance.founder_unlimited_sms = true then
    return jsonb_build_object(
      'ok', true,
      'remaining', -1,
      'total', -1,
      'extra', -1,
      'source', 'founder_unlimited'
    );
  end if;

  -- 2. No row → not allocated yet. Fail safely.
  if v_balance is null or v_balance.groomer_id is null then
    return jsonb_build_object(
      'ok', false,
      'remaining', 0,
      'total', 0,
      'extra', 0,
      'reason', 'No SMS quota allocated. Subscription may not have synced yet.'
    );
  end if;

  -- 3. Monthly refill — resets the MONTHLY bucket only. Extras are untouched
  --    (that's the whole point: top-ups never expire).
  if v_balance.monthly_period_start < v_first_of_month then
    update groomer_sms_balance
    set monthly_sms_remaining = monthly_sms_total,
        monthly_period_start = v_first_of_month,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
  end if;

  -- 4a. Monthly bucket covers it → deduct from monthly
  if v_balance.monthly_sms_remaining >= p_count then
    update groomer_sms_balance
    set monthly_sms_remaining = monthly_sms_remaining - p_count,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
    return jsonb_build_object(
      'ok', true,
      'remaining', v_balance.monthly_sms_remaining + v_balance.extra_sms_balance,
      'total', v_balance.monthly_sms_total,
      'extra', v_balance.extra_sms_balance,
      'source', 'monthly'
    );
  end if;

  -- 4b. Monthly exhausted → dip into the never-expire extras
  if v_balance.extra_sms_balance >= p_count then
    update groomer_sms_balance
    set extra_sms_balance = extra_sms_balance - p_count,
        updated_at = now()
    where groomer_id = p_groomer_id
    returning * into v_balance;
    return jsonb_build_object(
      'ok', true,
      'remaining', v_balance.monthly_sms_remaining + v_balance.extra_sms_balance,
      'total', v_balance.monthly_sms_total,
      'extra', v_balance.extra_sms_balance,
      'source', 'extra'
    );
  end if;

  -- 5. Both buckets empty — block
  return jsonb_build_object(
    'ok', false,
    'remaining', v_balance.monthly_sms_remaining + v_balance.extra_sms_balance,
    'total', v_balance.monthly_sms_total,
    'extra', v_balance.extra_sms_balance,
    'reason', 'Out of SMS. Buy a top-up (it never expires) or wait until ' ||
              to_char(v_first_of_month + interval '1 month', 'Mon DD') || '.'
  );
end;
$$;
