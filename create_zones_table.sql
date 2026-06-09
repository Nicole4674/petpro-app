-- ============================================================
-- PetPro — Service Zones (mobile route "Area Days")
-- A zone = a named area (by ZIP) served on certain days of the week.
-- Lets mobile groomers batch bookings geographically.
--
-- Safe to run once. Re-running is harmless (IF NOT EXISTS guards).
-- Run in the Supabase SQL Editor.
-- ============================================================

create table if not exists public.zones (
  id           uuid primary key default gen_random_uuid(),
  groomer_id   uuid not null,
  name         text not null,
  color        text default '#7c3aed',
  -- Days this zone is served. 0 = Sunday … 6 = Saturday (matches JS getDay()).
  days_of_week smallint[] default '{}',
  -- ZIP codes that belong to this zone.
  zips         text[] default '{}',
  created_at   timestamptz default now()
);

create index if not exists zones_groomer_idx on public.zones (groomer_id);

-- Row-level security: a groomer can only see/manage their own zones.
alter table public.zones enable row level security;

drop policy if exists "Groomers manage own zones" on public.zones;
create policy "Groomers manage own zones"
  on public.zones
  for all
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());
