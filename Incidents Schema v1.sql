-- ====================================================================
-- PetPro — Incidents Table (Animal Safety + Liability Documentation)
-- ====================================================================
-- PURPOSE: Track any incident involving a pet, staff, or property at
-- the shop or during boarding. Covers bites, injuries, medical events,
-- escape attempts, property damage, and behavior concerns.
--
-- WHY THIS MATTERS FOR A GROOMING/BOARDING BUSINESS:
--   • Insurance documentation (bites, vet visits, worker injuries)
--   • Legal protection (client disputes, liability claims)
--   • Pet medical history (seizures, allergies spotted)
--   • Staff safety warnings ("this dog bit last time")
--   • Client communication record (was the owner notified?)
--   • Employee HR files (if an animal injures a staff member)
--
-- PRINTABLE: incidents can be printed and filed physically for
-- employee records (bite reports go in HR files, etc.).
--
-- SAFE TO RUN: brand new table, no existing data touched.
-- ====================================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who/what the incident involves (pet + client always required)
  pet_id         UUID NOT NULL REFERENCES pets(id)         ON DELETE CASCADE,
  client_id      UUID NOT NULL REFERENCES clients(id)      ON DELETE CASCADE,
  appointment_id UUID          REFERENCES appointments(id) ON DELETE SET NULL,
  staff_id       UUID          REFERENCES staff_members(id) ON DELETE SET NULL,

  -- Incident classification
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'bite', 'injury', 'medical', 'behavior', 'escape', 'property_damage', 'other'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'serious')),

  -- When
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  incident_time TIME,

  -- What happened
  description  TEXT NOT NULL,
  action_taken TEXT,

  -- Client notification tracking
  client_notified     BOOLEAN NOT NULL DEFAULT FALSE,
  client_notified_at  TIMESTAMPTZ,
  client_notified_by  TEXT,     -- name of person who notified the client

  -- Follow-up tracking
  follow_up_needed BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_notes  TEXT,

  -- Who reported (the person logging the incident — groomer or staff)
  reported_by_auth_id UUID,     -- auth user id at time of report
  reported_by_name    TEXT,     -- snapshot of name (survives even if staff leaves)

  -- Photo URLs (reuse existing photo upload infrastructure)
  photo_urls TEXT[] NOT NULL DEFAULT '{}',

  -- Bookkeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Indexes
CREATE INDEX IF NOT EXISTS idx_incidents_pet      ON incidents(pet_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_client   ON incidents(client_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_staff    ON incidents(staff_id, incident_date DESC) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_groomer  ON incidents(groomer_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_followup ON incidents(groomer_id) WHERE follow_up_needed = TRUE;

-- Step 3: Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_incidents_updated_at();

-- Step 4: Row-Level Security
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Groomer (owner) full access to their own shop's incidents
DROP POLICY IF EXISTS "Groomers manage own incidents" ON incidents;
CREATE POLICY "Groomers manage own incidents"
  ON incidents FOR ALL
  TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

-- Staff can view incidents for their shop (read-only for now)
-- This lets staff see past incidents on pets they're handling
DROP POLICY IF EXISTS "Staff view shop incidents" ON incidents;
CREATE POLICY "Staff view shop incidents"
  ON incidents FOR SELECT
  TO authenticated
  USING (
    groomer_id IN (
      SELECT groomer_id FROM staff_members WHERE auth_user_id = auth.uid()
    )
  );

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT COUNT(*) FROM incidents;  -- should be 0
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'incidents'
--   ORDER BY ordinal_position;
--   -- Should show all 20+ columns
--
--   SELECT polname FROM pg_policy WHERE polrelid = 'incidents'::regclass;
-- ====================================================================
