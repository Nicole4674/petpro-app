-- =============================================================================
-- SMS Messages Schema v1
-- =============================================================================
-- Conversation history for every SMS sent or received via PetPro.
-- Powers the SMS Inbox UI (tab in the Messages page).
--
-- Filled by:
--   • send-sms edge function (logs every successful outbound)
--   • twilio-sms-inbound edge function (logs every inbound reply)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── Table: sms_messages ───
create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  -- direction: 'outbound' = we sent it, 'inbound' = client sent to us
  direction text not null check (direction in ('outbound', 'inbound')),
  from_phone text not null,
  to_phone text not null,
  body text not null,
  twilio_sid text,
  -- sms_type: free-text category for analytics ('reminder', 'manual',
  -- 'quick_confirmation', 'quick_pickup', 'inbound_yn', 'test', etc.)
  sms_type text default 'manual',
  -- is_read: groomer has viewed this in the inbox (only matters for inbound)
  is_read boolean default false,
  created_at timestamptz not null default now()
);

-- Index for fast inbox queries (most-recent-per-client)
create index if not exists idx_sms_messages_groomer_client_time
  on sms_messages (groomer_id, client_id, created_at desc);

-- Index for unread count badge
create index if not exists idx_sms_messages_unread
  on sms_messages (groomer_id, is_read)
  where direction = 'inbound' and is_read = false;


-- ─── RLS ───
alter table sms_messages enable row level security;

drop policy if exists "Groomers read their own SMS messages" on sms_messages;
create policy "Groomers read their own SMS messages"
  on sms_messages
  for select
  to authenticated
  using (groomer_id = auth.uid());

drop policy if exists "Groomers update their own SMS messages" on sms_messages;
create policy "Groomers update their own SMS messages"
  on sms_messages
  for update
  to authenticated
  using (groomer_id = auth.uid());

-- Inserts are done by service-role only (from edge functions), no client write policy needed.


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select count(*) as total_sms from sms_messages;
--
-- select direction, count(*) from sms_messages
-- where groomer_id = (select id from auth.users where email = 'YOUR_EMAIL')
-- group by direction;
