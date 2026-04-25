-- ====================================================================
-- PetPro — Let staff read their own tip payments (v2 — SECURITY DEFINER)
-- ====================================================================
-- WHY v2: v1 added an RLS policy that joined through appointments and
-- staff_members. Both tables have their own RLS, which blocked the
-- subquery's join from finding rows. Result: staff still see $0 tips.
--
-- FIX: wrap the check in a SECURITY DEFINER function. That function
-- runs with the function-owner's privileges (postgres), bypassing RLS
-- WITHIN the check — but still scopes results to auth.uid() so each
-- staff only ever sees their own data.
--
-- This is the same pattern Postgres recommends for cross-table RLS
-- checks where the joined tables have RLS of their own.
--
-- SAFE TO RUN: CREATE OR REPLACE on the function + DROP/CREATE on the
-- policy. No data changes. Run after v1 — this overrides it.
-- ====================================================================

-- Step 1 — drop the broken v1 policy if it exists
DROP POLICY IF EXISTS "Staff view own tip payments" ON payments;

-- Step 2 — create the SECURITY DEFINER helper function
CREATE OR REPLACE FUNCTION public.staff_can_see_payment_appt(p_appointment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM appointments a
    JOIN staff_members sm ON sm.id = a.staff_id
    WHERE a.id = p_appointment_id
      AND sm.auth_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_see_payment_appt(UUID) TO authenticated;

-- Step 3 — recreate the policy using the helper
CREATE POLICY "Staff view own tip payments"
  ON payments FOR SELECT
  TO authenticated
  USING (staff_can_see_payment_appt(appointment_id));

-- ====================================================================
-- VERIFY
-- ====================================================================
-- 1. Check the function exists:
--      SELECT proname, prosecdef FROM pg_proc WHERE proname = 'staff_can_see_payment_appt';
--      -- prosecdef should be true (SECURITY DEFINER)
--
-- 2. Check the policy is in place:
--      SELECT polname FROM pg_policy
--      WHERE polrelid = 'payments'::regclass;
--      -- Should include "Staff view own tip payments"
--
-- 3. After deploying — log in as the staff user, reload /staff/me.
--    Tip totals should now match real payment.tip_amount values.
-- ====================================================================
