-- =============================================================================
-- Free Migration Usage Counter v1
-- =============================================================================
-- Migration mode is now FREE (no AI-action deduction) with a server-enforced
-- import-only toolset. This column counts migration actions per groomer so
-- abnormal volume is visible (telemetry, never billed).
--
-- Check usage anytime:
--   select email, migration_actions_used from groomers
--   join auth.users u on u.id = groomers.id
--   order by migration_actions_used desc nulls last limit 20;
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

alter table groomers
  add column if not exists migration_actions_used int not null default 0;
