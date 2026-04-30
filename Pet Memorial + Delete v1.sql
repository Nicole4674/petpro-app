-- =============================================================================
-- Pet Memorial + Delete v1
-- =============================================================================
-- Adds memorial support to the pets table so groomers + clients can mark a
-- pet as "passed away" (preserves history) or "remove" (hard delete).
--
-- Two new columns on pets:
--   • is_memorial    boolean — TRUE when the pet has passed away. UI shows
--                              them in a "🌈 Pets We Remember" section.
--   • memorial_date  timestamptz — when the pet was marked as passed.
--
-- Memorial pets get filtered out of:
--   - Booking dropdowns (Calendar, BoardingCalendar)
--   - Active pets lists
--   - Client portal "your pets" list
-- But still visible in:
--   - Pet history / past appointments
--   - "Pets We Remember" memorial section
--   - Photo + report card history
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Add the memorial columns (safe to re-run — uses IF NOT EXISTS)
alter table pets
  add column if not exists is_memorial boolean default false;

alter table pets
  add column if not exists memorial_date timestamptz;


-- 2. Index for fast filtering. Most queries want active pets only,
--    so the partial index keeps the normal lookup fast.
create index if not exists idx_pets_is_memorial
  on pets (is_memorial)
  where is_memorial = true;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'pets'
--   and column_name in ('is_memorial', 'memorial_date');
