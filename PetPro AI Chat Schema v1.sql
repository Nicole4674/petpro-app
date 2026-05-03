-- =============================================================================
-- PetPro AI Chat Schema v1
-- =============================================================================
-- Database tables for the PetPro AI chat feature (lifted-guardrails Claude
-- with the Groomer Brain + Breed Reference baked in as the system prompt).
--
-- Two tables:
--   • ai_conversations  — one row per chat session
--   • ai_messages       — one row per user message + Claude reply
--
-- Token tracking columns are included now so the token system (Phase 2) can
-- start logging usage immediately without another migration. They default to
-- NULL and get populated by the petpro-ai-chat edge function.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── ai_conversations ───────────────────────────────────────────────────────
-- One row per chat session. A groomer can have many conversations going.
-- Title can be auto-generated from the first user message (truncated to ~50
-- chars), or the groomer can rename it later.
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  title text not null default 'New conversation',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- last_message_at drives the conversation list sort (most recent on top)
  last_message_at timestamptz not null default now()
);

-- Index for the conversation list query (groomer's chats, newest first)
create index if not exists ai_conversations_groomer_recent_idx
  on ai_conversations(groomer_id, last_message_at desc)
  where is_archived = false;


-- ─── ai_messages ────────────────────────────────────────────────────────────
-- One row per message. Includes user prompts AND Claude responses.
-- Photo URLs point to Supabase Storage. Voice transcripts get the same
-- treatment as text (Whisper transcribes first, we save the text).
--
-- Token tracking columns (api_input_tokens, api_output_tokens) get populated
-- by the petpro-ai-chat edge function from Anthropic's response metadata.
-- They power the cost analytics + per-message margin math.
create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  -- groomer_id duplicated here so RLS policies can be cheap (no join needed)
  groomer_id uuid not null references groomers(id) on delete cascade,
  -- role = 'user' (groomer's message) OR 'assistant' (Claude's reply)
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Optional image URL (Supabase Storage path). Set when groomer attached a photo.
  image_url text,
  -- True if this user message originated from voice input (Whisper transcription).
  -- Helps with analytics — we can see how popular voice mode is.
  was_voice_input boolean not null default false,
  -- Anthropic API token usage (populated by edge function from API response).
  -- Only set on assistant messages. NULL on user messages (we don't bill the user
  -- side; we bill on the response).
  api_input_tokens int,
  api_output_tokens int,
  -- petpro_token_cost = how many of the groomer's PetPro tokens this consumed.
  -- Always 1 for now (1 message exchange = 1 token), but stored so future pricing
  -- experiments are easy. Only set on assistant messages.
  petpro_token_cost int,
  created_at timestamptz not null default now()
);

-- Index for loading a conversation's messages in order
create index if not exists ai_messages_conversation_idx
  on ai_messages(conversation_id, created_at);

-- Index for groomer-wide queries (analytics, usage reports)
create index if not exists ai_messages_groomer_recent_idx
  on ai_messages(groomer_id, created_at desc);


-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- Groomers can ONLY see and modify their own conversations + messages.
-- No deletes allowed (audit trail + prevents token-cheat by deleting then
-- re-asking). Archive instead.

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

-- ai_conversations: select your own
drop policy if exists "ai_conv_select_own" on ai_conversations;
create policy "ai_conv_select_own"
  on ai_conversations for select
  using (auth.uid() = groomer_id);

-- ai_conversations: insert as yourself
drop policy if exists "ai_conv_insert_own" on ai_conversations;
create policy "ai_conv_insert_own"
  on ai_conversations for insert
  with check (auth.uid() = groomer_id);

-- ai_conversations: update your own (for renaming title, archiving)
drop policy if exists "ai_conv_update_own" on ai_conversations;
create policy "ai_conv_update_own"
  on ai_conversations for update
  using (auth.uid() = groomer_id);

-- ai_messages: select your own
drop policy if exists "ai_msg_select_own" on ai_messages;
create policy "ai_msg_select_own"
  on ai_messages for select
  using (auth.uid() = groomer_id);

-- ai_messages: insert as yourself
-- (the edge function inserts assistant replies using the service role,
-- which bypasses RLS — so this only governs direct client inserts of
-- user messages, which we may or may not allow depending on how we wire
-- up the chat. Safer to allow + double-check on the server.)
drop policy if exists "ai_msg_insert_own" on ai_messages;
create policy "ai_msg_insert_own"
  on ai_messages for insert
  with check (auth.uid() = groomer_id);


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_name in ('ai_conversations', 'ai_messages')
-- order by table_name, ordinal_position;
