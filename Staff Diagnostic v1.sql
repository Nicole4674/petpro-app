-- =======================================================
-- PetPro Staff Diagnostic v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: Dashboard shows "Staff on Payroll: 0" even after fixing the
-- query to filter by status='active'. This diagnostic shows us the
-- actual rows in staff_members so we can see what status values
-- are really in the DB.
--
-- Read-only. Safe to run as many times as you want.
-- =======================================================

-- 1. Every staff row (so we can see statuses and groomer_ids)
SELECT
  id,
  first_name,
  last_name,
  status,
  pay_type,
  hourly_rate,
  commission_percent,
  salary_amount,
  groomer_id,
  created_at
FROM staff_members
ORDER BY created_at DESC;

-- 2. What distinct status values exist on staff_members?
SELECT
  status,
  COUNT(*) AS how_many
FROM staff_members
GROUP BY status;

-- 3. What columns actually exist on staff_members?
-- (Helps catch typos or a missing status column.)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'staff_members'
ORDER BY ordinal_position;

-- =======================================================
-- END OF FILE
-- Send me a screenshot of all three result sets.
-- =======================================================
