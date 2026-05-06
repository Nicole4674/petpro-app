-- =============================================================================
-- Shop Business Hours Schema v1 — Per-Day Open/Close Times
-- =============================================================================
-- Adds structured business hours to shop_settings so Suds AI can:
--   • Refuse bookings on closed days (e.g. "Sorry, we're closed Sundays")
--   • Refuse bookings outside open hours (e.g. "We open at 9 AM")
--   • Suggest only valid times when checking availability
--
-- Stored as JSONB for flexibility:
--   {
--     "monday":    { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "tuesday":   { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "wednesday": { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "thursday":  { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "friday":    { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "saturday":  { "is_open": true,  "open": "09:00", "close": "17:00" },
--     "sunday":    { "is_open": false, "open": null,    "close": null    }
--   }
--
-- The existing free-text `hours` column stays — used for client-facing display.
-- This new column is the SOURCE OF TRUTH for AI booking validation.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── 1. Add business_hours JSONB column ────────────────────────────────────
alter table shop_settings
  add column if not exists business_hours jsonb default '{
    "monday":    {"is_open": true,  "open": "09:00", "close": "17:00"},
    "tuesday":   {"is_open": true,  "open": "09:00", "close": "17:00"},
    "wednesday": {"is_open": true,  "open": "09:00", "close": "17:00"},
    "thursday":  {"is_open": true,  "open": "09:00", "close": "17:00"},
    "friday":    {"is_open": true,  "open": "09:00", "close": "17:00"},
    "saturday":  {"is_open": true,  "open": "09:00", "close": "17:00"},
    "sunday":    {"is_open": false, "open": null,    "close": null}
  }'::jsonb;


-- ─── 2. Backfill any rows missing the column ──────────────────────────────
update shop_settings
   set business_hours = '{
     "monday":    {"is_open": true,  "open": "09:00", "close": "17:00"},
     "tuesday":   {"is_open": true,  "open": "09:00", "close": "17:00"},
     "wednesday": {"is_open": true,  "open": "09:00", "close": "17:00"},
     "thursday":  {"is_open": true,  "open": "09:00", "close": "17:00"},
     "friday":    {"is_open": true,  "open": "09:00", "close": "17:00"},
     "saturday":  {"is_open": true,  "open": "09:00", "close": "17:00"},
     "sunday":    {"is_open": false, "open": null,    "close": null}
   }'::jsonb
 where business_hours is null;


-- ─── 3. Verify ──────────────────────────────────────────────────────────────
-- After running, check your row:
--   select user_id, shop_name, business_hours from shop_settings limit 1;
--
-- The column should show all 7 days with the defaults above.
