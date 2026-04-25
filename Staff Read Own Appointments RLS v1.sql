-- ====================================================================
-- PetPro — Let staff read their own appointments
-- ====================================================================
-- WHY: The staff portal (/staff/me) needs to query appointments where
-- staff_id = current user's staff_members.id (for tips, daily schedule,
-- etc.). The default RLS on appointments only allows the OWNER to read,
-- so staff queries return empty.
--
-- This adds a parallel SELECT policy: staff can read appointments
-- where staff_id matches them.
--
-- SAFE TO RUN: read-only policy. Staff cannot modify appointments.
-- ====================================================================

DROP POLICY IF EXISTS "Staff view own appointments" ON appointments;

CREATE POLICY "Staff view own appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM staff_members WHERE auth_user_id = auth.uid()
    )
  );

-- ====================================================================
-- VERIFY
-- ====================================================================
-- SELECT polname FROM pg_policy
-- WHERE polrelid = 'appointments'::regclass
-- ORDER BY polname;
-- -- Should include "Staff view own appointments"
-- ====================================================================
