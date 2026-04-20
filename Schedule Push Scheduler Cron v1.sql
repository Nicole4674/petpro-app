-- ====================================================================
-- Schedule push-scheduler to run every 10 minutes
-- --------------------------------------------------------------------
-- BEFORE RUNNING: replace YOUR_SERVICE_ROLE_KEY_HERE with your actual
-- service role key from Supabase → Settings → API → "service_role"
-- (the secret one, NOT the anon key).
-- ====================================================================

-- 1. Make sure the extensions are enabled (no-op if already on)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Unschedule any previous version (safe to run even if nothing exists)
SELECT cron.unschedule('push-scheduler-every-10-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'push-scheduler-every-10-min'
);

-- 3. Schedule push-scheduler to fire every 10 minutes
SELECT cron.schedule(
  'push-scheduler-every-10-min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://egupqwfawgymeqdmngsm.supabase.co/functions/v1/push-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_zDcMebmzMwm1-xSEz6m0CQ_935dkGTb',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Verify the schedule got created
SELECT jobid, schedule, jobname, active
FROM cron.job
WHERE jobname = 'push-scheduler-every-10-min';
