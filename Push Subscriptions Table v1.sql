-- ====================================================================
-- PetPro — Push Subscriptions Table (Web Notifications Foundation)
-- ====================================================================
-- PURPOSE: Stores each user's browser push subscription ("mailing
-- address" for notifications). When a groomer or client clicks
-- "Turn on notifications", their browser gives us an endpoint + keys,
-- and we save them here so our edge function knows where to send
-- pushes when events happen (new booking, message, reschedule, etc.)
--
-- ONE PERSON = CAN HAVE MULTIPLE ROWS: one per device/browser.
--   e.g. You on laptop + you on phone = 2 rows, both fire on new booking.
--
-- SAFE TO RUN: brand new table, doesn't touch any existing data.
-- ====================================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The "mailing address" — unique per browser/device
  endpoint TEXT NOT NULL UNIQUE,

  -- Encryption keys the browser gave us (required by push standard)
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,

  -- Debug info — lets us see "this sub is from Chrome on Windows"
  user_agent TEXT,

  -- 'groomer' or 'client' — handy for filtering who gets what
  user_type TEXT CHECK (user_type IN ('groomer', 'client')),

  -- Bookkeeping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Index for fast lookups when we need "all subs for user X"
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

-- Step 3: Enable Row-Level Security (RLS) — standard Supabase safety net
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Step 4: Policies — users can only touch their OWN subscriptions

-- Allow a logged-in user to insert their own subscription
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON push_subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow a logged-in user to see their own subscriptions (not anyone else's)
DROP POLICY IF EXISTS "Users can view own subscriptions" ON push_subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Allow a logged-in user to delete their own subscription (e.g. when
-- they click "Turn off notifications" or switch to a new device)
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON push_subscriptions;
CREATE POLICY "Users can delete own subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role (edge functions using service key) to update last_used_at
DROP POLICY IF EXISTS "Service role full access" ON push_subscriptions;
CREATE POLICY "Service role full access"
  ON push_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ====================================================================
-- VERIFY IT WORKED
-- ====================================================================
-- Run this after to confirm the table exists and is empty:
--
--   SELECT COUNT(*) AS row_count FROM push_subscriptions;
--   -- Should return: 0
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'push_subscriptions'
--   ORDER BY ordinal_position;
--   -- Should show all 9 columns
-- ====================================================================

-- ====================================================================
-- ROLLBACK (only if something goes wrong)
-- ====================================================================
-- DROP TABLE IF EXISTS push_subscriptions CASCADE;
