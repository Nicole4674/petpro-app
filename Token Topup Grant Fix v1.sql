-- =============================================================================
-- Token Topup — OPTIONAL hardening index (NOT a fix — nothing was broken)
-- =============================================================================
-- HISTORY (Jun 11, 2026): an earlier version of this file claimed token pack
-- purchases never granted tokens. THAT WAS WRONG. The granting code lives in
-- the `stripe-webhook` edge function (deployed via the Supabase dashboard,
-- now backed up at supabase/functions/stripe-webhook/index.ts). It logs to
-- token_purchases and credits via the add_topup_tokens RPC — verified working
-- by the May 3, 2026 test purchase.
--
-- This file now contains ONLY an optional safety index: making
-- token_purchases.stripe_session_id UNIQUE so duplicate webhook deliveries
-- can never log the same purchase twice. The webhook already checks for
-- duplicates in code, so this is belt-and-suspenders. Run it or skip it —
-- the system works either way.
-- =============================================================================

create unique index if not exists token_purchases_session_unique
  on token_purchases (stripe_session_id)
  where stripe_session_id is not null;
