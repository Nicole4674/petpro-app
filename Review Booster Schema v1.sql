-- =============================================================================
-- Review Booster Schema v1
-- =============================================================================
-- Auto-request Google reviews after checkout. The #1 growth feature MoeGo
-- groomers rave about — now in PetPro, included on all plans.
--
-- Behavior (decided 2026-06-10):
--   • Trigger: automatically on appointment checkout / mobile drop-off complete
--   • Frequency: ONCE EVER per client (review_requested_at stamp = never again)
--   • Channel: SMS first (needs consent + quota), email fallback via Resend
--
-- Adds:
--   shop_settings.review_booster_enabled  — master toggle (default OFF; groomer
--                                           flips it on after pasting their link)
--   shop_settings.google_review_url       — the groomer's Google review link
--   clients.review_requested_at           — when we asked (null = never asked)
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

alter table shop_settings
  add column if not exists review_booster_enabled boolean not null default false;

alter table shop_settings
  add column if not exists google_review_url text;

alter table clients
  add column if not exists review_requested_at timestamptz;

-- Optional verify:
-- select shop_name, review_booster_enabled, google_review_url from shop_settings;
