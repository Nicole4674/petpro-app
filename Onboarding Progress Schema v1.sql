-- =============================================================================
-- Onboarding Progress Schema v1
-- =============================================================================
-- Adds two columns to shop_settings so the new-shop wizard can:
--   1. Remember which step the groomer is on (resume if they bail)
--   2. Mark when they've finished the wizard (so we don't show it again)
--
-- Existing shops (anyone who signed up before the wizard launched) are
-- treated as "already completed" — we backfill onboarding_completed_at to
-- their shop_settings.created_at so they go straight to the dashboard,
-- never see the wizard.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- Which step the groomer is currently on (0-7 for the 8 steps, or null if
-- they haven't started yet). Lets us resume on the right step if they
-- close the tab mid-wizard.
alter table shop_settings
  add column if not exists onboarding_step int default 0
    check (onboarding_step >= 0 and onboarding_step <= 8);

-- Timestamp of when they finished the wizard. NULL = still in onboarding.
-- Set on the final "Done" step. The route gate uses this to decide whether
-- to send a logged-in groomer to /onboarding or to the dashboard.
alter table shop_settings
  add column if not exists onboarding_completed_at timestamptz;

-- Optional: track which migration source they came from (if any) so we can
-- analyze conversion later. Set in step 1 if they say "yes I'm migrating".
alter table shop_settings
  add column if not exists onboarding_migration_source text;
  -- Examples: 'moego', 'gingr', 'pawfinity', 'paper', 'spreadsheet', 'other'

-- =============================================================================
-- Backfill: existing shops are "done" — they never saw a wizard, don't show
-- them one now. Mark them complete using their original signup timestamp
-- (or now() as a fallback if created_at isn't tracked).
-- =============================================================================
update shop_settings
set onboarding_completed_at = coalesce(created_at, now())
where onboarding_completed_at is null;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings'
--   and column_name in ('onboarding_step', 'onboarding_completed_at', 'onboarding_migration_source');
--
-- select count(*) as backfilled_shops
-- from shop_settings
-- where onboarding_completed_at is not null;
