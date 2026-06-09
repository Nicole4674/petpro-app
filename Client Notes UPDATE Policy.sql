-- =======================================================
-- PetPro — Allow editing client/grooming notes
-- Run this once in the Supabase SQL Editor.
--
-- The client_notes table already allows view / add / delete,
-- but was missing an UPDATE policy, so edits silently did
-- nothing. This adds the missing UPDATE permission.
-- =======================================================

CREATE POLICY "Users can update their own client notes"
  ON client_notes FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE groomer_id = auth.uid()
    )
  );
