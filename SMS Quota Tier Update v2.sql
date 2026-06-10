-- =============================================================================
-- SMS Quota Tier Update v2
-- =============================================================================
-- New SMS allocations per tier (was: basic 0 / pro 1,000 / pro_plus 1,500 /
-- growing 3,000):
--
--   basic    ($70):     500 SMS / month  (NEW — was 0. Mobile flows + light
--                                         reminders work; busy texters feel
--                                         the ceiling and upgrade to Pro.)
--   pro      ($129):  2,000 SMS / month
--   pro_plus ($199):  3,000 SMS / month
--   growing  ($399):  6,000 SMS / month  (capped on purpose — NOT "unlimited".
--                                         Published number + top-ups beats a
--                                         secret fair-use rule. No surprise
--                                         bills, no abuse risk.)
--
-- Cost check at FULL usage (~$0.01/text all-in): 500→$5, 2,000→$20,
-- 3,000→$30, 6,000→$60. All ≈15% of tier price worst-case. Real usage
-- averages far below cap.
--
-- This file:
--   1. Replaces sync_sms_allocation_for_tier with the new numbers
--      (Stripe webhook picks them up automatically for future syncs).
--   2. Bumps EXISTING groomers: total set to the new tier amount, remaining
--      increased by the difference (a raise never takes texts away mid-month).
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run
-- (re-running step 2 is guarded by only raising totals that are below target).
-- =============================================================================

-- ─── 1. New tier → allocation mapping ───
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
  v_total := case p_tier
    when 'basic'    then 500
    when 'pro'      then 2000
    when 'pro_plus' then 3000
    when 'growing'  then 6000
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


-- ─── 2. Raise existing groomers to the new allocations ───
-- Adds the increase to BOTH total and remaining, so nobody loses texts they
-- already had this month. Guarded: only touches rows below the new target,
-- so re-running this file is harmless.
update groomer_sms_balance b
set monthly_sms_remaining = b.monthly_sms_remaining + (t.new_total - b.monthly_sms_total),
    monthly_sms_total = t.new_total,
    updated_at = now()
from (
  select g.id as groomer_id,
         case g.subscription_tier
           when 'basic'    then 500
           when 'pro'      then 2000
           when 'pro_plus' then 3000
           when 'growing'  then 6000
           else 0
         end as new_total
  from groomers g
) t
where b.groomer_id = t.groomer_id
  and b.monthly_sms_total < t.new_total;


-- ─── Optional verify ───
-- select b.groomer_id, g.email, g.subscription_tier,
--        b.monthly_sms_total, b.monthly_sms_remaining
-- from groomer_sms_balance b
-- join groomers g on g.id = b.groomer_id
-- order by g.email;
