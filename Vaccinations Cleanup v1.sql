-- =======================================================
-- PetPro Vaccinations Cleanup
-- Run this in Supabase SQL Editor (after Vaccinations Schema v1.sql)
-- 1. Adds vet_clinic + document_url columns to the new vaccinations table
-- 2. Drops the old pet_vaccinations table (legacy, no multi-tenancy, had test data only)
-- =======================================================

-- 1. Add two more columns to the new vaccinations table
ALTER TABLE vaccinations
  ADD COLUMN IF NOT EXISTS vet_clinic TEXT,
  ADD COLUMN IF NOT EXISTS document_url TEXT;

-- 2. Drop the old table (2 test rows get dropped with it — no real data loss)
DROP TABLE IF EXISTS pet_vaccinations;
