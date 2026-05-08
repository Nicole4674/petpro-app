-- =============================================================================
-- Report Card Fields v2 — adds Products Used + Coat Condition
-- =============================================================================
-- Two new columns on report_cards so the printed/emailed grooming report
-- captures: what shampoo/conditioner was used + what the coat looked like
-- (matting found, skin issues noticed, etc.) — both standard items on a
-- mobile-grooming service report.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- =============================================================================

alter table report_cards
  add column if not exists products_used text;

alter table report_cards
  add column if not exists coat_condition text;

-- Verify:
-- select column_name from information_schema.columns
--   where table_name = 'report_cards' and column_name in ('products_used', 'coat_condition');
