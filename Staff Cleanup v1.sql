-- =======================================================
-- PetPro — Staff Cleanup v1
-- Removes orphan duplicate staff_members rows
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor AFTER Staff Login Link v2.sql
-- =======================================================
-- WHY THIS FILE:
--   During early staff-profile testing (before permissions were
--   wired up), multiple duplicate rows for "Sophia Aceves" were
--   created under pamperedlittlepaws@gmail.com. Only one of those
--   rows is now linked to the auth user (auth_user_id set).
--   The other rows are orphans — same email, NULL auth_user_id.
--
-- WHAT THIS DOES:
--   Deletes only the orphan rows (NULL auth_user_id) for this
--   specific email, under this specific owner. The linked row
--   (the one we fixed in Staff Login Link v2) is kept.
--
-- SAFETY:
--   - Scoped to one owner (groomer_id) — can't touch other shops
--   - Scoped to one email — only the test staff's duplicates
--   - Scoped to auth_user_id IS NULL — the linked row is protected
--
-- SHOWS WHAT WILL BE DELETED FIRST:
--   The SELECT below lets you preview before the DELETE runs.
-- =======================================================


-- =======================================================
-- 1. PREVIEW — see what WILL be deleted (should be 2 rows)
-- =======================================================

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  auth_user_id
FROM staff_members
WHERE groomer_id = 'c9d34279-e7eb-4730-87df-6f5c049a3022'
  AND email      = 'pamperedlittlepaws@gmail.com'
  AND auth_user_id IS NULL;


-- =======================================================
-- 2. DELETE the orphans
-- =======================================================

DELETE FROM staff_members
WHERE groomer_id = 'c9d34279-e7eb-4730-87df-6f5c049a3022'
  AND email      = 'pamperedlittlepaws@gmail.com'
  AND auth_user_id IS NULL;


-- =======================================================
-- 3. VERIFY — see what REMAINS (should be 1 row, the linked one)
-- =======================================================

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  worker_type,
  auth_user_id,
  groomer_id
FROM staff_members
WHERE email = 'pamperedlittlepaws@gmail.com';


-- =======================================================
-- END OF FILE
-- Expected state after running:
--   - Orphan rows deleted (was 2, now 0)
--   - Linked row preserved (Sophia Aceves, auth_user_id set)
--   - Total staff_members rows for this email: 1
-- =======================================================
