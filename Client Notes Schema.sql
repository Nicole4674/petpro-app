-- =======================================================
-- PetPro Client Notes Table
-- Run this in Supabase SQL Editor
-- Supports both Client Notes and Grooming Notes
-- =======================================================

-- Create client_notes table if it doesn't exist
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pet_id UUID REFERENCES pets(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'client'
    CHECK (note_type IN ('client', 'grooming')),
  created_by UUID REFERENCES groomers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by client
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_pet_id ON client_notes(pet_id);

-- RLS Policy (basic - allow authenticated users)
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own client notes"
  ON client_notes FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own client notes"
  ON client_notes FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own client notes"
  ON client_notes FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );
