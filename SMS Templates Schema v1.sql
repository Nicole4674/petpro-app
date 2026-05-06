-- =============================================================================
-- SMS Templates Schema v1 — Customizable per-shop SMS wording
-- =============================================================================
-- Lets each shop edit their own SMS template wording (reminder, pickup ready,
-- running late, etc.) instead of using hardcoded defaults.
--
-- Stored as JSONB on shop_settings — easy to add new templates without ALTER.
--
-- Supported placeholders (filled in at send time):
--   {client_first_name}  — e.g. "Sarah"
--   {client_last_name}   — e.g. "Jones"
--   {pet_name}           — e.g. "Bella"
--   {service_name}       — e.g. "Full Groom"
--   {date}               — e.g. "Saturday May 9"
--   {time}               — e.g. "10:00 AM"
--   {shop_name}          — e.g. "Pampered Little Paws"
--   {phone}              — your shop's phone (from shop_settings.phone)
--   {minutes}            — only used in running_late template
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- =============================================================================


-- ─── 1. Add sms_templates JSONB column ────────────────────────────────────
alter table shop_settings
  add column if not exists sms_templates jsonb default '{
    "reminder": "Hi {client_first_name}! Reminder: {pet_name} is booked for {service_name} on {date} at {time}. Reply Y to confirm or N to cancel. — {shop_name}",
    "confirmation": "Hi {client_first_name}! Confirming {pet_name}''s {service_name} on {date} at {time}. See you then! 🐾 — {shop_name}",
    "pickup_ready": "Hi {client_first_name}! {pet_name} is all done and ready for pickup. 🐾 — {shop_name}",
    "running_late": "Hi {client_first_name}! Just a heads up — we''re running about {minutes} minutes behind today, so {pet_name}''s {time} appointment will start a bit later. Thanks for your patience! — {shop_name}",
    "rebook_followup": "Hi {client_first_name}! It''s been a while since {pet_name}''s last visit. Time for another groom? Reply YES and we''ll get you scheduled. — {shop_name}",
    "thank_you": "Thanks for choosing {shop_name}, {client_first_name}! {pet_name} did great today. Hope to see you both again soon. 🐾"
  }'::jsonb;


-- ─── 2. Backfill any rows with null templates ──────────────────────────────
update shop_settings
   set sms_templates = '{
     "reminder": "Hi {client_first_name}! Reminder: {pet_name} is booked for {service_name} on {date} at {time}. Reply Y to confirm or N to cancel. — {shop_name}",
     "confirmation": "Hi {client_first_name}! Confirming {pet_name}''s {service_name} on {date} at {time}. See you then! 🐾 — {shop_name}",
     "pickup_ready": "Hi {client_first_name}! {pet_name} is all done and ready for pickup. 🐾 — {shop_name}",
     "running_late": "Hi {client_first_name}! Just a heads up — we''re running about {minutes} minutes behind today, so {pet_name}''s {time} appointment will start a bit later. Thanks for your patience! — {shop_name}",
     "rebook_followup": "Hi {client_first_name}! It''s been a while since {pet_name}''s last visit. Time for another groom? Reply YES and we''ll get you scheduled. — {shop_name}",
     "thank_you": "Thanks for choosing {shop_name}, {client_first_name}! {pet_name} did great today. Hope to see you both again soon. 🐾"
   }'::jsonb
 where sms_templates is null;


-- ─── 3. Verify ──────────────────────────────────────────────────────────────
-- After running:
--   select user_id, shop_name, sms_templates from shop_settings limit 1;
