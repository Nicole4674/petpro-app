-- =======================================================
-- PetPro Paycheck Deductions Diagnostic v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: Paycheck Detail page shows "Deduction" with $0.00 for
-- both pre-tax and post-tax rows, but the Net Pay math proves
-- $100 was actually deducted ($10,000 + $500 tips - $100 = $10,400).
-- So the rows ARE in paycheck_deductions — we just need to see
-- what the real column names and values look like.
--
-- Read-only. Safe to run as many times as you want.
-- =======================================================

-- 1. Show every column on paycheck_deductions
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'paycheck_deductions'
ORDER BY ordinal_position;

-- 2. Show every row currently in paycheck_deductions
-- (so we can see actual values for Sophia + Test Staff)
SELECT *
FROM paycheck_deductions
ORDER BY created_at DESC;

-- =======================================================
-- END OF FILE
-- Send me a screenshot of both result sets.
-- =======================================================
