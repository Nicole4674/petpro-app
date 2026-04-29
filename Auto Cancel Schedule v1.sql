-- =============================================================================
-- Auto Cancel Schedule v1
-- =============================================================================
-- Schedules a job that runs every 5 minutes to auto-cancel pending bookings
-- on shops that require pre-payment, when the booking has been sitting in
-- 'pending' for more than 15 minutes (i.e., the client never paid).
--
-- Uses pg_cron (PostgreSQL cron extension) which Supabase supports natively.
-- Runs as SQL directly — no HTTP call needed, no auth headers, no edge
-- function invocation. Just a clean cancellation update on a schedule.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Enable pg_cron extension (idempotent — does nothing if already enabled)
create extension if not exists pg_cron;


-- 2. Drop the existing job if rerunning the migration (so we can recreate)
do $$
begin
  -- Only drop if the job actually exists (avoids error on first run)
  if exists (select 1 from cron.job where jobname = 'auto-cancel-unpaid-bookings') then
    perform cron.unschedule('auto-cancel-unpaid-bookings');
  end if;
end $$;


-- 3. Schedule the auto-cancel job — runs every 5 minutes
select cron.schedule(
  'auto-cancel-unpaid-bookings',
  '*/5 * * * *',  -- every 5 min (cron syntax: minute hour day-of-month month day-of-week)
  $$
  update appointments
  set status = 'cancelled'
  where status = 'pending'
    and created_at < (now() - interval '15 minutes')
    and groomer_id in (
      select groomer_id
      from shop_settings
      where require_prepay_to_book = true
    );
  $$
);


-- =============================================================================
-- Optional verify — run after the migration to confirm the job was scheduled
-- =============================================================================
-- select jobid, jobname, schedule, command
-- from cron.job
-- where jobname = 'auto-cancel-unpaid-bookings';
