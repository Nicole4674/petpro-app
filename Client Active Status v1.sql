-- ====================================================================
-- PetPro — Add is_active column to clients table
-- ====================================================================
-- PURPOSE: MoeGo-style inactive/active client status. Clients default
-- to active. Nicole marks them inactive when they haven't been in a
-- while to keep the default list clean. Can be reactivated anytime.
-- No data is ever deleted — just hidden from the default view.
--
-- SAFE TO RUN: adds a column with a default of TRUE, so every existing
-- client row stays visible.
-- ====================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for fast filtering (active-only is the default list view)
CREATE INDEX IF NOT EXISTS idx_clients_active
  ON clients(groomer_id, is_active);

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name = 'is_active';
-- ====================================================================
