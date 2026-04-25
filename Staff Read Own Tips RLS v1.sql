-- ====================================================================
-- PetPro — Let staff read tips on payments where they're the assigned
-- staff member on the appointment.
-- ====================================================================
-- WHY: Tip totals on /staff/me show $0 even after real tips were added.
-- Cause: payments table RLS only allowed the OWNER to SELECT. The staff
-- member's session can't read the payment row, so the join returns
-- nothing, and the tip total shows 0.
--
-- FIX: Add a SELECT policy that lets staff read payment rows attached
-- to appointments where staff.staff_id matches them.
--
-- SECURITY: read-only. Staff can ONLY see payments for appointments
-- they were assigned to. Cannot read other staff's payments, cannot
-- modify anything.
--
-- SAFE TO RUN: just adds a policy, no data changes.
-- ====================================================================

DROP POLICY IF EXISTS "Staff view own tip payments" ON payments;
CREATE POLICY "Staff view own tip payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    appointment_id IN (
      SELECT a.id
      FROM appointments a
      JOIN staff_members sm ON sm.id = a.staff_id
      WHERE sm.auth_user_id = auth.uid()
    )
  );

-- ====================================================================
-- VERIFY
-- ====================================================================
-- SELECT polname FROM pg_policy
-- WHERE polrelid = 'payments'::regclass
-- ORDER BY polname;
-- -- Should show "Staff view own tip payments" alongside the existing policies
-- ====================================================================
