-- =============================================================================
-- Mobile Pick Up Schema v1 — NEW visit type alongside Storefront + Mobile Visit
-- =============================================================================
-- Adds a third visit type: "Mobile Pick Up" — groomer drives to client, picks
-- pet up, brings them BACK to the shop to groom, then drives them home after.
--
-- Different from "Mobile Visit" (current): that's van-side grooming AT the
-- client's location. Pick Up brings them to the shop instead.
--
-- Workflow tracked in `mobile_pickup_step`:
--    null               → not started (booking just exists)
--    'pickup_arrived'   → groomer tapped "I'm here" at client's house for pickup
--    'at_shop'          → groomer tapped "Head back" → pet is now in shop
--    'dropoff_arrived'  → groomer tapped "I'm here" at drop-off
--    'completed'        → groomer tapped "Done" at drop-off
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- =============================================================================


-- ─── 1. Add columns to appointments table ─────────────────────────────────
alter table appointments
  add column if not exists is_mobile_pickup boolean not null default false,
  add column if not exists mobile_pickup_step text default null;

-- Sanity check the step values — protects against typos
alter table appointments
  drop constraint if exists appointments_mobile_pickup_step_check;
alter table appointments
  add constraint appointments_mobile_pickup_step_check
  check (mobile_pickup_step is null
         or mobile_pickup_step in ('pickup_arrived','at_shop','dropoff_arrived','completed'));


-- ─── 2. Add client-level default ──────────────────────────────────────────
-- So you mark Mrs. Smith as "always Mobile Pick Up" once, and every appointment
-- she books inherits it. Still overrideable per-appointment.
alter table clients
  add column if not exists default_mobile_pickup boolean not null default false;


-- ─── 3. Add 3 new SMS templates to existing shop_settings rows ────────────
-- These are the "I'm here" texts for each step. Stored alongside existing
-- templates in the sms_templates JSONB. If template doesn't exist on a
-- row, the send-sms function falls back to a hardcoded default.
update shop_settings
   set sms_templates = coalesce(sms_templates, '{}'::jsonb)
     || jsonb_build_object(
       'mobile_visit_arrived',
       'Hi {client_first_name}! I''m at the door for {pet_name}''s grooming. 🐾 — {shop_name}',
       'pickup_arrived',
       'Hi {client_first_name}! I''m outside ready to pick up {pet_name}. 🐾 — {shop_name}',
       'dropoff_arrived',
       'Hi {client_first_name}! I''m outside with {pet_name}, all groomed and ready! 🐾 — {shop_name}'
     )
 where not (sms_templates ? 'pickup_arrived')
    or not (sms_templates ? 'dropoff_arrived')
    or not (sms_templates ? 'mobile_visit_arrived');


-- ─── 4. Helpful index for finding today's mobile pickups quickly ──────────
create index if not exists idx_appointments_mobile_pickup_active
  on appointments (groomer_id, appointment_date)
  where is_mobile_pickup = true;


-- ─── 5. Verify ────────────────────────────────────────────────────────────
-- After running, you should see the new columns:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'appointments'
--      and column_name in ('is_mobile_pickup','mobile_pickup_step');
--
--   select column_name from information_schema.columns
--    where table_name = 'clients' and column_name = 'default_mobile_pickup';
--
--   select sms_templates ? 'pickup_arrived' as has_pickup,
--          sms_templates ? 'dropoff_arrived' as has_dropoff,
--          sms_templates ? 'mobile_visit_arrived' as has_visit_arrived
--     from shop_settings limit 1;
