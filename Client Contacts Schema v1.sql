-- ====================================================================
-- PetPro — Client Contacts Table (Task #97 + #98)
-- ====================================================================
-- PURPOSE: Let each client have MULTIPLE additional contacts beyond
-- their own primary phone/email. Real-world use cases:
--   • "My mom picks Bailey up on Tuesdays — here's her number"
--   • "I'm out of town, my sitter is bringing Max in at 555-..."
--   • "In an emergency, call my vet at Dr. Smith Vet 555-..."
--   • "Husband picks up — he's at a different number"
--
-- This covers BOTH launch-blocker tasks:
--   #97 — Multi-contact support
--   #98 — Emergency contact (folded in via is_emergency flag)
--
-- The client's OWN primary contact info stays on the `clients` table.
-- This table is ONLY for additional people.
--
-- SAFE TO RUN: brand new table, doesn't touch any existing data.
-- ====================================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Who they are
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,

  -- What their role is in the client's life
  -- Freeform so groomers can type anything (Spouse / Pickup person /
  -- Pet sitter / Vet / Dad / Dogwalker / etc.)
  relationship TEXT,

  -- Emergency contact flag — ONE person (or more) per client can be
  -- marked. Checked first in urgent situations.
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,

  -- Are they authorized to drop off / pick up the pet?
  -- Default TRUE because most extra contacts added ARE pickup people.
  can_pickup BOOLEAN NOT NULL DEFAULT TRUE,

  -- Freeform notes — e.g. "Only picks up Tuesdays", "Call after 5pm only"
  notes TEXT,

  -- Bookkeeping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id
  ON client_contacts(client_id);

-- Emergency contact lookups — "who do I call for this client NOW"
CREATE INDEX IF NOT EXISTS idx_client_contacts_emergency
  ON client_contacts(client_id)
  WHERE is_emergency = TRUE;

-- Step 3: Auto-update `updated_at` trigger so we know when a contact
-- was last edited
CREATE OR REPLACE FUNCTION update_client_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_client_contacts_updated_at();

-- Step 4: Enable Row-Level Security (RLS)
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- GROOMER-SIDE POLICIES: groomers manage contacts for THEIR clients
-- ====================================================================

DROP POLICY IF EXISTS "Groomers view contacts for own clients" ON client_contacts;
CREATE POLICY "Groomers view contacts for own clients"
  ON client_contacts FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Groomers insert contacts for own clients" ON client_contacts;
CREATE POLICY "Groomers insert contacts for own clients"
  ON client_contacts FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Groomers update contacts for own clients" ON client_contacts;
CREATE POLICY "Groomers update contacts for own clients"
  ON client_contacts FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Groomers delete contacts for own clients" ON client_contacts;
CREATE POLICY "Groomers delete contacts for own clients"
  ON client_contacts FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

-- ====================================================================
-- CLIENT-PORTAL POLICIES: logged-in clients manage their OWN contacts
-- ====================================================================

DROP POLICY IF EXISTS "Clients view own contacts" ON client_contacts;
CREATE POLICY "Clients view own contacts"
  ON client_contacts FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients insert own contacts" ON client_contacts;
CREATE POLICY "Clients insert own contacts"
  ON client_contacts FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients update own contacts" ON client_contacts;
CREATE POLICY "Clients update own contacts"
  ON client_contacts FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients delete own contacts" ON client_contacts;
CREATE POLICY "Clients delete own contacts"
  ON client_contacts FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- Run this after to confirm the table exists and is empty:
--
--   SELECT COUNT(*) AS row_count FROM client_contacts;
--   -- Should return: 0
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'client_contacts'
--   ORDER BY ordinal_position;
--   -- Should show all 11 columns
--
--   SELECT polname FROM pg_policy WHERE polrelid = 'client_contacts'::regclass;
--   -- Should show 8 policies (4 groomer + 4 client)
-- ====================================================================

-- ====================================================================
-- ROLLBACK (only if something goes wrong)
-- ====================================================================
-- DROP TABLE IF EXISTS client_contacts CASCADE;
-- DROP FUNCTION IF EXISTS update_client_contacts_updated_at();
