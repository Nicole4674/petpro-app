-- =============================================================================
-- Late Warnings Toggle v1
-- =============================================================================
-- Adds late_warnings_enabled boolean to shop_settings so mobile groomers can
-- opt IN to "you're running late" warnings on the Route page.
--
-- Default false — every groomer already knows they're running late by looking
-- at the clock. The warning would frustrate most groomers, so it's off by
-- default. The Route page checks this flag before showing any late banner.
--
-- Mobile groomers who WANT the heads-up flip the toggle in Shop Settings →
-- they then see late warnings + ETA predictions powered by GPS + Google
-- Distance Matrix.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


alter table shop_settings
  add column if not exists late_warnings_enabled boolean default false;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings' and column_name = 'late_warnings_enabled';
