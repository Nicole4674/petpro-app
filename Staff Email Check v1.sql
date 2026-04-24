-- ====================================================================
-- PetPro — Staff Email Signup Eligibility Check
-- ====================================================================
-- PURPOSE: Let the /staff/login signup form pre-check whether an
-- email is eligible to sign up as staff, BEFORE the user is logged in.
-- Without this, RLS on staff_members blocks public queries, so we
-- can't tell the user "wait, this email isn't set up" until after
-- they've already created an auth account.
--
-- Returns a simple status code — nothing else reveals any data:
--   'eligible'   = unlinked staff row exists → they can sign up
--   'already_linked' = staff row exists but already has auth
--   'not_staff'  = no matching staff row → owner hasn't added them
--
-- SAFE TO RUN: only creates a function, no data changes.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.check_staff_email_eligibility(p_email TEXT)
  RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_email TEXT;
  v_row   RECORD;
BEGIN
  v_email := LOWER(TRIM(COALESCE(p_email, '')));
  IF v_email = '' THEN RETURN 'not_staff'; END IF;

  SELECT id, auth_user_id INTO v_row
  FROM staff_members
  WHERE LOWER(TRIM(COALESCE(email, ''))) = v_email
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'not_staff'; END IF;
  IF v_row.auth_user_id IS NOT NULL THEN RETURN 'already_linked'; END IF;
  RETURN 'eligible';
END;
$function$;

-- Anyone (even not-logged-in) can call this; function itself is safe
GRANT EXECUTE ON FUNCTION public.check_staff_email_eligibility(TEXT) TO anon, authenticated;

-- ====================================================================
-- VERIFY
-- ====================================================================
--   SELECT check_staff_email_eligibility('some.email@example.com');
-- ====================================================================
