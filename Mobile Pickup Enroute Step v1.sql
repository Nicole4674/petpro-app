-- =============================================================================
-- Mobile Pickup Enroute Step v1
-- =============================================================================
-- Adds a new 'enroute_pickup' step to the mobile-pickup flow so that tapping
-- "Start — Open GPS to client" advances the appointment to "on the way" instead
-- of staying stuck at "not started." Without this, the DB CHECK constraint would
-- reject the new value and the step would silently fail to save.
--
-- Flow now: (null) → enroute_pickup → pickup_arrived → at_shop → dropoff_arrived → completed
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
           'dropoff_arrived',
           'completed'
         ));
