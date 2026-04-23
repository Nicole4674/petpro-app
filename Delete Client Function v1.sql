-- ====================================================================
-- PetPro — delete_client_and_auth RPC function
-- ====================================================================
-- PURPOSE: Let a groomer fully delete a client from their system,
-- including:
--   • The clients row (cascades auto-delete their pets, appointments,
--     payments, contacts, notes, etc. via existing FK constraints)
--   • The auth.users row if the client had a portal account — frees
--     up the email for re-signup (critical for testing + fixing
--     mistakes pre-launch)
--
-- SECURITY: uses SECURITY DEFINER so it can reach into auth.users,
-- but checks that the caller owns the client BEFORE deleting
-- anything. Can't be used to delete someone else's clients.
--
-- SAFE TO RUN: CREATE OR REPLACE only — doesn't touch any data.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.delete_client_and_auth(p_client_id UUID)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_owns    BOOLEAN;
BEGIN
  -- Step 1: Verify the caller owns this client. Refuse otherwise.
  SELECT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id
      AND groomer_id = auth.uid()
  ) INTO v_owns;

  IF NOT v_owns THEN
    RAISE EXCEPTION 'Not authorized to delete this client';
  END IF;

  -- Step 2: Grab the auth user_id before we delete the clients row
  SELECT user_id INTO v_user_id FROM clients WHERE id = p_client_id;

  -- Step 3: Delete the clients row (FK cascades clean up pets,
  -- appointments, payments, contacts, notes, etc.)
  DELETE FROM clients WHERE id = p_client_id;

  -- Step 4: If the client had a portal login, delete the auth user
  -- so their email frees up and can be re-used for a fresh signup.
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;
END;
$function$;

-- Allow any authenticated user (groomers) to call this function
GRANT EXECUTE ON FUNCTION public.delete_client_and_auth(UUID) TO authenticated;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT proname, prosecdef
--   FROM pg_proc
--   WHERE proname = 'delete_client_and_auth';
--   -- prosecdef = true (SECURITY DEFINER)
-- ====================================================================
