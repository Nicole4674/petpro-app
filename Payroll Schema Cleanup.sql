-- =======================================================
-- PetPro Payroll Schema Cleanup
-- Step 10 - Payroll Build, Phase 1 (fix)
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor AFTER Payroll Schema.sql
-- =======================================================
-- What this file does:
--   1. DROPS the redundant staff_pay_settings table (pay info
--      already lives on the staff_members table).
--   2. ADDS the few missing pay fields to staff_members:
--        - pay_period_type  (weekly / bi_weekly / semi_monthly / monthly)
--        - salary_amount    (for salary-based staff)
--        - overtime_rate_multiplier  (e.g. 1.5x)
--        - overtime_enabled (true/false)
--        - tips_percent     (if staff is on tip-split, which %)
--      NOTE: many of these may already exist. All statements use
--      IF NOT EXISTS so it's safe either way.
--   3. Keeps pay_periods, paychecks, booking_tips unchanged.
-- =======================================================


-- =======================================================
-- 1. DROP the unused staff_pay_settings table
-- =======================================================
-- Policies are dropped automatically when the table is dropped.
DROP TABLE IF EXISTS staff_pay_settings CASCADE;


-- =======================================================
-- 2. ADD missing pay fields to staff_members
-- =======================================================

-- How often this staff member gets paid
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS pay_period_type TEXT DEFAULT 'bi_weekly';

-- Add check constraint separately so it doesn't fail if column already existed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_members_pay_period_type_check'
  ) THEN
    ALTER TABLE staff_members
      ADD CONSTRAINT staff_members_pay_period_type_check
      CHECK (pay_period_type IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly'));
  END IF;
END $$;

-- Salary amount (used only when pay_type = 'salary')
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS salary_amount NUMERIC(10,2) DEFAULT 0;

-- Overtime multiplier (1.5 = time-and-a-half)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS overtime_rate_multiplier NUMERIC(4,2) DEFAULT 1.5;

-- Whether overtime applies to this staff (salary folks typically exempt)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS overtime_enabled BOOLEAN DEFAULT true;

-- Tip split percent (only used when tips_handling = 'split')
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS tips_percent NUMERIC(5,2) DEFAULT 100;


-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm no errors
--   - Next step: make the Staff Detail Pay tab editable
--     + add the new fields (pay period, salary, overtime)
-- =======================================================
