-- =============================================================================
-- Retail POS Schema v4 — Low-stock alert toggle
-- =============================================================================
-- One small column on shop_settings so groomers can opt IN to daily low-stock
-- email alerts. Default false to avoid spamming people who don't use retail.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- =============================================================================

alter table shop_settings add column if not exists low_stock_alerts_enabled boolean not null default false;

-- ─── Verify ──
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'shop_settings'
--    and column_name = 'low_stock_alerts_enabled';
