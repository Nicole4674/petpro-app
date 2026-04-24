-- ====================================================================
-- PetPro — Staff Self-Read RLS Policy
-- ====================================================================
-- PURPOSE: Lets a logged-in staff user read THEIR OWN staff_members
-- row (the one where auth_user_id matches their auth.uid()).
-- Without this, the staff portal at /staff/me can't load their
-- profile — even though the row exists and is correctly linked.
--
-- WHY: The existing RLS policies likely only let the OWNER
-- (groomer_id = auth.uid()) read staff_members. That excludes the
-- staff member themselves. This policy adds them.
--
-- SELECT policies are OR-combined in Postgres RLS, so adding this
-- policy doesn't break owner access — it just adds staff access.
--
-- SAFE TO RUN: only adds/replaces a single policy.
-- ====================================================================

-- Drop any existing version so re-running is safe
DROP POLICY IF EXISTS "Staff can read own staff_members row" ON staff_members;

CREATE POLICY "Staff can read own staff_members row"
  ON staff_members FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- ====================================================================
-- VERIFY
-- ====================================================================
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE tablename = 'staff_members'
--   ORDER BY policyname;
--   -- Should include "Staff can read own staff_members row"
-- ====================================================================
