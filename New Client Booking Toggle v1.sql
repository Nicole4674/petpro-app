-- =============================================================================
-- New Client Booking Toggle v1
-- =============================================================================
-- Adds a per-groomer switch that lets BRAND-NEW clients (no past appointment)
-- book through Suds in the client portal. Default OFF — groomers must opt in,
-- so nothing changes for existing shops until they flip it on.
--
-- When OFF: first-timers are routed to Messages (original hard-coded behavior).
-- When ON:  first-timers can self-book; Suds' normal flagging/approval still
--           applies (e.g. first-time bookings can be flagged for review).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → paste → Run.
-- Safe to re-run.
-- =============================================================================

alter table ai_personalization
  add column if not exists client_new_client_booking_enabled boolean not null default false;
