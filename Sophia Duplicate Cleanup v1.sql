-- =======================================================
-- PetPro — Sophia Duplicate Cleanup v1
-- Deletes the 2 duplicate Sophia rows, keeps the linked one
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY THIS FILE:
--   Sophia Rows Check v1 showed 3 rows for Sophia Aceves:
--     KEEP   id: 30e49031-577a-4f4b-8b88-4f01d1c04c8f
--            (has auth_user_id, correct groomer_id, oldest)
--     DELETE id: c7dcc406-a039-4905-a65e-f7b5ee1ba285
--            (no auth, WRONG groomer_id → orphan)
--     DELETE id: c809ecee-1555-40cc-9c02-cf467c135f65
--            (no auth, correct groomer_id → plain duplicate)
--
--   User confirmed test deductions can be deleted and re-added,
--   so this does NOT re-point deductions — it just wipes
--   anything tied to the 2 dupes and removes them.
--
-- SAFETY:
--   - Wrapped in BEGIN / COMMIT — atomic. If any step fails,
--     the whole thing rolls back, nothing changes.
--   - Only touches the 2 specific dupe IDs.
--   - The KEEP row (30e49031-...) is never referenced, so
--     anything on it stays exactly as-is.
-- =======================================================


BEGIN;


-- =======================================================
-- 1. Wipe any permission overrides tied to the dupes
-- =======================================================

DELETE FROM staff_permissions
WHERE staff_id IN (
  'c7dcc406-a039-4905-a65e-f7b5ee1ba285',
  'c809ecee-1555-40cc-9c02-cf467c135f65'
);


-- =======================================================
-- 2. Wipe any deductions tied to the dupes
-- =======================================================

DELETE FROM staff_deductions
WHERE staff_id IN (
  'c7dcc406-a039-4905-a65e-f7b5ee1ba285',
  'c809ecee-1555-40cc-9c02-cf467c135f65'
);


-- =======================================================
-- 3. Delete the 2 duplicate staff_members rows
-- =======================================================

DELETE FROM staff_members
WHERE id IN (
  'c7dcc406-a039-4905-a65e-f7b5ee1ba285',
  'c809ecee-1555-40cc-9c02-cf467c135f65'
);


COMMIT;


-- =======================================================
-- 4. VERIFY — should return exactly 1 Sophia row
-- =======================================================

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  auth_user_id,
  groomer_id
FROM staff_members
WHERE first_name ILIKE 'Sophia';


-- =======================================================
-- END OF FILE
-- Expected after running:
--   - Exactly 1 row returned
--   - id           = 30e49031-577a-4f4b-8b88-4f01d1c04c8f
--   - auth_user_id = d5fa9cd9-666d-4c12-abc9-88f3f2023ae4
--   - groomer_id   = c9d34279-e7eb-4730-87df-6f5c049a3022
--
-- NEXT:
--   - Refresh localhost:5173/staff
--   - Staff page should now show ONE Sophia (not three)
-- =======================================================
