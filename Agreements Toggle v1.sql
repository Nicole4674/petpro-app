-- =============================================================================
-- Agreements Toggle v1
-- =============================================================================
-- Adds agreements_enabled boolean to shop_settings so each shop opts IN to
-- requiring clients to sign waivers at first portal login.
--
-- Default false — Nicole doesn't use waivers (and many groomers don't),
-- so it shouldn't fire by default. Shops that want them flip the toggle in
-- Shop Settings → ⚖️ Agreements section.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


alter table shop_settings
  add column if not exists agreements_enabled boolean default false;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings' and column_name = 'agreements_enabled';
