-- =======================================================
-- PetPro — Staff RLS Recursion Fix v1
-- Fixes the 500 Internal Server Error on Staff page
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY THIS FILE:
--   Staff page (localhost:5173/staff) returns 500 Internal Server
--   Error when trying to load staff_members. Browser console shows:
--     GET /rest/v1/staff_members?... 500 (Internal Server Error)
--
-- THE CAUSE:
--   There's a broken RLS policy on staff_members named
--   "Staff can view own business staff" whose USING clause does
--   a subquery against staff_members itself:
--
--     USING (
--       groomer_id = auth.uid()
--       OR auth_user_id = auth.uid()
--       OR groomer_id IN (
--           SELECT ...
--           FROM staff_members staff_members_1          -- <== recursion!
--           WHERE staff_members_1.auth_user_id = auth.uid()
--       )
--     )
--
--   When Postgres evaluates this policy, it needs to run the
--   subquery. The subquery queries staff_members, which triggers
--   RLS, which runs this same policy again → infinite recursion
--   → Postgres errors out → 500 returned to the app.
--
-- THE FIX:
--   Drop the broken recursive policy. We already have TWO other
--   policies that cover every case we actually need:
--     1. "Owner can view own staff"        → groomer_id = auth.uid()
--     2. "staff_can_read_own_row"          → auth_user_id = auth.uid()
--
--   Owner sees all their staff (policy 1).
--   Staff sees their own row only (policy 2).
--   Nobody sees coworkers yet — not needed for the current app.
--
-- SAFETY:
--   - Only DROPS the one broken policy.
--   - All 5 other policies stay untouched.
--   - Staff data itself is unchanged — only the policy changes.
--   - Uses IF EXISTS so it's safe to re-run.
-- =======================================================


-- =======================================================
-- 1. DROP the recursive policy
-- =======================================================

DROP POLICY IF EXISTS "Staff can view own business staff" ON staff_members;


-- =======================================================
-- 2. VERIFY — show the remaining policies (should be 5)
-- =======================================================

SELECT
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'staff_members'
ORDER BY policyname;


-- =======================================================
-- 3. SANITY CHECK — count staff rows visible as the owner
-- =======================================================
-- This simulates what the app sees. Should return a number
-- (not 500). With 4 current rows in the table, Nicole should
-- see at most 3 (excluding the one with the wrong groomer_id).

SELECT COUNT(*) AS rows_visible_to_owner
FROM staff_members
WHERE groomer_id = 'c9d34279-e7eb-4730-87df-6f5c049a3022';


-- =======================================================
-- END OF FILE
-- Expected state after running:
--   - Block 2 shows 5 policies (the broken one is gone)
--   - Block 3 returns a clean count, no error
--
-- NEXT:
--   - Refresh the Staff page on localhost
--   - The 500 error should be gone
--   - Staff list should now show 3 rows (3 Sophia duplicates)
--   - Then we'll clean up the duplicates and test Add Staff
-- =======================================================
