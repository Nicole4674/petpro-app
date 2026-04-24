-- ====================================================================
-- PetPro — Smart Client Signup Match v3 (Name Fallback + Smarter Phone)
-- ====================================================================
-- PURPOSE: v2 matched duplicates by email → phone. But Nicole's tests
-- kept creating duplicates even when name + phone matched. Two likely
-- causes:
--   1. Phone mismatch due to country-code differences:
--        "18325551234" (signup with +1)  ≠  "8325551234" (groomer-entered)
--   2. Phone missing entirely on one side, email missing on the other.
--
-- v3 FIXES:
--   1. Normalize phone to the LAST 10 DIGITS — "1-832-555-1234" and
--      "(832) 555-1234" now both reduce to "8325551234" and match.
--   2. ADD a NAME-MATCH FALLBACK as the 3rd step. If email and phone
--      both fail, match on first_name + last_name (case-insensitive,
--      trimmed) for the same groomer. Safe because:
--        - last_name is now REQUIRED at signup (enforced in forms)
--        - only unclaimed rows (user_id IS NULL) can match
--        - same groomer_id only (no cross-shop matches)
--        - oldest row wins if multiple matches
--
-- NEW MATCH PRIORITY (top wins, falls through on no match):
--   1. Email (case/whitespace normalized)
--   2. Phone (last 10 digits, country-code tolerant)
--   3. NEW — first_name + last_name (both required, case-insensitive)
--
-- SAFE TO RUN: CREATE OR REPLACE only — doesn't touch any data.
-- Overwrites v2 in place.
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
  v_signup_phone_last10 TEXT;
  v_first_norm          TEXT;
  v_last_norm           TEXT;
  v_existing_client_id  UUID;
BEGIN
  -- Only run for portal signups (has groomer_id in metadata)
  IF NEW.raw_user_meta_data ? 'groomer_id' THEN
    v_groomer_id          := (NEW.raw_user_meta_data->>'groomer_id')::uuid;
    v_signup_email        := LOWER(TRIM(COALESCE(NEW.email, '')));
    v_signup_phone        := TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', ''));

    -- Strip non-digits, then take the LAST 10 digits so country codes
    -- and extra prefixes don't break the match.
    v_signup_phone_digits := regexp_replace(v_signup_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_signup_phone_digits) >= 10 THEN
      v_signup_phone_last10 := RIGHT(v_signup_phone_digits, 10);
    ELSE
      v_signup_phone_last10 := v_signup_phone_digits;
    END IF;

    -- Split "Jane Smith" into first = 'Jane', last = 'Smith'.
    -- If only one word was given, last_name stays empty (forms now
    -- block this case, but we still handle legacy data gracefully).
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Client');
    v_space_pos := POSITION(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := TRIM(SUBSTRING(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name  := TRIM(SUBSTRING(v_full_name FROM v_space_pos + 1));
    ELSE
      v_first_name := v_full_name;
      v_last_name  := '';
    END IF;

    -- Normalize names for matching (lowercase, trimmed)
    v_first_norm := LOWER(TRIM(COALESCE(v_first_name, '')));
    v_last_norm  := LOWER(TRIM(COALESCE(v_last_name, '')));

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 1: EMAIL MATCH (most reliable)
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
    -- STEP 2: PHONE MATCH (last 10 digits, country-code tolerant)
    -- Now uses RIGHT(digits, 10) on BOTH sides so "1-832-555-1234"
    -- matches "(832) 555-1234".
    -- ═══════════════════════════════════════════════════════════════
    IF v_existing_client_id IS NULL
       AND v_signup_phone_last10 <> ''
       AND LENGTH(v_signup_phone_last10) >= 7
    THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND user_id IS NULL
        AND phone IS NOT NULL
        AND phone <> ''
        AND RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = v_signup_phone_last10
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 3: NEW — NAME MATCH (first + last, case-insensitive)
    -- Last resort. Requires BOTH names non-empty on signup AND
    -- on the existing record, so we never accidentally match a
    -- "Jane" against a "Jane Smith".
    -- ═══════════════════════════════════════════════════════════════
    IF v_existing_client_id IS NULL
       AND v_first_norm <> ''
       AND v_last_norm  <> ''
    THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND user_id IS NULL
        AND LOWER(TRIM(COALESCE(first_name, ''))) = v_first_norm
        AND LOWER(TRIM(COALESCE(last_name,  ''))) = v_last_norm
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
-- Should see "v_signup_phone_last10" and "v_first_norm" in the output:
--
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc
--   WHERE proname = 'create_client_on_signup';
-- ====================================================================

-- ====================================================================
-- QUICK TEST PLAN (so you can verify v3 before merging old dupes)
-- ====================================================================
-- 1. Delete any test duplicate rows from your previous husband test
-- 2. Make sure his clients row still exists with just name + phone
-- 3. Have him try signup again with the SAME name + SAME phone +
--    a NEW email that's different than anything on his client row
-- 4. After signup, run this — should show ONE row, not two:
--      SELECT id, first_name, last_name, phone, email, user_id
--      FROM clients
--      WHERE groomer_id = auth.uid()
--        AND LOWER(first_name) = 'husband-first-name'
--        AND LOWER(last_name)  = 'husband-last-name';
-- ====================================================================
