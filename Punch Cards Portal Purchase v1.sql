-- =============================================================================
-- Punch Cards Portal Purchase v1
-- =============================================================================
-- Adds Stripe checkout support for buying punch cards in the client portal.
-- stripe_session_id makes card issuance IDEMPOTENT — if the confirm step runs
-- twice (double redirect, refresh), the unique index blocks a duplicate card.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- Requires: Punch Cards Schema v1 already run.
-- =============================================================================

alter table punch_cards add column if not exists stripe_session_id text;

create unique index if not exists idx_punch_cards_stripe_session
  on punch_cards (stripe_session_id)
  where stripe_session_id is not null;
