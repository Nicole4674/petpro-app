-- =======================================================
-- PetPro Paychecks Missing Columns v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor AFTER Pay Date Column v1.sql
-- =======================================================
-- WHY: When payroll was finalizing it hit the error:
--   "Could not find the 'hours_worked' column of 'paychecks' in the schema cache"
--
-- The Run Payroll code writes three columns that were never added to the
-- paychecks table. This migration adds all three in one shot so Finalize
-- Pay Period saves correctly.
--
-- Safe to re-run (uses IF NOT EXISTS).
-- =======================================================

-- 1. tips  (the dollar amount of tips paid out this check, after split %)
ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS tips NUMERIC(10,2) DEFAULT 0;

-- 2. hours_worked  (human-readable total hours on this check, e.g. 40.5)
--    NOTE: there are also regular_minutes / overtime_minutes on this table
--    from the original schema. This is the friendlier total for displays.
ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(10,2) DEFAULT 0;

-- 3. service_revenue  (total $ of appointments this staff produced in the
--    pay period — used for commission reports and audit trail)
ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS service_revenue NUMERIC(10,2) DEFAULT 0;

-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm "Success. No rows returned"
--   - Go back to Run Payroll and click Finalize again
-- =======================================================
