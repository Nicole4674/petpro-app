-- =============================================================================
-- AI Smart Nudges Schema v1
-- =============================================================================
-- Adds the proactive AI assistant feature ("Smart Nudges").
-- The AI bubble shows a red badge with unread insights like:
--   📅 "Tomorrow's schedule is light — want me to text 5 clients due for groom?"
--   💰 "$340 overdue across 4 clients. Send polite reminder texts?"
--   🐾 "3 clients haven't booked in 6+ weeks. Run a 'we miss you' campaign?"
--
-- Storage: ai_insights table holds each generated nudge with status.
-- Throttling: insights are deduplicated by (groomer_id, rule_key) within
-- a 24-hour window so we don't spam the user with the same nudge twice.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this entire file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- 1. Add the per-groomer toggle (default ON — opt out, not opt in)
alter table groomers
  add column if not exists nudges_enabled boolean not null default true;


-- 2. New table: ai_insights
-- Each row is one generated nudge for one groomer.
-- "rule_key" identifies which rule generated it (light_schedule, overdue_balances,
-- etc.) — used both for deduplication and for letting the UI display the right icon.
create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  rule_key text not null,                 -- 'light_schedule', 'overdue_balances', etc.
  title text not null,                    -- short headline shown as the bubble
  body text not null,                     -- one-sentence detail
  action_label text,                      -- optional CTA button label, e.g. "Text 5 clients"
  action_url text,                        -- optional URL the CTA navigates to
  status text not null default 'unread',  -- unread | read | dismissed | actioned | snoozed
  created_at timestamptz not null default now(),
  read_at timestamptz,                    -- set when user opens the chat and sees it
  actioned_at timestamptz,                -- set when user clicks the action button
  dismissed_at timestamptz,               -- set when user X's it
  snoozed_until timestamptz,              -- if set, hide until this time
  meta jsonb default '{}'::jsonb,         -- room for rule-specific data (e.g. list of client IDs)

  constraint ai_insights_status_check
    check (status in ('unread', 'read', 'dismissed', 'actioned', 'snoozed'))
);


-- 3. Indexes — fast lookup for "what unread insights does this groomer have"
create index if not exists idx_ai_insights_groomer_status_created
  on ai_insights (groomer_id, status, created_at desc);

create index if not exists idx_ai_insights_groomer_rule_recent
  on ai_insights (groomer_id, rule_key, created_at desc);


-- 4. RLS — only the groomer who owns the insight can read/update it
alter table ai_insights enable row level security;

drop policy if exists "Groomer reads own insights" on ai_insights;
create policy "Groomer reads own insights" on ai_insights
  for select using (auth.uid() = groomer_id);

drop policy if exists "Groomer updates own insights" on ai_insights;
create policy "Groomer updates own insights" on ai_insights
  for update using (auth.uid() = groomer_id);

drop policy if exists "Groomer inserts own insights" on ai_insights;
create policy "Groomer inserts own insights" on ai_insights
  for insert with check (auth.uid() = groomer_id);

drop policy if exists "Groomer deletes own insights" on ai_insights;
create policy "Groomer deletes own insights" on ai_insights
  for delete using (auth.uid() = groomer_id);


-- 5. (Optional verify) — show table + columns after creation
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'ai_insights';
