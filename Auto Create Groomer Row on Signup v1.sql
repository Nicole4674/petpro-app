-- =============================================================================
-- Auto-Create Groomer Row on Signup v1
-- =============================================================================
-- Fixes the "ghost user" bug. The old flow relied on JavaScript in Signup.jsx
-- to insert a row into groomers right after Supabase Auth created the user.
-- That JS insert was sometimes failing silently (RLS policy), leaving auth
-- users with NO matching groomers row. Result: paid customers locked out,
-- because the Stripe webhook can't UPDATE a row that doesn't exist.
--
-- This trigger moves that responsibility into the database itself. The moment
-- a new auth.users row is inserted, a matching groomers row is auto-created.
-- Runs as SECURITY DEFINER so RLS can't block it. Bulletproof.
--
-- Only fires for GROOMER signups (those carry business_name in their
-- metadata). Client signups via /portal/signup don't carry business_name,
-- so they're skipped — no false-positive groomer rows for pet owners.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================

-- Function that creates the groomers row from the new auth user's metadata
create or replace function public.handle_new_groomer_signup()
returns trigger
language plpgsql
security definer  -- run as the function owner, bypassing RLS
set search_path = public
as $$
begin
  -- Only fire for groomer signups (have business_name in metadata).
  -- Client + staff signups don't have business_name, so they're skipped.
  if new.raw_user_meta_data ? 'business_name' then
    insert into public.groomers (id, email, full_name, business_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      coalesce(new.raw_user_meta_data->>'business_name', '')
    )
    on conflict (id) do nothing;  -- harmless no-op if a row already exists
  end if;
  return new;
end;
$$;

-- Wire it up: every new auth.users row triggers the function
drop trigger if exists on_auth_user_created_groomer on auth.users;

create trigger on_auth_user_created_groomer
  after insert on auth.users
  for each row
  execute function public.handle_new_groomer_signup();


-- =============================================================================
-- BACKFILL — fix any existing ghost users from before this trigger existed
-- =============================================================================
-- Find auth users whose signup metadata says "I'm a groomer" (business_name
-- is set) but who don't have a matching groomers row yet, then create one.
-- =============================================================================
insert into public.groomers (id, email, full_name, business_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'business_name', '')
from auth.users u
where u.raw_user_meta_data ? 'business_name'
  and not exists (
    select 1 from public.groomers g where g.id = u.id
  );


-- =============================================================================
-- Verify (optional) — count of groomer rows after backfill
-- =============================================================================
-- select count(*) as total_groomers from groomers;
