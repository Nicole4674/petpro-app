-- =======================================================
-- PetPro — Sophia Rows Check v1
-- READ-ONLY — makes NO changes, just shows info
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY THIS FILE:
--   Before we delete any duplicate Sophia rows, we need to
--   SEE every Sophia row in staff_members so we know:
--     - which one has the real auth_user_id link (KEEP)
--     - which ones are duplicates (DELETE)
--     - if any are tied to wrong groomer_id (orphan)
--
-- Paste the results back to Claude and the cleanup SQL
-- will be written based on what we actually see — no guessing.
-- =======================================================

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  auth_user_id,
  groomer_id,
  created_at
FROM staff_members
WHERE first_name ILIKE 'Sophia'
ORDER BY created_at ASC;


-- =======================================================
-- END OF FILE
-- Expected: between 1 and 3 rows.
-- Paste ALL columns of ALL rows back to Claude.
-- =======================================================
