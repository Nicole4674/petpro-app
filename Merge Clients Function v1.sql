-- ====================================================================
-- PetPro — merge_clients RPC function
-- ====================================================================
-- PURPOSE: Combine two client records into one. The source client's
-- pets, appointments, payments, notes, contacts, chat memory, etc.
-- all move to the target client. The source client row is then
-- deleted. If the source had a portal login (user_id) and the target
-- didn't, the login transfers to the target.
--
-- COMMON USE CASE: A new client signup creates a duplicate row
-- because phone/email didn't match your existing record. Merge the
-- duplicate INTO the original so they see their real pets/history
-- when they log in.
--
-- SECURITY: caller must own BOTH client records.
--
-- SAFE TO RUN: CREATE OR REPLACE — doesn't touch any data.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.merge_clients(
  p_source_id UUID,  -- the duplicate (gets deleted)
  p_target_id UUID   -- the keeper (receives all data)
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_source_user_id   UUID;
  v_target_user_id   UUID;
  v_owns_both        BOOLEAN;
  v_source_email     TEXT;
  v_source_phone     TEXT;
  v_source_first     TEXT;
  v_source_last      TEXT;
  v_source_address   TEXT;
BEGIN
  -- Safety: can't merge a client into itself
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge a client with itself';
  END IF;

  -- Security: caller must own BOTH clients
  SELECT (
    EXISTS(SELECT 1 FROM clients WHERE id = p_source_id AND groomer_id = auth.uid())
    AND
    EXISTS(SELECT 1 FROM clients WHERE id = p_target_id AND groomer_id = auth.uid())
  ) INTO v_owns_both;

  IF NOT v_owns_both THEN
    RAISE EXCEPTION 'Not authorized to merge these clients';
  END IF;

  -- Grab source's info (used for backfilling target + handling auth)
  SELECT user_id, email, phone, first_name, last_name, address
    INTO v_source_user_id, v_source_email, v_source_phone,
         v_source_first, v_source_last, v_source_address
  FROM clients WHERE id = p_source_id;

  SELECT user_id INTO v_target_user_id FROM clients WHERE id = p_target_id;

  -- ═══════════════════════════════════════════════════════════════
  -- Move all related data from source → target
  -- ═══════════════════════════════════════════════════════════════

  UPDATE pets            SET client_id = p_target_id WHERE client_id = p_source_id;
  UPDATE appointments    SET client_id = p_target_id WHERE client_id = p_source_id;
  UPDATE payments        SET client_id = p_target_id WHERE client_id = p_source_id;
  UPDATE notes           SET client_id = p_target_id WHERE client_id = p_source_id;
  UPDATE client_contacts SET client_id = p_target_id WHERE client_id = p_source_id;

  -- Optional tables — skip gracefully if they don't exist
  BEGIN UPDATE waitlist             SET client_id = p_target_id WHERE client_id = p_source_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE kennel_reservations  SET client_id = p_target_id WHERE client_id = p_source_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE chat_memory          SET client_id = p_target_id WHERE client_id = p_source_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE messages             SET client_id = p_target_id WHERE client_id = p_source_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- ═══════════════════════════════════════════════════════════════
  -- Handle the portal login (auth user)
  -- ═══════════════════════════════════════════════════════════════

  IF v_source_user_id IS NOT NULL AND v_target_user_id IS NULL THEN
    -- Source has a portal login, target doesn't → transfer it.
    -- Also backfill target with email/phone/address if those are missing.
    UPDATE clients
    SET user_id         = v_source_user_id,
        portal_enabled  = true,
        email           = COALESCE(NULLIF(TRIM(email), ''),   v_source_email),
        phone           = COALESCE(NULLIF(TRIM(phone), ''),   v_source_phone),
        address         = COALESCE(NULLIF(TRIM(address), ''), v_source_address)
    WHERE id = p_target_id;

    -- Null out source's user_id so we can delete the source row cleanly
    UPDATE clients SET user_id = NULL WHERE id = p_source_id;
  ELSIF v_source_user_id IS NOT NULL AND v_target_user_id IS NOT NULL THEN
    -- Both have portal logins — keep target's, delete source's auth user.
    DELETE FROM auth.users WHERE id = v_source_user_id;
  END IF;

  -- Final: delete the source clients row
  DELETE FROM clients WHERE id = p_source_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.merge_clients(UUID, UUID) TO authenticated;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT proname FROM pg_proc WHERE proname = 'merge_clients';
-- ====================================================================
