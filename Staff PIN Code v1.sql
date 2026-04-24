-- ====================================================================
-- PetPro — Add PIN code to staff_members for kiosk clock-in
-- ====================================================================
-- PURPOSE: Let staff clock in at a lobby kiosk by typing a 4-digit PIN.
-- Quick, hygienic (no shared login needed), hard to forget.
--
-- DESIGN NOTES:
--   • PINs are 4-digit numeric (stored as TEXT for leading-zero safety)
--   • Unique PER SHOP (per groomer_id) so multiple shops can use 1234
--   • NULL-able so owner can add staff and assign a PIN later
--   • Stored in plaintext — this is a low-stakes clock-in PIN,
--     not a real password. Anyone with physical access to the lobby
--     could figure out a PIN anyway.
--
-- SAFE TO RUN: only adds a column, doesn't touch existing data.
-- ====================================================================

ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS pin_code TEXT;

-- Prevent duplicate PINs within the same shop (per groomer_id).
-- Multiple shops CAN share the same 4-digit PIN — that's fine.
DROP INDEX IF EXISTS idx_staff_pin_unique_per_shop;
CREATE UNIQUE INDEX idx_staff_pin_unique_per_shop
  ON staff_members (groomer_id, pin_code)
  WHERE pin_code IS NOT NULL;

-- Index for fast PIN lookup at the kiosk
CREATE INDEX IF NOT EXISTS idx_staff_pin_lookup
  ON staff_members (groomer_id, pin_code)
  WHERE pin_code IS NOT NULL;

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'staff_members' AND column_name = 'pin_code';
-- ====================================================================
