-- ====================================================================
-- PetPro — Staff Members RLS Clean Reset
-- ====================================================================
-- PURPOSE: Previous RLS setups on staff_members have had recursion
-- issues (policy queries staff_members from within a staff_members
-- policy → infinite loop). This script drops ALL existing policies
-- and replaces them with two simple, non-recursive ones:
--
--   1. owner_full_access — the shop owner (groomer_id = auth.uid())
--      can SELECT / INSERT / UPDATE / DELETE their own staff
--   2. staff_self_read — a logged-in staff user can SELECT their OWN
--      row (auth_user_id = auth.uid())
--
-- Neither policy queries staff_members, so no recursion is possible.
--
-- SAFE TO RUN: only touches policies, doesn't change row data.
-- ====================================================================

-- Step 1: drop every existing policy on staff_members
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'staff_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON staff_members', r.policyname);
  END LOOP;
END $$;

-- Step 2: make sure RLS is still on
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

-- Step 3: simple, non-recursive policies
CREATE POLICY "owner_full_access"
  ON staff_members
  FOR ALL
  TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "staff_self_read"
  ON staff_members
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- ====================================================================
-- VERIFY — should show exactly 2 policies
-- ====================================================================
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'staff_members'
ORDER BY policyname;
