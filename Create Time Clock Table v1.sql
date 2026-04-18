-- =======================================================
-- PetPro — Create Time Clock Table v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: The Time Clock page at /staff/timeclock errors out with
-- "Could not find the table 'public.time_clock' in the schema cache"
-- because the table was never created. This script creates it with
-- all the columns the TimeClock.jsx code expects, plus Row Level
-- Security so groomers can only see their own staff's time entries.
--
-- What this creates:
--   - time_clock table (one row per clock-in / clock-out session)
--   - Indexes for fast lookups (active entry, history, week view)
--   - RLS policies (groomer can only touch rows where they own the staff)
--
-- Safe to run more than once — uses IF NOT EXISTS everywhere.
-- =======================================================

-- =============== 1. CREATE TABLE ===============
CREATE TABLE IF NOT EXISTS time_clock (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid          NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  groomer_id      uuid          NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,

  -- Clock in / out timestamps
  clock_in        timestamptz   NOT NULL DEFAULT now(),
  clock_out       timestamptz   NULL,

  -- Date (for easy day queries)
  date            date          NOT NULL DEFAULT current_date,

  -- Break tracking
  on_break        boolean       NOT NULL DEFAULT false,
  break_start     timestamptz   NULL,
  break_minutes   integer       NOT NULL DEFAULT 0,

  -- Total worked (calculated on clock out = clock_out - clock_in - break_minutes)
  total_minutes   integer       NULL,

  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- =============== 2. INDEXES ===============
-- Find a staff member's currently-open entry (where clock_out is null)
CREATE INDEX IF NOT EXISTS idx_time_clock_staff_open
  ON time_clock (staff_id, clock_out);

-- History / week view: filter by staff + date range
CREATE INDEX IF NOT EXISTS idx_time_clock_staff_clockin
  ON time_clock (staff_id, clock_in DESC);

-- RLS filter by groomer
CREATE INDEX IF NOT EXISTS idx_time_clock_groomer
  ON time_clock (groomer_id);

-- =============== 3. ROW LEVEL SECURITY ===============
ALTER TABLE time_clock ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies so re-running is safe
DROP POLICY IF EXISTS "Groomers can view their own staff time entries"   ON time_clock;
DROP POLICY IF EXISTS "Groomers can insert their own staff time entries" ON time_clock;
DROP POLICY IF EXISTS "Groomers can update their own staff time entries" ON time_clock;
DROP POLICY IF EXISTS "Groomers can delete their own staff time entries" ON time_clock;

-- Read: groomer can see their own entries
CREATE POLICY "Groomers can view their own staff time entries"
  ON time_clock FOR SELECT
  USING (groomer_id = auth.uid());

-- Insert: groomer_id on the new row must match the logged-in user
CREATE POLICY "Groomers can insert their own staff time entries"
  ON time_clock FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

-- Update: same rule
CREATE POLICY "Groomers can update their own staff time entries"
  ON time_clock FOR UPDATE
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

-- Delete: same rule
CREATE POLICY "Groomers can delete their own staff time entries"
  ON time_clock FOR DELETE
  USING (groomer_id = auth.uid());

-- =============== 4. VERIFY ===============
-- Confirm the table + policies exist
SELECT
  'time_clock table created' AS status,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_name = 'time_clock';

SELECT
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'time_clock'
ORDER BY policyname;

-- =======================================================
-- END OF FILE
-- After running: go to /staff/timeclock and try Clock In again.
-- =======================================================
