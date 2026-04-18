-- =======================================================
-- PetPro Payroll Database Schema
-- Step 10 - Payroll Build, Phase 1
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- What this file does:
--   1. Adds staff_id to appointments + boarding_reservations
--      (so commission can be tied to the groomer who did the work)
--   2. Creates staff_pay_settings (per-staff pay config)
--   3. Creates pay_periods (the pay windows)
--   4. Creates paychecks (the calculated pay for a staff in a period)
--   5. Creates booking_tips (tip tracking per appointment/boarding)
--   6. Adds indexes + RLS policies (same pattern as existing tables)
-- =======================================================


-- =======================================================
-- 1. ADD staff_id TO EXISTING TABLES
-- =======================================================

-- Track which staff member performed each appointment (for commission)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_staff_id ON appointments(staff_id);

-- Track which staff member is assigned to a boarding reservation
ALTER TABLE boarding_reservations
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_boarding_reservations_staff_id ON boarding_reservations(staff_id);


-- =======================================================
-- 2. staff_pay_settings  (pay config per staff member)
-- =======================================================
-- One row per staff member.
-- rate_type controls how their pay is calculated:
--   'hourly'               -> hourly_rate only
--   'commission'           -> commission_percent of services they performed
--   'hourly_plus_commission' -> both (hourly wage PLUS commission on services)
--   'salary'               -> fixed salary_amount per pay period

CREATE TABLE IF NOT EXISTS staff_pay_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  rate_type TEXT NOT NULL DEFAULT 'hourly'
    CHECK (rate_type IN ('hourly', 'commission', 'hourly_plus_commission', 'salary')),
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  commission_percent NUMERIC(5,2) DEFAULT 0,    -- 0-100, percent of service price
  salary_amount NUMERIC(10,2) DEFAULT 0,         -- flat amount per pay period
  pay_period_type TEXT NOT NULL DEFAULT 'bi_weekly'
    CHECK (pay_period_type IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly')),
  overtime_rate_multiplier NUMERIC(4,2) DEFAULT 1.5,   -- 1.5x after 40 hrs/week
  overtime_enabled BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_pay_settings_staff_id ON staff_pay_settings(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_pay_settings_groomer_id ON staff_pay_settings(groomer_id);


-- =======================================================
-- 3. pay_periods  (the pay windows that get "run")
-- =======================================================
-- Each row is one pay window (e.g. Apr 1 - Apr 14).
-- Status lifecycle: open -> closed -> paid
--   open   = still accumulating hours/services
--   closed = payroll has been calculated, stubs generated
--   paid   = shop owner marked as paid (manual, since we're not sending money)

CREATE TABLE IF NOT EXISTS pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL
    CHECK (period_type IN ('weekly', 'bi_weekly', 'semi_monthly', 'monthly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'paid')),
  closed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_pay_periods_groomer_id ON pay_periods(groomer_id);
CREATE INDEX IF NOT EXISTS idx_pay_periods_dates ON pay_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pay_periods_status ON pay_periods(status);


-- =======================================================
-- 4. paychecks  (one paycheck per staff per pay period)
-- =======================================================
-- The calculated pay stub. Created when payroll is "run" on a period.

CREATE TABLE IF NOT EXISTS paychecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,

  -- Snapshot of pay settings at the time payroll was run (so future changes don't alter history)
  rate_type TEXT NOT NULL,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  commission_percent NUMERIC(5,2) DEFAULT 0,
  salary_amount NUMERIC(10,2) DEFAULT 0,

  -- Hours
  regular_minutes INT DEFAULT 0,
  overtime_minutes INT DEFAULT 0,
  break_minutes INT DEFAULT 0,

  -- Pay breakdown
  regular_pay NUMERIC(10,2) DEFAULT 0,
  overtime_pay NUMERIC(10,2) DEFAULT 0,
  commission_pay NUMERIC(10,2) DEFAULT 0,
  salary_pay NUMERIC(10,2) DEFAULT 0,
  tips_total NUMERIC(10,2) DEFAULT 0,
  adjustments NUMERIC(10,2) DEFAULT 0,            -- manual + or - (bonus, deduction)
  adjustment_note TEXT,
  total_pay NUMERIC(10,2) DEFAULT 0,              -- the final number

  -- Service count for reference on the stub
  services_count INT DEFAULT 0,
  services_revenue NUMERIC(10,2) DEFAULT 0,       -- sum of service prices this staff did

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'paid')),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pay_period_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_paychecks_period_id ON paychecks(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_paychecks_staff_id ON paychecks(staff_id);
CREATE INDEX IF NOT EXISTS idx_paychecks_groomer_id ON paychecks(groomer_id);
CREATE INDEX IF NOT EXISTS idx_paychecks_status ON paychecks(status);


-- =======================================================
-- 5. booking_tips  (tip tracking)
-- =======================================================
-- Tips are linked to either an appointment OR a boarding reservation.
-- The staff_id is who gets the tip (usually the one who did the service).
-- source_type lets us track how the tip came in (cash, card, stripe, other).

CREATE TABLE IF NOT EXISTS booking_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  boarding_reservation_id UUID REFERENCES boarding_reservations(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  source_type TEXT NOT NULL DEFAULT 'cash'
    CHECK (source_type IN ('cash', 'card', 'stripe', 'other')),
  tip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paycheck_id UUID REFERENCES paychecks(id) ON DELETE SET NULL,   -- set once rolled into a paycheck
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Must be linked to exactly one of: appointment, boarding reservation, or neither (manual cash tip)
  CHECK (
    (appointment_id IS NOT NULL AND boarding_reservation_id IS NULL)
    OR (appointment_id IS NULL AND boarding_reservation_id IS NOT NULL)
    OR (appointment_id IS NULL AND boarding_reservation_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_booking_tips_staff_id ON booking_tips(staff_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_groomer_id ON booking_tips(groomer_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_appointment_id ON booking_tips(appointment_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_boarding_id ON booking_tips(boarding_reservation_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_paycheck_id ON booking_tips(paycheck_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_date ON booking_tips(tip_date);


-- =======================================================
-- 6. ROW LEVEL SECURITY
-- Same pattern as client_notes and boarding tables:
-- shop owner (groomer) can only see their own rows.
-- =======================================================

-- staff_pay_settings --------------------------------------
ALTER TABLE staff_pay_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own staff pay settings"
  ON staff_pay_settings FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own staff pay settings"
  ON staff_pay_settings FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own staff pay settings"
  ON staff_pay_settings FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own staff pay settings"
  ON staff_pay_settings FOR DELETE
  USING (groomer_id = auth.uid());


-- pay_periods ---------------------------------------------
ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own pay periods"
  ON pay_periods FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own pay periods"
  ON pay_periods FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own pay periods"
  ON pay_periods FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own pay periods"
  ON pay_periods FOR DELETE
  USING (groomer_id = auth.uid());


-- paychecks -----------------------------------------------
ALTER TABLE paychecks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own paychecks"
  ON paychecks FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own paychecks"
  ON paychecks FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own paychecks"
  ON paychecks FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own paychecks"
  ON paychecks FOR DELETE
  USING (groomer_id = auth.uid());


-- booking_tips --------------------------------------------
ALTER TABLE booking_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own booking tips"
  ON booking_tips FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own booking tips"
  ON booking_tips FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own booking tips"
  ON booking_tips FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own booking tips"
  ON booking_tips FOR DELETE
  USING (groomer_id = auth.uid());


-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Let Claude know it ran clean (or paste any errors)
--   - Next step: add Pay Settings UI to the Staff Detail page
-- =======================================================
