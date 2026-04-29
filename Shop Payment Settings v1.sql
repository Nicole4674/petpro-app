-- =============================================================================
-- Shop Payment Settings v1
-- =============================================================================
-- Adds 3 toggles/inputs to the shop_settings table so each groomer can
-- customize how payments work for their shop:
--
--   1. require_prepay_to_book  → if true, clients must pay card before
--      a booking is confirmed (gates the booking flow)
--
--   2. no_show_fee_amount       → if > 0, when a groomer marks an
--      appointment as no-show we auto-charge this dollar amount to
--      the client's saved card
--
--   3. pass_fees_to_client      → MoeGo style — if true, the ~3% Stripe
--      processing fee is added on top of the client's bill so the
--      groomer keeps 100% of the service price
--
-- All three default to false / 0 so existing shops are unaffected.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Require pre-payment to book
alter table shop_settings
  add column if not exists require_prepay_to_book boolean
    default false;


-- 2. No-show fee amount
alter table shop_settings
  add column if not exists no_show_fee_amount numeric(10, 2)
    default 0;


-- 3. Pass card fees to client (MoeGo style)
alter table shop_settings
  add column if not exists pass_fees_to_client boolean
    default false;


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'shop_settings'
--   and column_name in ('require_prepay_to_book', 'no_show_fee_amount', 'pass_fees_to_client')
-- order by column_name;
