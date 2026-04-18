-- =======================================================
-- PetPro Deductions Tables v1
-- Step 10 - Payroll Build, Chunk 3B (Deductions)
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor AFTER Payroll Schema v3.sql
-- =======================================================
-- What this file does:
--   1. Adds 2 helper columns to paychecks:
--        - pre_tax_deductions_total  (sum of all pre-tax deductions this check)
--        - post_tax_deductions_total (sum of all post-tax deductions this check)
--      These let the paycheck detail page display totals instantly without
--      re-summing the child table every time.
--
--   2. Creates staff_deductions  (the RULES — one row per recurring
--      deduction per staff member). Example rows:
--        - Sarah has a "Health Insurance" row at $100/check pre-tax, no cap
--        - Sarah has a "Clipper Loan" row at $50/check post-tax, cap $200
--
--   3. Creates paycheck_deductions  (the HISTORY — one row per deduction
--      applied on each paycheck). Snapshot of name, amount, type at that
--      moment, so edits to the rule never alter past paychecks.
--
--   4. Adds indexes on foreign keys (same pattern as Payroll Schema).
--
--   5. Enables Row Level Security so each groomer only sees their own
--      deduction rules and paycheck deduction history.
--
-- DESIGN NOTES:
--   - 8 deduction TYPES supported: health, dental, vision, 401k,
--     Roth 401k, HSA/FSA, garnishment, uniform/tool, loan advance, other.
--   - Tax treatment (pre_tax or post_tax) is stored per-deduction, not
--     auto-assigned by type, so owners can override when their accountant
--     tells them to.
--   - amount_type is 'flat' (fixed $ per check) or 'percent' (% of gross).
--   - cap_amount is OPTIONAL (NULL = no cap, runs forever until turned off).
--   - amount_paid_to_date auto-increments when deduction is applied; when
--     it hits cap_amount, the deduction auto-stops on the next run.
-- =======================================================


-- =======================================================
-- 1. ADD helper columns to paychecks
-- =======================================================
-- Safe to re-run (uses IF NOT EXISTS).

ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS pre_tax_deductions_total NUMERIC(10,2) DEFAULT 0;

ALTER TABLE paychecks
  ADD COLUMN IF NOT EXISTS post_tax_deductions_total NUMERIC(10,2) DEFAULT 0;


-- =======================================================
-- 2. staff_deductions  (the rules / config per staff)
-- =======================================================
-- One row per recurring deduction per staff member.
-- Example: Sarah with health insurance + clipper loan = 2 rows.
--
-- When a paycheck is generated, we read all is_active=true rows for that
-- staff member, apply them to the check, and write a snapshot into
-- paycheck_deductions. We also bump amount_paid_to_date on the rule.
-- When amount_paid_to_date >= cap_amount (and cap is set), the rule
-- auto-stops on future runs.

CREATE TABLE IF NOT EXISTS staff_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,

  -- Human-readable name for the paycheck (e.g. "Blue Cross health insurance",
  -- "Clipper loan repayment", "Uniform shirts"). Shows on pay stubs.
  name TEXT NOT NULL,

  -- What kind of deduction this is. Used for reports & year-end forms.
  deduction_type TEXT NOT NULL
    CHECK (deduction_type IN (
      'health_insurance',
      'dental_insurance',
      'vision_insurance',
      'retirement_401k',
      'retirement_roth_401k',
      'hsa_fsa',
      'garnishment',
      'uniform_tool',
      'loan_advance',
      'other'
    )),

  -- Pre-tax reduces taxable income (401k, health). Post-tax doesn't (loans, Roth, garnishments).
  tax_treatment TEXT NOT NULL
    CHECK (tax_treatment IN ('pre_tax', 'post_tax')),

  -- 'flat' = fixed $ per check. 'percent' = % of gross pay.
  amount_type TEXT NOT NULL
    CHECK (amount_type IN ('flat', 'percent')),

  -- For 'flat' this is dollars (e.g. 50.00 = $50/check).
  -- For 'percent' this is a percent (e.g. 5.00 = 5% of gross).
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),

  -- Optional total cap. NULL = no cap (runs until manually turned off).
  -- Example: $200 clipper loan paid back over 4 checks of $50.
  cap_amount NUMERIC(10,2),

  -- Running total of $ deducted toward the cap. Auto-updated by payroll run.
  amount_paid_to_date NUMERIC(10,2) NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_deductions_staff_id ON staff_deductions(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_deductions_groomer_id ON staff_deductions(groomer_id);
CREATE INDEX IF NOT EXISTS idx_staff_deductions_active ON staff_deductions(is_active);


-- =======================================================
-- 3. paycheck_deductions  (history of what got deducted each check)
-- =======================================================
-- One row per deduction applied on each paycheck. Snapshot fields are
-- copied in at the time of payroll run so history is never altered even
-- if the underlying rule gets edited or deleted later.

CREATE TABLE IF NOT EXISTS paycheck_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paycheck_id UUID NOT NULL REFERENCES paychecks(id) ON DELETE CASCADE,
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,

  -- SET NULL so if someone deletes the rule, we keep the history row.
  staff_deduction_id UUID REFERENCES staff_deductions(id) ON DELETE SET NULL,

  -- Snapshot of the rule at the moment of payroll run
  name TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  tax_treatment TEXT NOT NULL,
  amount_type TEXT NOT NULL,
  amount_configured NUMERIC(10,2) NOT NULL,

  -- The actual $ amount taken out on this check
  amount_deducted NUMERIC(10,2) NOT NULL CHECK (amount_deducted >= 0),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paycheck_deductions_paycheck_id ON paycheck_deductions(paycheck_id);
CREATE INDEX IF NOT EXISTS idx_paycheck_deductions_groomer_id ON paycheck_deductions(groomer_id);
CREATE INDEX IF NOT EXISTS idx_paycheck_deductions_staff_deduction_id ON paycheck_deductions(staff_deduction_id);


-- =======================================================
-- 4. ROW LEVEL SECURITY
-- Same pattern as staff_pay_settings / paychecks in Payroll Schema.
-- Each groomer can only see/edit/delete their own deduction rules
-- and their own paycheck deduction history.
-- =======================================================

-- staff_deductions ---------------------------------------
ALTER TABLE staff_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own staff deductions"
  ON staff_deductions FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own staff deductions"
  ON staff_deductions FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own staff deductions"
  ON staff_deductions FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own staff deductions"
  ON staff_deductions FOR DELETE
  USING (groomer_id = auth.uid());


-- paycheck_deductions ------------------------------------
ALTER TABLE paycheck_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own paycheck deductions"
  ON paycheck_deductions FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own paycheck deductions"
  ON paycheck_deductions FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own paycheck deductions"
  ON paycheck_deductions FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own paycheck deductions"
  ON paycheck_deductions FOR DELETE
  USING (groomer_id = auth.uid());


-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm no errors (should see "Success. No rows returned" for each block)
--   - Let Claude know it ran clean
--   - Next step 3B Chunk 2: add Deductions UI to Staff Detail -> Pay tab
--     + list existing deductions
--     + "Add Deduction" form (name, type, tax treatment, flat/%, amount, cap)
--     + edit / toggle active / delete existing deductions
-- =======================================================
