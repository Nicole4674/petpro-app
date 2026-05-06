-- =============================================================================
-- Booking Source + Notifications Schema v1
-- =============================================================================
-- Adds tracking columns to appointments so the calendar can show WHO booked
-- (or rescheduled) each appointment — groomer, client portal, Suds AI, etc.
-- This solves the "client rescheduled and we never saw it" problem.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── 1. Add booked_via column ──────────────────────────────────────────────
-- WHO created this appointment originally?
--   'groomer'         — manually booked by groomer/staff in calendar
--   'client_portal'   — booked by client through portal (manual UI)
--   'client_ai'       — booked by client talking to Suds AI
--   'groomer_ai'      — booked by groomer talking to Suds AI
--   'recurring'       — auto-generated from a recurring series
alter table appointments
  add column if not exists booked_via text default 'groomer'
    check (booked_via in ('groomer', 'client_portal', 'client_ai', 'groomer_ai', 'recurring'));


-- ─── 2. Add last_action tracking ───────────────────────────────────────────
-- WHO touched this appointment most recently? (Groomer side wants to know if
-- a client modified it without their knowledge)
alter table appointments
  add column if not exists last_action text default 'created'
    check (last_action in (
      'created',
      'rescheduled_by_groomer',
      'rescheduled_by_client',
      'rescheduled_by_groomer_ai',
      'rescheduled_by_client_ai',
      'cancelled_by_groomer',
      'cancelled_by_client',
      'cancelled_by_client_ai'
    ));

alter table appointments
  add column if not exists last_action_at timestamptz default now();

-- For UI: did the groomer ALREADY see this client-side action?
-- Shows a red dot on the calendar block until they open it.
alter table appointments
  add column if not exists action_seen_by_groomer boolean default true;


-- ─── 3. Backfill existing rows ──────────────────────────────────────────────
-- All existing appointments get treated as 'groomer' bookings (safe default)
-- and 'created' for last_action since we can't tell historically.
update appointments
   set booked_via = coalesce(booked_via, 'groomer'),
       last_action = coalesce(last_action, 'created'),
       action_seen_by_groomer = coalesce(action_seen_by_groomer, true)
 where booked_via is null
    or last_action is null
    or action_seen_by_groomer is null;


-- ─── 4. Index for "needs review" badge query ─────────────────────────────
-- Fast lookup of appointments that have unseen client-side actions
create index if not exists idx_appts_unseen_client_action
  on appointments (groomer_id, action_seen_by_groomer)
  where action_seen_by_groomer = false;


-- ─── 5. Add notify_phone + sms_notify_enabled to shop_settings ────────────
-- The groomer's own phone for receiving SMS alerts when clients book/reschedule.
-- Default is OFF so we don't surprise existing groomers with auto-SMS to a
-- number they haven't entered. Once they fill in their phone, they can flip it on.
alter table shop_settings
  add column if not exists notify_phone text;

alter table shop_settings
  add column if not exists sms_notify_enabled boolean default false;


-- ─── 6. Verify ──────────────────────────────────────────────────────────────
-- After running, check:
--   select id, booked_via, last_action, action_seen_by_groomer
--     from appointments order by created_at desc limit 10;
