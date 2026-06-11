-- =============================================================================
-- Punch Card Refund Pause v1
-- =============================================================================
-- When a punch card purchase gets refunded in Stripe, the card should stop
-- working automatically (status → 'refunded') instead of the client keeping
-- free punches. The stripe-connect-webhook listens for charge.refunded and
-- matches the charge's payment_intent to the card.
--
-- This file adds the matching column: stripe_payment_intent_id, saved by
-- confirm-punch-card at purchase time. (Cards sold in person have no Stripe
-- payment, so refunds for those stay manual — the Pause button.)
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

alter table punch_cards
  add column if not exists stripe_payment_intent_id text;

create index if not exists idx_punch_cards_payment_intent
  on punch_cards (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
