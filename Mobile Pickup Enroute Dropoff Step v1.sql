-- =============================================================================
-- Mobile Pickup Enroute Dropoff Step v1
-- =============================================================================
-- Adds 'enroute_dropoff' to the mobile-pickup flow so that tapping
-- "Done grooming — Open GPS to drop off" advances to "on the way to drop-off"
-- instead of staying stuck on "groom in progress". Mirror of the enroute_pickup
-- fix. Without this, the DB CHECK constraint rejects the new value and the step
-- silently fails to save.
--
-- Full flow now:
--   (null) → enroute_pickup → pickup_arrived → at_shop → enroute_dropoff
--          → dropoff_arrived → completed
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → paste → Run. Safe to re-run.
-- =============================================================================

alter table appointments
  drop constraint if exists appointments_mobile_pickup_step_check;

alter table appointments
  add constraint appointments_mobile_pickup_step_check
  check (mobile_pickup_step is null
         or mobile_pickup_step in (
           'enroute_pickup',
           'pickup_arrived',
           'at_shop',
           'enroute_dropoff',
           'dropoff_arrived',
           'completed'
         ));
