-- =======================================================
-- PetPro Vaccinations Table
-- Run this in Supabase SQL Editor
-- Tracks individual vaccine records per pet (Rabies, DHPP, Bordetella, etc.)
-- Required for legal compliance at boarding and grooming shops.
-- Supports dogs and cats. Bordetella enforces a configurable wait period.
-- =======================================================

-- 1. Vaccinations table (one row per shot per pet)
CREATE TABLE IF NOT EXISTS vaccinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vaccine_type TEXT NOT NULL
    CHECK (vaccine_type IN (
      'rabies',
      'dhpp',
      'bordetella',
      'canine_influenza',
      'leptospirosis',
      'lyme',
      'fvrcp',
      'felv',
      'other'
    )),
  vaccine_label TEXT,                -- display name for "other" (e.g., "Giardia", "Rattlesnake")
  expiry_date DATE NOT NULL,         -- when the shot runs out
  date_administered DATE,            -- when it was given; optional for most, prompted for bordetella (7-day wait rule)
  notes TEXT,                        -- "1-year rabies" vs "3-year rabies", vet name, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups (per pet, per groomer, and by expiry for reminder queries)
CREATE INDEX IF NOT EXISTS idx_vaccinations_pet_id ON vaccinations(pet_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_groomer_id ON vaccinations(groomer_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_expiry ON vaccinations(expiry_date);

-- 2. Bordetella wait-day config (per shop, how many days after the shot before boarding is allowed)
ALTER TABLE boarding_settings
  ADD COLUMN IF NOT EXISTS bordetella_wait_days INT DEFAULT 7;

-- 3. RLS Policies
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vaccinations"
  ON vaccinations FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Users can insert their own vaccinations"
  ON vaccinations FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Users can update their own vaccinations"
  ON vaccinations FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Users can delete their own vaccinations"
  ON vaccinations FOR DELETE
  USING (groomer_id = auth.uid());
