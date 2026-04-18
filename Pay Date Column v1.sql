-- =======================================================
-- PetPro Pay Date Column v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: The Run Payroll UI collects a "Pay Date" (the date staff
-- actually get paid, usually a few days after the period ends).
-- This column was in the UI but was never added to the database,
-- which causes the error:
--   "Could not find the 'pay_date' column of 'pay_periods' in the schema cache"
--
-- Safe to re-run (uses IF NOT EXISTS).
-- =======================================================

-- 1. Add pay_date to pay_periods
--    This is the date the shop owner actually cut checks / paid staff.
ALTER TABLE pay_periods
  ADD COLUMN IF NOT EXISTS pay_date DATE;

-- 2. Add pay_date to paychecks
--    So each paycheck row also knows its payday (useful for YTD queries
--    and for year-end W-2 / 1099 reports).
ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS pay_date DATE;

-- 3. Helpful index for YTD lookups by pay_date
CREATE INDEX IF NOT EXISTS idx_paychecks_pay_date ON paychecks(pay_date);

-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm "Success. No rows returned"
--   - Go back to Run Payroll and click Finalize again
-- =======================================================
