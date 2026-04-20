-- ====================================================================
-- PetPro — notification_log table
-- --------------------------------------------------------------------
-- Tracks which scheduled pushes have already been sent so the
-- push-scheduler doesn't ping the same appointment twice.
--
-- Three trigger types:
--   '15min'       — "Your appt is starting in 15 min" → to groomer
--   'day_before'  — "Your appt is tomorrow" → to client
--   'rebook'      — "Time to book your next visit" → to client
-- ====================================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('15min', 'day_before', 'rebook')),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One notification per (appointment, trigger) — prevents duplicate pushes
-- when the cron fires again and the appointment still matches the window.
CREATE UNIQUE INDEX IF NOT EXISTS notification_log_appt_trigger_unique
  ON notification_log(appointment_id, trigger_type)
  WHERE appointment_id IS NOT NULL;

-- Fast lookup for rebook nudges: "when did we last nudge this client?"
CREATE INDEX IF NOT EXISTS notification_log_client_trigger_idx
  ON notification_log(client_id, trigger_type, sent_at DESC)
  WHERE client_id IS NOT NULL;

-- Enable RLS so random logged-in users can't read the log
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Service role (the scheduler function) has full access
DROP POLICY IF EXISTS "service_role_all_notification_log" ON notification_log;
CREATE POLICY "service_role_all_notification_log"
  ON notification_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
