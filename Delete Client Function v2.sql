-- ====================================================================
-- PetPro — delete_client_and_auth RPC function v2
-- ====================================================================
-- PURPOSE: v1 errored because `appointments.client_id` FK doesn't have
-- ON DELETE CASCADE. v2 explicitly deletes from all related tables
-- before deleting the clients row.
--
-- DELETION ORDER (reverse of dependency chain):
--   1. appointment_pets (references appointments & pets)
--   2. payments         (references appointments & clients)
--   3. appointments     (references clients)
--   4. notes            (references clients & pets)
--   5. client_contacts  (already cascades, but explicit for safety)
--   6. waitlist         (references clients, if any)
--   7. pets             (references clients)
--   8. kennel_reservations / boarding tables (references clients)
--   9. clients row itself
--  10. auth.users (frees up the email for re-signup)
--
-- SAFE TO RUN: CREATE OR REPLACE — replaces the v1 function.
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
  -- Verify caller owns this client (security: can't delete someone else's)
  SELECT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id
      AND groomer_id = auth.uid()
  ) INTO v_owns;

  IF NOT v_owns THEN
    RAISE EXCEPTION 'Not authorized to delete this client';
  END IF;

  -- Grab auth user_id BEFORE delete
  SELECT user_id INTO v_user_id FROM clients WHERE id = p_client_id;

  -- ═══════════════════════════════════════════════════════════════
  -- Delete from all related tables in dependency order
  -- Using IF EXISTS checks so missing tables don't break the function
  -- ═══════════════════════════════════════════════════════════════

  -- appointment_pets: rows that reference this client's appointments
  -- (must go before appointments)
  DELETE FROM appointment_pets
  WHERE appointment_id IN (
    SELECT id FROM appointments WHERE client_id = p_client_id
  );

  -- Payments tied to this client
  DELETE FROM payments WHERE client_id = p_client_id;

  -- Appointments for this client
  DELETE FROM appointments WHERE client_id = p_client_id;

  -- Notes (client-level + per-pet notes that belong to this client's pets)
  DELETE FROM notes WHERE client_id = p_client_id;

  -- Client contacts (emergency + pickup people)
  DELETE FROM client_contacts WHERE client_id = p_client_id;

  -- Waitlist entries
  BEGIN
    DELETE FROM waitlist WHERE client_id = p_client_id;
  EXCEPTION WHEN undefined_table THEN NULL; -- skip if table doesn't exist
  END;

  -- Boarding reservations tied to this client
  BEGIN
    DELETE FROM kennel_reservations WHERE client_id = p_client_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Vaccinations (through pets)
  BEGIN
    DELETE FROM vaccinations
    WHERE pet_id IN (SELECT id FROM pets WHERE client_id = p_client_id);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Chat memory / AI personalization tied to this client
  BEGIN
    DELETE FROM chat_memory WHERE client_id = p_client_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DELETE FROM messages WHERE client_id = p_client_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Pets belonging to this client
  DELETE FROM pets WHERE client_id = p_client_id;

  -- Finally: the client row itself
  DELETE FROM clients WHERE id = p_client_id;

  -- And the auth user if they had a portal login (frees up the email)
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;
END;
$function$;

-- Allow groomers to call this function
GRANT EXECUTE ON FUNCTION public.delete_client_and_auth(UUID) TO authenticated;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT proname FROM pg_proc WHERE proname = 'delete_client_and_auth';
-- ====================================================================
