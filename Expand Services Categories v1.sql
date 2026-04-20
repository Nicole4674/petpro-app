-- ====================================================================
-- PetPro — Expand Services Category Constraint (Option C: Big list + "other")
-- ====================================================================
-- PURPOSE: The existing services_category_check constraint only allows
-- 4 categories (full_groom, bath_brush, puppy, add_on). This blocks
-- groomers from adding common services like Nail Trim, De-shed, etc.
--
-- This migration:
--   1. Drops the old constraint
--   2. Recreates it with 22 values covering all common grooming services
--   3. Includes "other" as an escape hatch for edge cases
--
-- SAFE TO RUN: existing rows (full_groom, bath_brush) are preserved.
-- ====================================================================

-- Step 1: Drop the old restrictive constraint
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;

-- Step 2: Add the expanded constraint
ALTER TABLE services ADD CONSTRAINT services_category_check CHECK (
  category = ANY (ARRAY[
    -- ─── Core grooming (already in use) ───
    'full_groom'::text,
    'bath_brush'::text,
    'puppy'::text,
    'add_on'::text,

    -- ─── Common standalone services ───
    'nail_trim'::text,
    'nail_filing'::text,
    'de_shed'::text,
    'teeth_brushing'::text,
    'ear_cleaning'::text,
    'anal_glands'::text,
    'flea_bath'::text,

    -- ─── Trim / scissor add-ons ───
    'face_trim'::text,
    'paw_pad_trim'::text,
    'sanitary_trim'::text,
    'hand_scissoring'::text,

    -- ─── Alt groom options ───
    'mini_groom'::text,
    'express_service'::text,

    -- ─── Specialty ───
    'special_shampoo'::text,
    'blueberry_facial'::text,
    'de_matting'::text,
    'bow_bandana'::text,

    -- ─── Escape hatch for anything we didn't predict ───
    'other'::text
  ])
);

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- Run this after to confirm the new constraint is active:
--
--   SELECT pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--   WHERE conrelid = 'services'::regclass
--     AND conname = 'services_category_check';
--
-- Should show the new expanded ARRAY.
-- ====================================================================

-- ====================================================================
-- ROLLBACK (only if something goes wrong — reverts to original 4-category list)
-- ====================================================================
-- ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;
-- ALTER TABLE services ADD CONSTRAINT services_category_check CHECK (
--   category = ANY (ARRAY['full_groom'::text, 'bath_brush'::text, 'puppy'::text, 'add_on'::text])
-- );
