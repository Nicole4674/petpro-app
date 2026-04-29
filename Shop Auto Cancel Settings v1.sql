-- =============================================================================
-- Shop Auto Cancel Settings v1
-- =============================================================================
-- Each shop now picks if they want to auto-cancel unpaid pending bookings,
-- and how long to wait before doing so. This replaces the hardcoded 15 min
-- timer in the original auto-cancel cron job.
--
-- New columns on shop_settings:
--   • auto_cancel_unpaid_bookings  (boolean, default false)
--       turn the auto-cancel on/off independently of require_prepay
--   • auto_cancel_unpaid_minutes   (numeric, default 15)
--       how long to wait before cancelling (some shops want 15 min, others
--       want 30, 60, even 24 hours)
--
-- This SQL also reschedules the cron job to use each shop's settings
-- instead of a hardcoded 15 min for everyone.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Add columns to shop_settings
alter table shop_settings
  add column if not exists auto_cancel_unpaid_bookings boolean
    default false;

alter table shop_settings
  add column if not exists auto_cancel_unpaid_minutes numeric(10, 0)
    default 15;


-- 2. Reschedule the cron job — use per-shop settings now
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-cancel-unpaid-bookings') then
    perform cron.unschedule('auto-cancel-unpaid-bookings');
  end if;
end $$;


-- 3. Schedule the new version of the auto-cancel job. The query joins each
--    appointment to its shop_settings via groomer_id, then checks BOTH
--    the toggle AND the per-shop timer. Shops that don't have auto-cancel
--    enabled are skipped entirely. Shops that do, use their own timer.
select cron.schedule(
  'auto-cancel-unpaid-bookings',
  '*/5 * * * *',  -- every 5 min
  $$
  update appointments
  set status = 'cancelled'
  where status = 'pending'
    and exists (
      select 1
      from shop_settings s
      where s.groomer_id = appointments.groomer_id
        and s.require_prepay_to_book = true
        and s.auto_cancel_unpaid_bookings = true
        and appointments.created_at < (
          now() - make_interval(mins => coalesce(s.auto_cancel_unpaid_minutes, 15)::int)
        )
    );
  $$
);


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings'
--   and column_name in ('auto_cancel_unpaid_bookings', 'auto_cancel_unpaid_minutes');

-- select jobname, schedule
-- from cron.job
-- where jobname = 'auto-cancel-unpaid-bookings';
