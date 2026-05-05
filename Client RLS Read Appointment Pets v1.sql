-- =============================================================================
-- Client RLS Read Appointment Pets v1
-- =============================================================================
-- BUG: clients viewing the portal saw only ONE pet on multi-pet bookings, and
-- the Pay Now button showed the wrong (single-pet) total. Root cause: there
-- was no RLS policy letting clients SELECT their own appointment_pets rows.
-- The join in the portal query silently returned 0 rows → fell back to the
-- legacy `appointments.pet_id` (just the primary pet).
--
-- Existing policy (groomer side, untouched):
--   "Groomers manage their own appointment pets"
--     using (groomer_id = auth.uid())
--
-- Adds: a SELECT-only policy so a logged-in client can read appointment_pets
-- rows where the parent appointment belongs to them via clients.user_id.
-- (Clients still cannot INSERT / UPDATE / DELETE these rows — only SELECT.)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- Drop first if a partially-applied version is sitting there (safe no-op otherwise)
drop policy if exists "Clients read their own appointment pets" on appointment_pets;

create policy "Clients read their own appointment pets"
  on appointment_pets
  for select
  to authenticated
  using (
    exists (
      select 1
      from appointments a
      join clients c on c.id = a.client_id
      where a.id = appointment_pets.appointment_id
        and c.user_id = auth.uid()
    )
  );


-- =============================================================================
-- Optional verify
-- =============================================================================
-- After running, this should now show TWO policies on appointment_pets:
--   1. "Groomers manage their own appointment pets" (existing, ALL)
--   2. "Clients read their own appointment pets"   (new, SELECT)
--
-- select policyname, cmd, qual::text
-- from pg_policies
-- where tablename = 'appointment_pets';
