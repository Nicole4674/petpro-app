-- =======================================================
-- PetPro — Staff RLS Self Read v1
-- Lets a logged-in staff user read their OWN staff_members row
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY THIS FILE:
--   When Sophia (test staff) logs in, the sidebar shows
--   EVERYTHING — Payroll, Staff List, Tax Settings, etc.
--   Owner view, not staff view.
--
-- THE REAL CAUSE:
--   usePermissions.js runs this query to figure out who you are:
--     SELECT * FROM staff_members WHERE auth_user_id = auth.uid()
--
--   But staff_members has Row Level Security (RLS). The existing
--   policy is "groomer_id = auth.uid()" — meaning only the OWNER
--   can see the rows. Sophia's groomer_id is Nicole's UUID, not
--   Sophia's. So RLS hides Sophia's own row from Sophia.
--
--   The query returns NULL → hook falls through all the way to
--   the "treat as owner" fallback at the bottom of the hook.
--   That's why Sophia sees the full owner sidebar.
--
-- WHAT THIS DOES:
--   Adds ONE new SELECT policy on staff_members that lets a
--   logged-in user read their OWN row (auth_user_id = auth.uid()).
--
--   It does NOT remove or change any existing policy. Owners
--   still see all their staff. Staff now additionally see
--   themselves. That's it.
--
-- SAFETY:
--   - Only affects SELECT (reading), not INSERT/UPDATE/DELETE
--   - Only allows reading rows where auth_user_id matches the
--     logged-in user — a staff member can ONLY see themselves,
--     not other staff
--   - Uses DROP POLICY IF EXISTS so it's safe to re-run
-- =======================================================


-- =======================================================
-- 1. (OPTIONAL) See what policies already exist on staff_members
-- =======================================================

SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'staff_members'
ORDER BY policyname;


-- =======================================================
-- 2. Add the "staff can read their own row" policy
-- =======================================================

DROP POLICY IF EXISTS "staff_can_read_own_row" ON staff_members;

CREATE POLICY "staff_can_read_own_row"
ON staff_members
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());


-- =======================================================
-- 3. VERIFY the new policy was added
-- =======================================================

SELECT
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename  = 'staff_members'
  AND policyname = 'staff_can_read_own_row';


-- =======================================================
-- END OF FILE
-- Expected state after running:
--   - New policy "staff_can_read_own_row" exists on staff_members
--   - Owner policies are unchanged
--
-- HOW TO TEST:
--   1. Log OUT of any account
--   2. Log IN as pamperedlittlepaws@gmail.com (Sophia)
--   3. Sidebar should now HIDE: Payroll, Staff List,
--      Roles & Permissions, Tax Settings, Reports, Year-End Forms
--   4. Sidebar should SHOW: Dashboard, Grooming (Calendar, Clients,
--      Pricing, Waitlist, Flagged), Staff > Time Clock, AI > Voice Mode
--   5. That confirms groomer role defaults are applying correctly
-- =======================================================
