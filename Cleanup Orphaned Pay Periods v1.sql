-- =======================================================
-- PetPro Cleanup Orphaned Pay Periods v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: While we were fixing the pay_date / hours_worked / rate_type
-- errors during testing, each failed Finalize attempt created a
-- pay_periods row that had NO paychecks attached (because the save
-- bailed out partway through).
--
-- Result: the Payroll Dashboard is counting those empty "Closed"
-- periods and the YTD numbers look weird.
--
-- This script deletes ONLY pay_periods rows that have zero
-- paychecks attached. Real successful runs (the ones that actually
-- saved paychecks) are NOT touched.
--
-- Safe to re-run. Safe even if there's nothing to clean up.
-- =======================================================

-- STEP 1: Show what WILL be deleted (look at this first!)
--         Run just this SELECT and check the results before deleting.
SELECT
  pp.id,
  pp.start_date,
  pp.end_date,
  pp.status,
  pp.closed_at,
  (SELECT COUNT(*) FROM paychecks pc WHERE pc.pay_period_id = pp.id) AS paycheck_count
FROM pay_periods pp
WHERE pp.groomer_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM paychecks pc WHERE pc.pay_period_id = pp.id
  )
ORDER BY pp.closed_at DESC NULLS LAST, pp.start_date DESC;

-- =======================================================
-- STEP 2: If the list above looks right (only orphaned rows,
-- all showing paycheck_count = 0), run this DELETE to remove them.
-- =======================================================

DELETE FROM pay_periods
WHERE groomer_id = auth.uid()
  AND NOT EXISTS (
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
WHERE pp.groomer_id = auth.uid()
ORDER BY pp.start_date DESC;

-- =======================================================
-- END OF FILE
-- After running this:
--   - Refresh Payroll Dashboard
--   - The YTD numbers should now match the one real finalized run
-- =======================================================
