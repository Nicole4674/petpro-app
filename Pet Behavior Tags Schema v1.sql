-- ====================================================================
-- PetPro — Pet Behavior Tags
-- ====================================================================
-- Adds a TEXT[] column to pets for behavior/safety tags. Examples:
--   'bites', 'kennel_aggressive', 'dog_reactive', 'sound_sensitive',
--   'hates_clippers', 'hates_dryer', 'hates_nails', 'senior_care',
--   'special_meds', 'anxious'
--
-- The app shows these as colored warning pills on the calendar tile,
-- appointment popup, and kennel card so staff sees them BEFORE handling.
--
-- SAFE TO RUN: brand new column with default empty array. No data
-- changes, no constraints, totally additive.
-- ====================================================================

ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS behavior_tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN index for fast "find all pets with tag X" queries (e.g. for
-- reports like "show me all pets that bite").
CREATE INDEX IF NOT EXISTS idx_pets_behavior_tags
  ON pets USING GIN (behavior_tags);

-- ====================================================================
-- VERIFY
-- ====================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'pets' AND column_name = 'behavior_tags';
-- -- Should show: behavior_tags  ARRAY
-- ====================================================================
