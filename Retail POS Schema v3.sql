-- =============================================================================
-- Retail POS Schema v3 — Persistent retail items on appointments + boarding
-- =============================================================================
-- Lets the groomer attach retail items at DROP-OFF (boarding intake or grooming
-- check-in), so when the customer comes back for pickup the items are already
-- on the bill. Everyone who opens the appointment/reservation popup can see
-- the attached retail in one place.
--
-- This adds one column to sales:
--   • boarding_reservation_id — FK to boarding_reservations. Lets retail items
--     be attached to a boarding pickup just like they already can to a
--     grooming appointment.
--
-- The existing sales.status = 'parked' value is reused to mean "attached but
-- not yet paid." When payment is recorded, the parked sale flips to
-- 'completed' + inventory_movements get written + qty_on_hand decrements.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--
-- Safe to re-run.
-- =============================================================================


-- ─── Add boarding_reservation_id to sales ─────────────────────────────────
alter table sales add column if not exists boarding_reservation_id uuid;

-- Add FK constraint separately so we can guard with NOT EXISTS
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_boarding_reservation_id_fkey'
  ) then
    alter table sales add constraint sales_boarding_reservation_id_fkey
      foreign key (boarding_reservation_id)
      references boarding_reservations(id)
      on delete set null;
  end if;
end$$;

-- Index for lookup ("show me parked retail attached to this reservation")
create index if not exists idx_sales_boarding_reservation
  on sales(boarding_reservation_id)
  where boarding_reservation_id is not null;


-- ─── Verify ───────────────────────────────────────────────────────────────
-- After running, confirm:
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'sales'
--      and column_name = 'boarding_reservation_id';
--   -- Should return 1 row
-- =============================================================================
