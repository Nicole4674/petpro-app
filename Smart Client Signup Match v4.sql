-- ====================================================================
-- PetPro — Smart Client Signup Match v4 (Promo/Referral + SMS Consent)
-- ====================================================================
-- v3 matched duplicates by email → phone → name. v4 keeps ALL of that
-- and fixes a capture gap found in promo testing (2026-06-10):
--
--   THE BUG: promo_code / referred_by_client_id / sms_consent ride in
--   the signup METADATA, but this trigger never copied them to the
--   clients row. The browser-side fallback update can't run either —
--   new signups have NO session until they verify their email, so RLS
--   blocks it. Result: every promo signup landed with promo_code NULL
--   and the reward never applied.
--
--   THE FIX: copy promo_code, referred_by_client_id, and sms_consent
--   from metadata right here in the trigger (SECURITY DEFINER — runs
--   with full rights, can't be blocked). Works on BOTH paths:
--     • brand-new client INSERT
--     • LINK to an existing unclaimed row (only fills fields that are
--       empty — never overwrites data the groomer already entered)
--
-- SAFE TO RUN: CREATE OR REPLACE only — doesn't touch any data.
-- Overwrites v3 in place. Requires Promo Referral Links Schema v1
-- (clients.promo_code etc.) to be run first.
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
  -- v4: promo / referral / consent from signup metadata
  v_promo_code          TEXT;
  v_ref_raw             TEXT;
  v_ref_client_id       UUID;
  v_sms_consent         BOOLEAN;
  v_sms_consent_at      TIMESTAMPTZ;
BEGIN
  -- Only run for portal signups (has groomer_id in metadata)
  IF NEW.raw_user_meta_data ? 'groomer_id' THEN
    v_groomer_id          := (NEW.raw_user_meta_data->>'groomer_id')::uuid;
    v_signup_email        := LOWER(TRIM(COALESCE(NEW.email, '')));
    v_signup_phone        := TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', ''));

    -- ── v4: promo / referral / consent extraction (all null-safe) ──
    v_promo_code := NULLIF(UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'promo_code', ''))), '');
    v_ref_raw    := TRIM(COALESCE(NEW.raw_user_meta_data->>'referred_by_client_id', ''));
    v_ref_client_id := NULL;
    IF v_ref_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ref_client_id := v_ref_raw::uuid;
    END IF;
    v_sms_consent := LOWER(COALESCE(NEW.raw_user_meta_data->>'sms_consent', 'false')) IN ('true', 't', '1');
    v_sms_consent_at := NULL;
    IF v_sms_consent THEN
      BEGIN
        v_sms_consent_at := COALESCE((NEW.raw_user_meta_data->>'sms_consent_at')::timestamptz, NOW());
      EXCEPTION WHEN OTHERS THEN
        v_sms_consent_at := NOW();
      END;
    END IF;

    -- Strip non-digits, then take the LAST 10 digits so country codes
    -- and extra prefixes don't break the match.
    v_signup_phone_digits := regexp_replace(v_signup_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_signup_phone_digits) >= 10 THEN
      v_signup_phone_last10 := RIGHT(v_signup_phone_digits, 10);
    ELSE
      v_signup_phone_last10 := v_signup_phone_digits;
    END IF;

    -- Split "Jane Smith" into first = 'Jane', last = 'Smith'.
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Client');
    v_space_pos := POSITION(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := TRIM(SUBSTRING(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name  := TRIM(SUBSTRING(v_full_name FROM v_space_pos + 1));
    ELSE
      v_first_name := v_full_name;
      v_last_name  := '';
    END IF;

    v_first_norm := LOWER(TRIM(COALESCE(v_first_name, '')));
    v_last_norm  := LOWER(TRIM(COALESCE(v_last_name, '')));

    -- ═══ STEP 1: EMAIL MATCH ═══
    IF v_signup_email <> '' THEN
      SELECT id INTO v_existing_client_id
      FROM clients
      WHERE groomer_id = v_groomer_id
        AND LOWER(TRIM(COALESCE(email, ''))) = v_signup_email
        AND user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- ═══ STEP 2: PHONE MATCH (last 10 digits) ═══
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

    -- ═══ STEP 3: NAME MATCH (first + last) ═══
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

    -- ═══ LINK or CREATE ═══
    IF v_existing_client_id IS NOT NULL THEN
      -- Matched → LINK. Fill promo/referral/consent ONLY where empty so
      -- we never clobber what the groomer (or a prior promo) set.
      UPDATE clients
      SET user_id         = NEW.id,
          portal_enabled  = true,
          self_signed_up  = false,
          email           = COALESCE(NULLIF(TRIM(email), ''), NEW.email),
          phone           = COALESCE(NULLIF(TRIM(phone), ''), v_signup_phone),
          promo_code      = COALESCE(promo_code, v_promo_code),
          referred_by_client_id = COALESCE(referred_by_client_id, v_ref_client_id),
          sms_consent     = COALESCE(sms_consent, false) OR v_sms_consent,
          sms_consent_at  = COALESCE(sms_consent_at, v_sms_consent_at)
      WHERE id = v_existing_client_id;
    ELSE
      -- No match → brand new clients row (now carries promo + consent)
      INSERT INTO clients (
        user_id,
        groomer_id,
        first_name,
        last_name,
        email,
        phone,
        portal_enabled,
        self_signed_up,
        promo_code,
        referred_by_client_id,
        sms_consent,
        sms_consent_at
      ) VALUES (
        NEW.id,
        v_groomer_id,
        v_first_name,
        v_last_name,
        NEW.email,
        v_signup_phone,
        true,
        true,
        v_promo_code,
        v_ref_client_id,
        v_sms_consent,
        v_sms_consent_at
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ====================================================================
-- VERIFY: should show v_promo_code in the function body
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--   WHERE proname = 'create_client_on_signup';
-- ====================================================================
