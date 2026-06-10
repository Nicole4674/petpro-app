-- =============================================================================
-- Mass SMS Blast Tracking v1
-- =============================================================================
-- Logs every mass-SMS blast so the app can show "did it work?" — how many of
-- the texted clients booked within 7 days, and roughly how much revenue that
-- brought in. The number that proves the subscription pays for itself.
--
-- One row per blast (not per recipient — recipient ids live in an array).
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- =============================================================================

create table if not exists sms_blasts (
  id              uuid primary key default gen_random_uuid(),
  groomer_id      uuid not null references auth.users(id) on delete cascade,
  sent_at         timestamptz not null default now(),
  message         text not null,
  segment_key     text,            -- which quick-segment chip was used (null = manual pick)
  recipient_ids   uuid[] not null default '{}',
  recipient_count int not null default 0
);

create index if not exists idx_sms_blasts_groomer_sent
  on sms_blasts (groomer_id, sent_at desc);

alter table sms_blasts enable row level security;

drop policy if exists "Groomers manage own blasts" on sms_blasts;
create policy "Groomers manage own blasts"
  on sms_blasts
  for all
  to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());
