-- ====================================================================
-- PetPro — Smart Client Signup Match (CRITICAL PRE-LAUNCH FIX)
-- ====================================================================
-- PURPOSE: Prevent duplicate client rows when an existing client (one
-- Nicole already manually entered) signs up for the client portal.
--
-- THE OLD TRIGGER (`create_client_on_signup`):
--   Blindly INSERTED a new `clients` row every time someone signed up
--   on the portal. If Nicole had already added "Sandy Mitch" to her
--   system, when Sandy signed up via the portal link, a SECOND row
--   got created. All of Sandy's history (pets, appointments, payments)
--   was stuck on the OLD row, while her portal login was tied to the
--   NEW empty one. Every client = potential duplicate.
--
-- THE NEW BEHAVIOR:
--   On signup, first LOOK for an existing clients row that:
--     • Has matching email (case/whitespace normalized)
--     • Belongs to the same groomer
--     • Has NO user_id yet (hasn't been claimed by another portal user)
--   If found → UPDATE that row to link it (preserves all history).
--   If NOT found → INSERT a new row (same as before — genuinely new).
--
-- EDGE CASE: if Nicole entered the client with a different email (or no
-- email at all), matching fails and a new row is created. She can then
-- merge manually from the groomer side (merge UI is a follow-up task).
-- To minimize this, make sure existing clients have accurate emails
-- BEFORE sending them signup links.
--
-- SAFE TO RUN: CREATE OR REPLACE only — doesn't touch any data or rows.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_client_on_signup()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_space_pos INTEGER;
  v_groomer_id UUID;
  v_signup_email TEXT;
  v_existing_client_id UUID;
BEGIN
  -- Only run for portal signups (has groomer_id in metadata)
  IF NEW.raw_user_meta_data ? 'groomer_id' THEN
    v_groomer_id   := (NEW.raw_user_meta_data->>'groomer_id')::uuid;
    v_signup_email := LOWER(TRIM(COALESCE(NEW.email, '')));

    -- Split "Jane Smith" into first_name = 'Jane', last_name = 'Smith'
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Client');
    v_space_pos := POSITION(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := TRIM(SUBSTRING(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name  := TRIM(SUBSTRING(v_full_name FROM v_space_pos + 1));
    ELSE
      v_first_name := v_full_name;
      v_last_name  := '';
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- SMART MATCH: look for an UNCLAIMED existing clients row (no user_id)
    -- belonging to this groomer with a matching email.
    -- If found, LINK it instead of creating a duplicate.
    -- ═══════════════════════════════════════════════════════════════
    IF v_signup_email <> '' THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND LOWER(TRIM(COALESCE(email, ''))) = v_signup_email
        AND user_id IS NULL
      ORDER BY created_at ASC   -- prefer the oldest (most history) if multiple
      LIMIT 1;
    END IF;

    IF v_existing_client_id IS NOT NULL THEN
      -- LINK: attach the new auth user to the existing client row.
      -- Preserves all their pets / appointments / payments / notes.
      -- Does NOT overwrite first_name / last_name / phone — groomer's
      -- entry is the source of truth (they know their clients).
      UPDATE clients
      SET user_id         = NEW.id,
          portal_enabled  = true,
          self_signed_up  = false  -- groomer added them first, client signed up after
      WHERE id = v_existing_client_id;
    ELSE
      -- NO MATCH: insert a brand new clients row (original behavior).
      INSERT INTO clients (
        user_id,
        groomer_id,
        first_name,
        last_name,
        email,
        phone,
        portal_enabled,
        self_signed_up
      ) VALUES (
        NEW.id,
        v_groomer_id,
        v_first_name,
        v_last_name,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        true,
        true
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- Check the updated function source — should include "v_existing_client_id"
--
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc
--   WHERE proname = 'create_client_on_signup';
--
-- And make sure the trigger is still wired up:
--
--   SELECT tgname, tgrelid::regclass
--   FROM pg_trigger
--   WHERE tgname = 'create_client_after_signup';
-- ====================================================================

-- ====================================================================
-- RUN THIS DIAGNOSTIC TO SEE WHICH EXISTING CLIENTS WOULD NOT MATCH
-- ====================================================================
-- Clients with no email on file will NOT auto-link when they sign up.
-- You'll want to add their emails BEFORE sending invites.
--
--   SELECT id, first_name, last_name, phone, email
--   FROM clients
--   WHERE groomer_id = auth.uid()
--     AND user_id IS NULL
--     AND (email IS NULL OR email = '');
-- ====================================================================
