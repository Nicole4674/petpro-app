-- =============================================================================
-- SMS Inbox Delete Policy v1
-- =============================================================================
-- Lets the groomer delete individual SMS messages from their own inbox UI.
-- Useful for cleaning up test messages or removing unwanted threads.
--
-- IMPORTANT: This is a HARD delete — the row is permanently removed. The
-- conversation thread loses that message in the inbox. The actual SMS that
-- was sent (or received) via Twilio is unaffected; only the audit row goes.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- =============================================================================

drop policy if exists "Groomers delete their own SMS messages" on sms_messages;
create policy "Groomers delete their own SMS messages"
  on sms_messages
  for delete
  to authenticated
  using (groomer_id = auth.uid());
