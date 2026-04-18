-- =======================================================
-- PetPro — Staff Login Link v1
-- Stage 1: Minimum Viable Staff Login Fix
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHAT THIS DOES:
--   Links the test staff auth account (pamperedlittlepaws@gmail.com)
--   to a staff_members row so the usePermissions hook can find it
--   and apply restricted staff permissions.
--
-- HOW THE APP USES THIS:
--   When someone logs in, src/hooks/usePermissions.js queries:
--     SELECT * FROM staff_members WHERE auth_user_id = <logged-in uid>
--   If found → treat as staff with the given role (restricted sidebar)
--   If not found → fall back to "owner" view (shows everything)
--
--   Until this link exists, the test account falls through to the
--   owner fallback — which is why it looks identical to your account.
--
-- AFTER RUNNING THIS:
--   Log out of your owner account.
--   Log in as pamperedlittlepaws@gmail.com
--   The sidebar should HIDE Payroll, Tax Settings, Reports, Year-End
--   Forms, etc. Only Time Clock and a few basic items should show.
--
-- ROLE ASSIGNED: front_desk
--   (This is the most restricted staff role, perfect for verifying
--   permissions are working. You can change it later through the
--   Staff page or by re-running this SQL with a different role.)
-- =======================================================


-- =======================================================
-- SAFE UPSERT — handles both cases:
--   A) If a staff_members row already exists with this email,
--      just update the auth_user_id so it's properly linked.
--   B) If no row exists, create one from scratch.
-- =======================================================

DO $$
DECLARE
  v_owner_id      UUID := 'c9d34279-e7eb-4730-87df-6f5c049a3022';  -- Nicole (owner)
  v_staff_auth_id UUID := 'd5fa9cd9-666d-4c12-abc9-88f3f2023ae4';  -- pamperedlittlepaws@gmail.com
  v_staff_email   TEXT := 'pamperedlittlepaws@gmail.com';
  v_existing_id   UUID;
BEGIN
  -- Look for an existing staff row tied to this email, under this owner
  SELECT id INTO v_existing_id
  FROM staff_members
  WHERE groomer_id = v_owner_id
    AND email = v_staff_email
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Row exists → just wire up the auth link + make sure active
    UPDATE staff_members
    SET auth_user_id = v_staff_auth_id,
        is_active    = TRUE
    WHERE id = v_existing_id;

    RAISE NOTICE 'Updated existing staff_members row % with auth_user_id', v_existing_id;
  ELSE
    -- No row → create a minimal test staff
    INSERT INTO staff_members (
      groomer_id,
      auth_user_id,
      first_name,
      last_name,
      email,
      role,
      worker_type,
      pay_type,
      hourly_rate,
      is_active
    ) VALUES (
      v_owner_id,
      v_staff_auth_id,
      'Test',
      'Staff',
      v_staff_email,
      'front_desk',
      'w2',
      'hourly',
      15.00,
      TRUE
    );

    RAISE NOTICE 'Inserted new staff_members row for %', v_staff_email;
  END IF;
END $$;


-- =======================================================
-- VERIFICATION — run this after the DO block to confirm
-- the link was set up correctly.
-- =======================================================

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  worker_type,
  is_active,
  auth_user_id,
  groomer_id
FROM staff_members
WHERE email = 'pamperedlittlepaws@gmail.com';


-- =======================================================
-- END OF FILE
-- Expected result from the SELECT above:
--   - 1 row returned
--   - auth_user_id column = d5fa9cd9-666d-4c12-abc9-88f3f2023ae4
--   - groomer_id column   = c9d34279-e7eb-4730-87df-6f5c049a3022
--   - role                = front_desk
--   - is_active           = true
-- =======================================================
