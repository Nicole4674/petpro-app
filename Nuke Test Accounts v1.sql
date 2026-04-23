-- ====================================================================
-- PetPro — Nuke Test Accounts (Stripe test + portal verify test)
-- ====================================================================
-- PURPOSE: Remove leftover test accounts so you have ONE clean groomer
-- login (treadwell4674@gmail.com) going forward. Eliminates confusion
-- about which account owns what + fixes stale auth session issues.
--
-- WHAT GETS DELETED:
--   1. treadwell7777@gmail.com groomer account (Stripe test, Apr 22)
--      ID: f034fb19-9c6b-4332-ba24-d6981143dd25
--      Has: 0 clients, 0 pets, 0 appointments, 0 services, 0 staff,
--           0 shop_settings, 1 ai_usage row (safe to nuke)
--
--   2. Any CLIENTS created during email-verify testing today that
--      are NOT linked to a real client you care about.
--      (Optional — only delete if you tested with fake emails.)
--
-- WHAT STAYS: treadwell4674@gmail.com (your real account + all data).
-- ====================================================================

-- Step 1: Delete 7777 groomer account's dependent rows
DELETE FROM ai_usage  WHERE groomer_id = 'f034fb19-9c6b-4332-ba24-d6981143dd25';

-- Step 2: Delete the groomer row itself
DELETE FROM groomers  WHERE id = 'f034fb19-9c6b-4332-ba24-d6981143dd25';

-- Step 3: Delete the Supabase auth user (kills the login)
DELETE FROM auth.users WHERE id = 'f034fb19-9c6b-4332-ba24-d6981143dd25';

-- ====================================================================
-- OPTIONAL: Clean up test clients you created today for verify-flow testing
-- ====================================================================
-- Skip this block if every client in your DB is real.
-- Otherwise fill in the test email(s) you used and uncomment:
--
-- DELETE FROM client_contacts WHERE client_id IN (
--   SELECT id FROM clients WHERE email IN ('testclient@foo.com')
-- );
-- DELETE FROM clients WHERE email IN ('testclient@foo.com');
-- DELETE FROM auth.users WHERE email IN ('testclient@foo.com');

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- Should return only ONE row: treadwell4674@gmail.com
--
--   SELECT id, email, created_at FROM groomers ORDER BY created_at DESC;
-- ====================================================================
