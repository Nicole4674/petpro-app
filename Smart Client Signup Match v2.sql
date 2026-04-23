-- ====================================================================
-- PetPro — Smart Client Signup Match v2 (Phone Fallback)
-- ====================================================================
-- PURPOSE: Extend the v1 match trigger so it ALSO checks phone number
-- when email matching fails. This covers the very common case where
-- Nicole's legacy clients were entered with just name + phone (no
-- email). When those clients sign up via the portal, email matching
-- alone returns no result → a duplicate row gets created.
--
-- NEW BEHAVIOR (match priority order):
--   1. Try EMAIL match first (most reliable, case/whitespace normalized)
--   2. If no email match, try PHONE match (digits-only normalized so
--      "(555) 123-4567" matches "555-123-4567" matches "5551234567")
--   3. If still no match, insert a brand new clients row
--
-- SAFETY RULES:
--   - Only matches UNCLAIMED rows (user_id IS NULL) — can't steal an
--     already-linked portal account
--   - Only matches rows belonging to the SAME groomer
--   - Phone must be at least 7 digits to match (prevents false matches
--     on partial numbers like "555")
--   - Prefers the OLDEST matching row (most history) if multiple
--   - When linking, fills in missing email / phone on legacy rows but
--     doesn't overwrite existing groomer-entered data
--
-- SAFE TO RUN: CREATE OR REPLACE only — doesn't touch any data.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_client_on_signup()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name           TEXT;
  v_first_name          TEXT;
  v_last_name           TEXT;
  v_space_pos           INTEGER;
  v_groomer_id          UUID;
  v_signup_email        TEXT;
  v_signup_phone        TEXT;
  v_signup_phone_digits TEXT;
  v_existing_client_id  UUID;
BEGIN
  -- Only run for portal signups (has groomer_id in metadata)
  IF NEW.raw_user_meta_data ? 'groomer_id' THEN
    v_groomer_id          := (NEW.raw_user_meta_data->>'groomer_id')::uuid;
    v_signup_email        := LOWER(TRIM(COALESCE(NEW.email, '')));
    v_signup_phone        := TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
    -- Strip all non-digit characters so "(555) 123-4567" matches "5551234567"
    v_signup_phone_digits := regexp_replace(v_signup_phone, '[^0-9]', '', 'g');

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
    -- STEP 1: Try to match by EMAIL first (most reliable key)
    -- ═══════════════════════════════════════════════════════════════
    IF v_signup_email <> '' THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND LOWER(TRIM(COALESCE(email, ''))) = v_signup_email
        AND user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 2: No email match? Try PHONE NUMBER (digits only, normalized)
    -- Covers legacy clients entered with only name + phone.
    -- ═══════════════════════════════════════════════════════════════
    IF v_existing_client_id IS NULL
       AND v_signup_phone_digits <> ''
       AND LENGTH(v_signup_phone_digits) >= 7
    THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_signup_phone_digits
        AND user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- LINK or CREATE
    -- ═══════════════════════════════════════════════════════════════
    IF v_existing_client_id IS NOT NULL THEN
      -- Matched → LINK the new auth user to the existing clients row.
      -- Preserves all their pets / appointments / payments / notes.
      -- Fills in email / phone ONLY if the old row was missing them.
      UPDATE clients
      SET user_id         = NEW.id,
          portal_enabled  = true,
          self_signed_up  = false,
          email           = COALESCE(NULLIF(TRIM(email), ''), NEW.email),
          phone           = COALESCE(NULLIF(TRIM(phone), ''), v_signup_phone)
      WHERE id = v_existing_client_id;
    ELSE
      -- No match → insert brand new clients row (original behavior)
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
        v_signup_phone,
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
-- Source should now include "v_signup_phone_digits" and "regexp_replace":
--
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc
--   WHERE proname = 'create_client_on_signup';
-- ====================================================================

-- ====================================================================
-- OPTIONAL: Run this to see legacy clients that will now auto-link
-- by phone when they sign up (clients with phone but no email or
-- user_id yet):
--
--   SELECT id, first_name, last_name, phone, email
--   FROM clients
--   WHERE groomer_id = auth.uid()
--     AND user_id IS NULL
--     AND phone IS NOT NULL
--     AND phone <> '';
-- ====================================================================
