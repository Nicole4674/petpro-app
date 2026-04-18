-- =======================================================
-- PetPro — Staff Login Link v2
-- Stage 1: Minimum Viable Staff Login Fix  (v2 FIX)
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor (v2 replaces v1)
-- =======================================================
-- WHY v2:
--   v1 errored because your staff_members table does NOT have
--   an "is_active" column. v2 simply drops every reference to it.
--
-- WHAT THIS DOES (unchanged from v1):
--   Links the test staff auth account (pamperedlittlepaws@gmail.com)
--   to the existing staff_members row so the usePermissions hook
--   can find it and apply restricted staff permissions.
--
-- HOW THE APP USES THIS:
--   When someone logs in, src/hooks/usePermissions.js queries:
--     SELECT * FROM staff_members WHERE auth_user_id = <logged-in uid>
--   If found → treat as staff with the given role (restricted sidebar)
--   If not found → fall back to "owner" view (shows everything)
--
-- AFTER RUNNING THIS:
--   Log out of your owner account.
--   Log in as pamperedlittlepaws@gmail.com
--   The sidebar should HIDE Payroll, Tax Settings, Reports, Year-End
--   Forms, etc. Only basic staff items should show.
-- =======================================================


-- =======================================================
-- SAFE UPSERT — handles both cases:
--   A) Row exists with this email → only update auth_user_id
--   B) No row → create a minimal test staff row
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
    -- Row exists → only update the auth link (no is_active)
    UPDATE staff_members
    SET auth_user_id = v_staff_auth_id
    WHERE id = v_existing_id;

    RAISE NOTICE 'Updated existing staff_members row % with auth_user_id', v_existing_id;
  ELSE
    -- No row → create a minimal test staff (no is_active)
    INSERT INTO staff_members (
      groomer_id,
      auth_user_id,
      first_name,
      last_name,
      email,
      role,
      worker_type,
      pay_type,
      hourly_rate
    ) VALUES (
      v_owner_id,
      v_staff_auth_id,
      'Test',
      'Staff',
      v_staff_email,
      'front_desk',
      'w2',
      'hourly',
      15.00
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
--   - role                = (whatever the existing row had, e.g. front_desk)
-- =======================================================
