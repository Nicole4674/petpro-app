-- =============================================================================
-- Per Appointment Mobile Flag v1
-- =============================================================================
-- Adds is_mobile_visit boolean to appointments + boarding_reservations so
-- hybrid shops (some pickup/drop-off, some storefront-only) can flag JUST
-- the mobile visits to show on the Route page. Storefront appointments
-- stay on the Calendar only.
--
-- WHY:
--   • Many groomers run hybrid: some clients pay extra for pickup, others
--     drop off at the salon
--   • Without a per-appointment flag, the Route page shows ALL appointments
--     including storefront ones (wrong)
--   • Per-appointment flag lets the groomer mark "this one is mobile" in
--     the booking modal — only those appear on the Route
--
-- DEFAULT: false
--   • Existing appointments stay non-mobile (storefront)
--   • New appointments default to non-mobile too — groomer ticks the box
--     when needed
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


alter table appointments
  add column if not exists is_mobile_visit boolean default false;

alter table boarding_reservations
  add column if not exists is_mobile_visit boolean default false;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name in ('appointments', 'boarding_reservations')
--   and column_name = 'is_mobile_visit';
