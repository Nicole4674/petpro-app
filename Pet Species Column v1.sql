-- ============================================================================
-- Pet Species Column v1
-- ============================================================================
-- Adds a `species` column to the pets table so we can filter the breed picker
-- by Dog or Cat (MoeGo-style). Defaults to 'dog' for all existing pets so
-- nothing breaks. Locked to dog/cat with a CHECK constraint.
--
-- HOW TO RUN:
--   1. Open Supabase → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. You should see "Success. No rows returned" — that's the goal.
-- ============================================================================

ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS species TEXT NOT NULL DEFAULT 'dog'
  CHECK (species IN ('dog', 'cat'));

-- Optional: index in case we ever filter pets by species in queries.
-- Cheap to keep; safe to skip.
CREATE INDEX IF NOT EXISTS idx_pets_species ON pets (species);
