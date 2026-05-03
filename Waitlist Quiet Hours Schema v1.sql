-- =============================================================================
-- Waitlist Quiet Hours Schema v1
-- =============================================================================
-- Adds 3 columns to shop_settings so each shop can configure their own
-- quiet hours + timezone for waitlist auto-notify messages.
--
-- BEFORE:
--   waitlist-notify edge function hardcoded 9 AM - 8 PM in America/Chicago
--
-- AFTER:
--   Each shop sets their own window + timezone in Shop Settings UI.
--   Defaults: 9 AM - 8 PM, America/Chicago (matches old behavior so no one
--   gets surprised on launch — they only need to change if they want different).
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- Quiet hours window. Stored as 24-hour ints (0-23). Messages only send
-- when current hour in the shop's timezone is >= start AND < end.
alter table shop_settings
  add column if not exists waitlist_quiet_start_hour int default 9
    check (waitlist_quiet_start_hour >= 0 and waitlist_quiet_start_hour <= 23);

alter table shop_settings
  add column if not exists waitlist_quiet_end_hour int default 20
    check (waitlist_quiet_end_hour >= 0 and waitlist_quiet_end_hour <= 23);

-- IANA timezone name (e.g. 'America/Chicago', 'America/New_York', 'America/Los_Angeles').
-- Defaults to America/Chicago for backwards compatibility with the hardcoded version.
alter table shop_settings
  add column if not exists waitlist_timezone text default 'America/Chicago';


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings'
--   and column_name in ('waitlist_quiet_start_hour', 'waitlist_quiet_end_hour', 'waitlist_timezone');
