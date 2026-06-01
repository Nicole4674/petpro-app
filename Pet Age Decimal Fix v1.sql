-- =============================================================================
-- Pet Age Decimal Fix v1
-- =============================================================================
-- Bug: entering a puppy in MONTHS (e.g. 9 months) failed with
--   "invalid input syntax for type integer: '0.75'"
-- Cause: the app stores age as DECIMAL YEARS (9 months = 0.75, 6 months = 0.5),
--   but the pets.age column was created as INTEGER, which rejects fractions.
-- Fix: change pets.age to numeric so fractional/puppy ages save correctly.
--   Existing whole-number ages convert cleanly (no data loss).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → paste → Run.
-- =============================================================================

alter table pets
  alter column age type numeric using age::numeric;
