-- ====================================================================
-- PetPro — Staff Auto-Link on Signup
-- ====================================================================
-- PURPOSE: When a new auth user signs up AND an UNLINKED staff_members
-- row already exists with the same email, automatically set that row's
-- auth_user_id to the new auth user. This lets the owner add staff
-- first, then the staff self-signs-up for portal access without the
-- owner having to run SQL manually.
--
-- HOW IT RUNS:
--   - Fires AFTER INSERT on auth.users
--   - Only runs when raw_user_meta_data has { "role": "staff" }
--     so it doesn't interfere with client signup or owner signup
--   - If no matching staff row → does nothing (harmless)
--
-- SAFE TO RUN: only creates the trigger + function, no data changes.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.link_staff_on_signup()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_email TEXT;
BEGIN
  -- Only run if metadata says this is a staff signup
  IF NEW.raw_user_meta_data IS NULL
     OR NEW.raw_user_meta_data->>'role' <> 'staff' THEN
    RETURN NEW;
  END IF;

  v_email := LOWER(TRIM(COALESCE(NEW.email, '')));
  IF v_email = '' THEN RETURN NEW; END IF;

  -- Find the first UNLINKED staff_members row with this email
  -- and set its auth_user_id to the new auth user.
  UPDATE staff_members
  SET auth_user_id = NEW.id
  WHERE LOWER(TRIM(COALESCE(email, ''))) = v_email
    AND auth_user_id IS NULL;

  RETURN NEW;
END;
$function$;

-- Create the trigger
DROP TRIGGER IF EXISTS link_staff_after_signup ON auth.users;
CREATE TRIGGER link_staff_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_staff_on_signup();

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT tgname FROM pg_trigger WHERE tgname = 'link_staff_after_signup';
-- ====================================================================
