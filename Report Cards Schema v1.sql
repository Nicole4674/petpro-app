-- ====================================================================
-- PetPro — Report Cards
-- ====================================================================
-- A "report card" is a per-pet summary the groomer fills out at the
-- end of a grooming appointment OR a boarding stay. Owners receive it
-- (printed or emailed) and love it — like a school report card for
-- their dog.
--
-- Each row is tied to either:
--   • an appointment (grooming)  → service_type = 'grooming'
--   • a boarding reservation     → service_type = 'boarding'
--
-- pet_id is NOT NULL because every report is about a specific pet.
-- For multi-pet appointments, ONE report card per pet is created.
--
-- SAFE TO RUN: brand new table, no existing data touched.
-- ====================================================================

CREATE TABLE IF NOT EXISTS report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id     UUID NOT NULL REFERENCES pets(id)       ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,

  -- Source link — one of these, not both
  appointment_id           UUID REFERENCES appointments(id)            ON DELETE CASCADE,
  boarding_reservation_id  UUID REFERENCES boarding_reservations(id)   ON DELETE CASCADE,

  service_type TEXT NOT NULL CHECK (service_type IN ('grooming', 'boarding')),

  -- Report contents
  services_performed TEXT,
  behavior_rating    TEXT CHECK (behavior_rating IN ('great', 'good', 'okay', 'anxious', 'difficult')),
  behavior_notes     TEXT,
  recommendations    TEXT,
  next_visit_weeks   INTEGER,                  -- 4, 6, 8 etc — null if not recommended
  photo_urls         TEXT[] NOT NULL DEFAULT '{}',
  groomer_name       TEXT,                     -- snapshot at time of writing

  -- Bookkeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_cards_groomer  ON report_cards(groomer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_cards_pet      ON report_cards(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_cards_client   ON report_cards(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_cards_appt     ON report_cards(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_cards_boarding ON report_cards(boarding_reservation_id) WHERE boarding_reservation_id IS NOT NULL;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_report_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_cards_updated_at ON report_cards;
CREATE TRIGGER trg_report_cards_updated_at
  BEFORE UPDATE ON report_cards
  FOR EACH ROW EXECUTE FUNCTION update_report_cards_updated_at();

-- Row-Level Security
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own report cards" ON report_cards;
CREATE POLICY "Owners manage own report cards"
  ON report_cards FOR ALL
  TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

DROP POLICY IF EXISTS "Staff manage shop report cards" ON report_cards;
CREATE POLICY "Staff manage shop report cards"
  ON report_cards FOR ALL
  TO authenticated
  USING (
    groomer_id IN (
      SELECT groomer_id FROM staff_members WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    groomer_id IN (
      SELECT groomer_id FROM staff_members WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients view own report cards" ON report_cards;
CREATE POLICY "Clients view own report cards"
  ON report_cards FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- ====================================================================
-- VERIFY
-- ====================================================================
-- SELECT COUNT(*) FROM report_cards;  -- should be 0
-- SELECT polname FROM pg_policy WHERE polrelid = 'report_cards'::regclass;
-- ====================================================================
