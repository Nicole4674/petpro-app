-- =======================================================
-- PetPro Payroll Schema v2
-- Step 10 - Payroll Build, Phase 3A
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor AFTER Payroll Schema Cleanup.sql
-- =======================================================
-- What this file does:
--   1. Adds worker classification + tax info to staff_members
--      (W-2 vs 1099, filing status, allowances, tax ID, address)
--   2. Adds tax calculation columns to paychecks
--      (federal, state, FICA, net pay, employer matches)
--   3. Creates shop_tax_settings table (per-shop state + rates)
--
-- SECURITY NOTE:
--   tax_id stores SSN/EIN in plain text for now. Before production
--   launch, switch to pgsodium encryption or store last-4 only.
-- =======================================================


-- =======================================================
-- 1. ADD WORKER + TAX FIELDS TO staff_members
-- =======================================================

-- W-2 employee vs 1099 contractor
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS worker_type TEXT DEFAULT 'w2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_members_worker_type_check'
  ) THEN
    ALTER TABLE staff_members
      ADD CONSTRAINT staff_members_worker_type_check
      CHECK (worker_type IN ('w2', '1099'));
  END IF;
END $$;

-- Tax filing status (for W-4 withholding calc)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS tax_filing_status TEXT DEFAULT 'single';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_members_tax_filing_status_check'
  ) THEN
    ALTER TABLE staff_members
      ADD CONSTRAINT staff_members_tax_filing_status_check
      CHECK (tax_filing_status IN ('single', 'married', 'head_of_household', 'married_separately'));
  END IF;
END $$;

-- Federal allowances (dependents claimed on W-4)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS federal_allowances INT DEFAULT 0;

-- Tax ID (SSN for W-2, EIN for 1099)
-- WARNING: plain text for MVP only; encrypt before production
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

-- Mailing address (needed on pay stubs + year-end forms)
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS state TEXT;   -- 2-char state code, e.g. 'TX'
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS zip TEXT;


-- =======================================================
-- 2. ADD TAX COLUMNS TO paychecks
-- =======================================================

-- Gross + net
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS gross_pay NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS taxable_income NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS net_pay NUMERIC(10,2) DEFAULT 0;

-- Employee tax withholdings (estimates)
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS federal_tax NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS state_tax NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS social_security_tax NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS medicare_tax NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS additional_medicare_tax NUMERIC(10,2) DEFAULT 0;

-- Employer-side matches (for shop's own tax accounting)
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS employer_ss_match NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS employer_medicare_match NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS employer_futa NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS employer_suta NUMERIC(10,2) DEFAULT 0;

-- Deduction totals (line items live in paycheck_deductions table in Phase 3B)
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS pretax_deductions_total NUMERIC(10,2) DEFAULT 0;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS posttax_deductions_total NUMERIC(10,2) DEFAULT 0;

-- Snapshot of worker type at the time payroll was run
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS worker_type_snapshot TEXT DEFAULT 'w2';


-- =======================================================
-- 3. shop_tax_settings  (per-shop tax config)
-- =======================================================
-- One row per groomer/shop. Holds the state + rates the shop
-- owner manually enters. Used for estimating state tax and
-- tracking employer unemployment taxes.

CREATE TABLE IF NOT EXISTS shop_tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,

  -- Shop's physical state (for state tax + unemployment)
  state TEXT,                          -- e.g. 'TX', 'CA', 'NY'
  has_state_income_tax BOOLEAN DEFAULT true,
  state_tax_rate NUMERIC(5,2) DEFAULT 0,   -- flat % estimate, e.g. 5.00

  -- Employer unemployment tax rates (for accounting, not withheld from staff)
  suta_rate NUMERIC(5,4) DEFAULT 0,        -- state unemployment, e.g. 0.0270 = 2.7%
  suta_wage_base NUMERIC(10,2) DEFAULT 9000,  -- state wage base ceiling
  futa_rate NUMERIC(5,4) DEFAULT 0.006,    -- federal unemployment, usually 0.6% effective
  futa_wage_base NUMERIC(10,2) DEFAULT 7000,  -- federal wage base ceiling

  -- Business info for year-end forms
  business_legal_name TEXT,
  business_ein TEXT,                   -- Employer Identification Number
  business_address_line1 TEXT,
  business_address_line2 TEXT,
  business_city TEXT,
  business_state TEXT,
  business_zip TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(groomer_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_tax_settings_groomer_id ON shop_tax_settings(groomer_id);


-- =======================================================
-- 4. ROW LEVEL SECURITY on shop_tax_settings
-- =======================================================
ALTER TABLE shop_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groomer can view own tax settings"
  ON shop_tax_settings FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can insert own tax settings"
  ON shop_tax_settings FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomer can update own tax settings"
  ON shop_tax_settings FOR UPDATE
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomer can delete own tax settings"
  ON shop_tax_settings FOR DELETE
  USING (groomer_id = auth.uid());


-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm no errors
--   - Next step 3A.2: add W-2/1099 + tax fields to the Pay tab
-- =======================================================
