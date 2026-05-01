-- =============================================================================
-- Shop Mobile Toggle v1
-- =============================================================================
-- Adds is_mobile boolean to shop_settings so PetPro can hide mobile-only
-- features (Route page, drive-time padding warnings, ETA texts) from
-- storefront groomers who don't need them.
--
-- Default false — existing storefront shops keep the same UX they have today.
-- Mobile shops flip the toggle in Shop Settings → instantly see the Route
-- nav item appear in their sidebar.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


alter table shop_settings
  add column if not exists is_mobile boolean default false;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings' and column_name = 'is_mobile';
