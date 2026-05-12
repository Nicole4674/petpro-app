-- =============================================================================
-- Waitlist SMS Offer v1
-- =============================================================================
-- Adds the columns the auto-fill-on-cancellation feature needs:
--   1. shop_settings.cancellation_offer_expiry_minutes — per-groomer
--      configurable offer window. Default 60 min. Busier shops can shorten
--      to 30 to push faster; quieter shops can extend.
--   2. grooming_waitlist.offered_via — track HOW the offer was sent
--      ('chat' = client portal AI, 'sms' = automated text, 'manual' =
--      groomer told them by phone). Useful for analytics.
--   3. grooming_waitlist.offer_attempts — how many times we've offered
--      this person a slot. Lets us deprioritize people who keep declining
--      after, say, 3 misses.
--
-- ADDITIVE only — won't break existing waitlist behavior.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file → Run
--   3. Should see "Success. No rows returned"
-- =============================================================================

-- ─── 1. Per-shop offer expiry window ───────────────────────────────────
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS cancellation_offer_expiry_minutes INT NOT NULL DEFAULT 60;

COMMENT ON COLUMN shop_settings.cancellation_offer_expiry_minutes IS
  'How long a cancelled-slot offer stays open (in minutes) before timing out and rolling to the next waitlist person. Default 60. Groomer can set lower (faster) or higher (more chill) in Shop Settings.';

-- ─── 2. Track HOW an offer was made (chat, sms, manual) ─────────────
ALTER TABLE grooming_waitlist
  ADD COLUMN IF NOT EXISTS offered_via TEXT;

-- Use a check constraint so weird values can't sneak in
ALTER TABLE grooming_waitlist
  DROP CONSTRAINT IF EXISTS grooming_waitlist_offered_via_check;
ALTER TABLE grooming_waitlist
  ADD CONSTRAINT grooming_waitlist_offered_via_check
  CHECK (offered_via IS NULL OR offered_via IN ('chat', 'sms', 'manual'));

-- ─── 3. Offer attempts counter (anti-spam, deprioritize ghost replies) ──
ALTER TABLE grooming_waitlist
  ADD COLUMN IF NOT EXISTS offer_attempts INT NOT NULL DEFAULT 0;

-- Quick verify
-- select shop_name, cancellation_offer_expiry_minutes from shop_settings limit 5;
-- select id, status, offered_via, offer_attempts from grooming_waitlist limit 5;
