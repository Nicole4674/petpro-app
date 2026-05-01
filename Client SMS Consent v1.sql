-- =============================================================================
-- Client SMS Consent v1
-- =============================================================================
-- Adds two columns to clients so we can track SMS opt-in consent:
--   sms_consent       — true when client checks the SMS box at signup
--   sms_consent_at    — timestamp of when they consented (audit trail for TCR)
--
-- Default false — clients OPT IN, never OPT OUT. This is the legal-compliant
-- pattern Twilio's TCR (The Campaign Registry) requires for A2P 10DLC approval.
--
-- We aren't sending SMS yet — this is purely the consent record so TCR can
-- verify the opt-in flow when reviewing our resubmitted campaign. Future SMS
-- sends will check sms_consent = true before firing.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


alter table clients
  add column if not exists sms_consent boolean default false,
  add column if not exists sms_consent_at timestamptz;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'clients'
--   and column_name in ('sms_consent', 'sms_consent_at');
