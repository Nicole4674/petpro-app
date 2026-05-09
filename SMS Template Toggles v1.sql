-- =============================================================================
-- SMS Template Toggles v1
-- =============================================================================
-- Adds a per-template on/off switch so groomers can disable specific
-- automated SMS types they don't want (saves their monthly SMS allocation).
--
-- Schema: JSONB map keyed by template name → boolean.
--   { "reminder": true, "rebook_followup": false, "thank_you": false }
--
-- Defaults to {} (empty) so all templates are treated as ENABLED unless
-- explicitly set to false. This keeps existing groomers' behavior intact.
--
-- Enforced inside the send-sms edge function so it covers every automated
-- call site (reminder cron, rebook cron, future ones) in one place.
-- Manual SMS from the appointment popup quick-text dropdown is NOT gated —
-- groomers can always send a one-off message.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS sms_template_enabled JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Quick verify
-- select shop_name, sms_template_enabled from shop_settings limit 5;
