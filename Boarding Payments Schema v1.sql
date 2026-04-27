-- =============================================================================
-- Boarding Payments Schema v1
-- =============================================================================
-- Brings boarding into the same payment flow as grooming. The payments table
-- gets a new optional column `boarding_reservation_id` so each payment row
-- can link to either:
--   • an appointment_id  (grooming payment), OR
--   • a boarding_reservation_id  (boarding payment)
--
-- A payment row should have exactly ONE of those set (not both, not neither).
-- We enforce that with a CHECK constraint so bad data can't sneak in.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- 1. Add the new optional column
alter table payments
  add column if not exists boarding_reservation_id uuid
    references boarding_reservations(id) on delete cascade;


-- 2. Index for fast lookups by boarding reservation (e.g. "list all payments
--    for this stay")
create index if not exists idx_payments_boarding_reservation_id
  on payments(boarding_reservation_id)
  where boarding_reservation_id is not null;


-- 3. CHECK constraint — exactly one of (appointment_id, boarding_reservation_id)
--    must be set. Drop the old constraint first if it exists, then add fresh.
alter table payments
  drop constraint if exists payments_target_check;

alter table payments
  add constraint payments_target_check
  check (
    (appointment_id is not null and boarding_reservation_id is null)
    or
    (appointment_id is null and boarding_reservation_id is not null)
  );


-- 4. RLS — make sure the existing payments policies allow boarding payments
--    too. The existing policies are likely keyed on groomer_id which we
--    already have, so they should keep working unchanged. Verify by running:
--
-- select policyname, qual from pg_policies where tablename = 'payments';
--
--    If RLS denies inserts when boarding_reservation_id is set, we'd need
--    to update the policy. Most likely it works as-is since the existing
--    ones check groomer_id (which we still set on every insert).


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'payments' and column_name = 'boarding_reservation_id';
