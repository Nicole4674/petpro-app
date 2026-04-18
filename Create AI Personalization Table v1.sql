-- =======================================================
-- PetPro — Create AI Personalization Table v1
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY: Shop owners need to personalize how PetPro AI talks
-- to their clients — shop name, tone, how to address owners,
-- custom message templates for pickup ready / reminders /
-- running late / etc. Each template can be toggled on or off
-- individually so shops only use the ones they want.
--
-- This table stores ONE settings row per groomer. The chat-
-- command edge function will read it and feed the values into
-- PetPro AI's system prompt.
--
-- Safe to run more than once — uses IF NOT EXISTS.
-- =======================================================

-- =============== 1. CREATE TABLE ===============
CREATE TABLE IF NOT EXISTS ai_personalization (
  id                          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id                  uuid           NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ===== Shop Voice =====
  shop_name                   text           NULL,
  tone                        text           NOT NULL DEFAULT 'friendly',
    -- Allowed: 'professional' | 'friendly' | 'casual'
  emoji_level                 text           NOT NULL DEFAULT 'sometimes',
    -- Allowed: 'never' | 'sometimes' | 'often'

  -- ===== How to Address Owners =====
  address_style               text           NOT NULL DEFAULT 'first_name',
    -- Allowed: 'first_name' | 'mr_mrs_last' | 'full_name'

  -- ===== Message Templates (each has its own on/off) =====
  pickup_ready_enabled        boolean        NOT NULL DEFAULT true,
  pickup_ready_template       text           NOT NULL DEFAULT
    'Hey {owner_name}! {pet_name} is all done and looking amazing 🐾 Ready whenever you are!',

  reminder_enabled            boolean        NOT NULL DEFAULT true,
  reminder_template           text           NOT NULL DEFAULT
    'Hey {owner_name}! Just a reminder {pet_name} has a {service} tomorrow at {time}. See you then!',

  running_late_enabled        boolean        NOT NULL DEFAULT false,
  running_late_template       text           NOT NULL DEFAULT
    'Hi {owner_name}, we''re running about {minutes} minutes behind on {pet_name}. So sorry for the wait!',

  arrived_safely_enabled      boolean        NOT NULL DEFAULT false,
  arrived_safely_template     text           NOT NULL DEFAULT
    'Hi {owner_name}! {pet_name} just got here safe and sound 🐕',

  follow_up_enabled           boolean        NOT NULL DEFAULT false,
  follow_up_template          text           NOT NULL DEFAULT
    'Hi {owner_name}! Hope {pet_name} is doing great. Book your next appointment anytime!',

  no_show_enabled             boolean        NOT NULL DEFAULT false,
  no_show_template            text           NOT NULL DEFAULT
    'Hi {owner_name}, we missed you at {time} today. Want to reschedule {pet_name}?',

  -- ===== Custom Instructions (free text, grooming-business only) =====
  custom_instructions         text           NULL,

  created_at                  timestamptz    NOT NULL DEFAULT now(),
  updated_at                  timestamptz    NOT NULL DEFAULT now()
);

-- =============== 2. INDEX ===============
CREATE INDEX IF NOT EXISTS idx_ai_personalization_groomer
  ON ai_personalization (groomer_id);

-- =============== 3. AUTO-UPDATE updated_at ===============
CREATE OR REPLACE FUNCTION touch_ai_personalization_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_personalization_updated_at ON ai_personalization;
CREATE TRIGGER trg_ai_personalization_updated_at
  BEFORE UPDATE ON ai_personalization
  FOR EACH ROW EXECUTE FUNCTION touch_ai_personalization_updated_at();

-- =============== 4. ROW LEVEL SECURITY ===============
ALTER TABLE ai_personalization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Groomers can view their own AI personalization"   ON ai_personalization;
DROP POLICY IF EXISTS "Groomers can insert their own AI personalization" ON ai_personalization;
DROP POLICY IF EXISTS "Groomers can update their own AI personalization" ON ai_personalization;
DROP POLICY IF EXISTS "Groomers can delete their own AI personalization" ON ai_personalization;

CREATE POLICY "Groomers can view their own AI personalization"
  ON ai_personalization FOR SELECT
  USING (groomer_id = auth.uid());

CREATE POLICY "Groomers can insert their own AI personalization"
  ON ai_personalization FOR INSERT
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomers can update their own AI personalization"
  ON ai_personalization FOR UPDATE
  USING (groomer_id = auth.uid())
  WITH CHECK (groomer_id = auth.uid());

CREATE POLICY "Groomers can delete their own AI personalization"
  ON ai_personalization FOR DELETE
  USING (groomer_id = auth.uid());

-- =============== 5. VERIFY ===============
SELECT
  'ai_personalization table created' AS status,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_name = 'ai_personalization';

SELECT
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'ai_personalization'
ORDER BY policyname;

-- =======================================================
-- END OF FILE
-- After running: the table exists and is ready for the
-- Chat Settings page to read/write from.
-- =======================================================
