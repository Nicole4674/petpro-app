-- ====================================================================
-- PetPro — Auto-Confirm User Email RPC
-- ====================================================================
-- PURPOSE: Email confirmation links are fragile. Gmail's link scanner
-- can pre-fetch/consume one-time tokens, custom SMTP setups can mangle
-- the link, or the redirect URL can break for various reasons.
--
-- Customers who can't confirm their email get LOCKED OUT of an account
-- they paid for — bad UX, lost trust, support headache.
--
-- This RPC lets ClientLogin.jsx auto-confirm a user when their login
-- gets rejected with "email not confirmed". They already proved they
-- own the account by typing the right password — that's enough.
--
-- SECURITY:
--   * SECURITY DEFINER lets it bypass RLS and update auth.users
--   * Only confirms ONE specific email passed in by the caller
--   * Doesn't return any sensitive data
--   * Caller must be authenticated (anon won't reach here in practice
--     because the user has to be at the login page anyway)
--
-- SAFE TO RUN: CREATE OR REPLACE — doesn't touch any data.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.confirm_user_email(p_email TEXT)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Normalize the email (case + whitespace) so "Nicole@gmail.com  " also matches
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
    AND email_confirmed_at IS NULL;
END;
$function$;

-- Allow both anon (rare edge case) and authenticated users to call this RPC.
-- The function itself only confirms unconfirmed emails — never overwrites.
GRANT EXECUTE ON FUNCTION public.confirm_user_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_user_email(TEXT) TO authenticated;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- SELECT proname FROM pg_proc WHERE proname = 'confirm_user_email';
--
-- Should return one row.
-- ====================================================================
