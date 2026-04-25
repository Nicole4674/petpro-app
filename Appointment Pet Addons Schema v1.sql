-- ====================================================================
-- PetPro — Appointment Pet Add-ons (Multi-Service Per Pet)
-- ====================================================================
-- PURPOSE: A single pet at a single appointment can need MORE than
-- one service. Common case:
--   • Primary: Full Groom Medium    ($60)
--   • Add-on:  Dematting Fee        ($15)
--   • Add-on:  Nail Dremel          ($10)
--   • Add-on:  Handling Fee         ($20)
--   = $105 total
--
-- Existing model: appointment_pets has ONE service_id per pet.
-- New model:      appointment_pets keeps the PRIMARY service.
--                 appointment_pet_addons holds any number of EXTRA services.
--
-- Total appt price = sum(primary services) + sum(add-on services)
--
-- WHY this model (instead of multiple appointment_pets rows for same pet):
--   * Calendar tile shows "Bella" once, not "Bella, Bella, Bella"
--   * Owner clearly sees one primary service + N add-ons in popup
--   * Reports separate primary revenue from add-on revenue cleanly
--
-- SAFE TO RUN: brand new table, no existing data touched.
-- ====================================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS appointment_pet_addons (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_pet_id UUID NOT NULL REFERENCES appointment_pets(id) ON DELETE CASCADE,
  service_id         UUID NOT NULL REFERENCES services(id),
  quoted_price       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  groomer_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_addons_apt_pet  ON appointment_pet_addons(appointment_pet_id);
CREATE INDEX IF NOT EXISTS idx_addons_groomer  ON appointment_pet_addons(groomer_id);
CREATE INDEX IF NOT EXISTS idx_addons_service  ON appointment_pet_addons(service_id);

-- Step 3: Row-Level Security
ALTER TABLE appointment_pet_addons ENABLE ROW LEVEL SECURITY;

-- Owner (shop) can fully manage their own add-ons
DROP POLICY IF EXISTS "Owners manage own addons" ON appointment_pet_addons;
CREATE POLICY "Owners manage own addons"
  ON appointment_pet_addons FOR ALL
  TO authenticated
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

-- Staff can view + insert + update + delete add-ons for their shop
-- (so a staff member can add a dematting fee mid-groom when they
-- discover the dog is matted, etc.)
DROP POLICY IF EXISTS "Staff manage shop addons" ON appointment_pet_addons;
CREATE POLICY "Staff manage shop addons"
  ON appointment_pet_addons FOR ALL
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

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- SELECT COUNT(*) FROM appointment_pet_addons;  -- should be 0
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'appointment_pet_addons'
-- ORDER BY ordinal_position;
-- -- Should show: id, appointment_pet_id, service_id, quoted_price,
-- --              groomer_id, created_at
--
-- SELECT polname FROM pg_policy
-- WHERE polrelid = 'appointment_pet_addons'::regclass;
-- -- Should show 2 policies
-- ====================================================================
