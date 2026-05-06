-- =============================================================================
-- Reminder Settings Schema v1
-- =============================================================================
-- Per-shop appointment reminder configuration.
--
-- Adds 3 columns to shop_settings (per-shop reminder rules) and 1 column to
-- appointments (track which ones already got a reminder so we never double-send).
--
-- Default behavior: OFF. Each shop opts in via Shop Settings.
--
-- HOW IT WORKS (once enabled):
--   • A scheduled edge function (send-reminders-cron) runs every hour.
--   • For each shop with reminder_enabled = true, it checks the shop's local
--     time vs reminder_send_hour_local. If current hour matches → process.
--   • Finds appointments scheduled `reminder_lead_days` days from today where
--     reminder_sent_at IS NULL.
--   • Sends each one a Y/N reminder SMS via send-sms (counts against shop quota).
--   • Marks reminder_sent_at = now() so we never re-send the same reminder.
--
-- Y/N replies are handled by the existing twilio-sms-inbound function.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── shop_settings: per-shop reminder config ───
alter table shop_settings
  add column if not exists reminder_enabled boolean default false;

alter table shop_settings
  add column if not exists reminder_send_hour_local int default 17
    check (reminder_send_hour_local >= 0 and reminder_send_hour_local <= 23);
  -- 17 = 5 PM (using shop's waitlist_timezone for what "local" means)

alter table shop_settings
  add column if not exists reminder_lead_days int default 1
    check (reminder_lead_days >= 1 and reminder_lead_days <= 7);
  -- 1 = send the reminder the day before the appointment


-- ─── appointments: track when each reminder was sent (prevents dupes) ───
alter table appointments
  add column if not exists reminder_sent_at timestamptz;

-- Index for the cron's lookup (find appts in lead_days range with no reminder yet)
create index if not exists idx_appointments_reminder_lookup
  on appointments (groomer_id, appointment_date)
  where reminder_sent_at is null;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings'
--   and column_name in ('reminder_enabled', 'reminder_send_hour_local', 'reminder_lead_days');
--
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'appointments' and column_name = 'reminder_sent_at';
