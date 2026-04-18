-- =======================================================
-- PetPro Payroll Schema v3
-- Step 10 - Payroll Build, Phase 3A.5 (Run Payroll prep)
-- Created: April 16, 2026
-- Run this in Supabase SQL Editor AFTER Payroll Schema v2.sql
-- =======================================================
-- What this file does:
--   Adds 2 new columns to shop_tax_settings:
--     1. tax_estimates_enabled  (boolean, DEFAULT FALSE)
--        - When FALSE: paychecks show gross pay + tips only, NO tax math
--        - When TRUE:  paychecks show ESTIMATED tax withholdings using
--                      the percentages the shop enters
--     2. federal_tax_estimate_percent  (NUMERIC, DEFAULT 10)
--        - Editable by the shop owner
--        - Used ONLY when tax_estimates_enabled = TRUE
--        - Used ONLY for W-2 staff (1099 always = 0)
--
-- DESIGN PHILOSOPHY:
--   PetPro does NOT file taxes. Every calculation is an ESTIMATE.
--   Tax rates change every year, every state differs, every person's
--   situation is unique. This is a HELPING AID for bookkeeping.
--   Always refer users to an accountant for actual filing.
-- =======================================================


-- =======================================================
-- 1. ADD tax_estimates_enabled toggle
-- =======================================================
-- Defaults to FALSE so nobody gets surprised by tax math on day one.
-- Shop owners opt in from the Tax Settings page.

ALTER TABLE shop_tax_settings
  ADD COLUMN IF NOT EXISTS tax_estimates_enabled BOOLEAN DEFAULT FALSE;


-- =======================================================
-- 2. ADD federal_tax_estimate_percent (shop-editable)
-- =======================================================
-- The shop owner enters whatever % their accountant told them,
-- or a safe guess like 10-15% for low-income, 22-25% for solo
-- groomers (self-employment + income combined).

ALTER TABLE shop_tax_settings
  ADD COLUMN IF NOT EXISTS federal_tax_estimate_percent NUMERIC(5,2) DEFAULT 10;


-- =======================================================
-- END OF FILE
-- After running this in Supabase:
--   - Confirm no errors
--   - Next step 3A.5 Chunk 2: update the Tax Settings page UI
--     + add the "Show Tax Estimates" toggle
--     + add the federal % input (conditional)
--     + add the big "ESTIMATES ONLY" disclaimer at the top
-- =======================================================
