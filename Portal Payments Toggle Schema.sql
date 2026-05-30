-- =============================================================================
-- Portal Payments Toggle Schema
-- =============================================================================
-- Adds a per-shop toggle that controls whether clients can pay their
-- appointment / boarding balances through the client portal.
--
--   • Default = true  (portal payments ON for all existing + new shops)
--   • When false: the portal hides the Pay buttons AND the charge functions
--     (stripe-charge-card, stripe-charge-boarding) refuse the charge.
--
-- Safe to run more than once (uses "if not exists").
--
-- How to run: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================================

alter table shop_settings
  add column if not exists allow_portal_payments boolean not null default true;
