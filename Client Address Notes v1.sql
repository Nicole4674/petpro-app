-- =============================================================================
-- Client Address Notes v1
-- =============================================================================
-- Adds address_notes column to the clients table — a free-text field for
-- location-specific notes that groomers (especially mobile) need at the
-- moment of arrival but always forget.
--
-- Examples:
--   • "Park in driveway, not street — neighbors get pissy"
--   • "Gate code 4567"
--   • "Ring doorbell, don't knock — sleeping baby"
--   • "Side door is around back, blue paint"
--   • "Big yellow dog in the yard, ignore him"
--
-- Shows on:
--   • Today's Route stop popup (so groomer sees it tapping the pin)
--   • Calendar appointment popup (when prepping for the day)
--   • Boarding kennel card (for pickup/dropoff coordination)
--   • Edit Client modal (where groomer adds/updates them)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Add the column. Free text, nullable. No length cap because some clients
--    have entire essays of "the gate alarm beeps three times then..." and
--    groomers should be able to dump everything they need.
alter table clients
  add column if not exists address_notes text;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'clients' and column_name = 'address_notes';
