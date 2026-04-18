-- =======================================================
-- PetPro Cleanup Orphaned Pay Periods v2
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY v2: v1 used auth.uid() to filter to the current user,
-- but auth.uid() returns NULL when you run SQL directly in the
-- Supabase SQL Editor (it only works when called from the app).
-- So v1's DELETE matched zero rows and nothing got cleaned up.
--
-- v2 drops the auth.uid() filter and just deletes ANY pay_period
-- that has zero paychecks attached. Safe because orphans are
-- empty no matter who "owned" them.
--
-- Safe to re-run. Safe even if there's nothing to clean up.
-- =======================================================

-- STEP 1: Show what WILL be deleted (look at this first!)
SELECT
  pp.id,
  pp.groomer_id,
  pp.start_date,
  pp.end_date,
  pp.status,
  pp.closed_at,
  (SELECT COUNT(*) FROM paychecks pc WHERE pc.pay_period_id = pp.id) AS paycheck_count
FROM pay_periods pp
WHERE NOT EXISTS (
  SELECT 1 FROM paychecks pc WHERE pc.pay_period_id = pp.id
)
ORDER BY pp.closed_at DESC NULLS LAST, pp.start_date DESC;

-- =======================================================
-- STEP 2: If the list above looks right (only orphaned rows,
-- all showing paycheck_count = 0), run this DELETE to remove them.
-- =======================================================

DELETE FROM pay_periods
WHERE NOT EXISTS (
  SELECT 1 FROM paychecks pc WHERE pc.pay_period_id = pay_periods.id
);

-- =======================================================
-- STEP 3: Verify — this should now only show pay periods
-- that have real paychecks attached.
-- =======================================================
SELECT
  pp.id,
  pp.start_date,
  pp.end_date,
  pp.status,
  (SELECT COUNT(*) FROM paychecks pc WHERE pc.pay_period_id = pp.id) AS paycheck_count
FROM pay_periods pp
ORDER BY pp.start_date DESC;

-- =======================================================
-- END OF FILE
-- After running this:
--   - Refresh Payroll Dashboard (Ctrl + F5 for hard refresh)
--   - Recent Pay Periods should now show just 1 row
-- =======================================================
