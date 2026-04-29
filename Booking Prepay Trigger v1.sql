-- =============================================================================
-- Booking Prepay Trigger v1
-- =============================================================================
-- When a shop has set `require_prepay_to_book = true` in shop_settings,
-- newly-inserted appointments are automatically forced into the 'pending'
-- status — regardless of which path created them (AI Claude, manual form,
-- groomer-side modal, etc.).
--
-- After the client pays through the portal, stripe-charge-card flips the
-- status back to 'confirmed'. Until then, the booking shows as pending in
-- both the groomer's calendar and the client's portal.
--
-- This is INSERT only — once an appointment exists, the groomer can freely
-- update its status (confirm, cancel, no-show, etc.) without the trigger
-- interfering.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Trigger function — runs before each new appointment INSERT
create or replace function force_pending_when_prepay_required()
returns trigger as $$
declare
  shop_requires_prepay boolean;
begin
  -- Look up the shop's setting. coalesce to false if no shop_settings row
  -- exists yet (new groomer who hasn't saved settings).
  select coalesce(require_prepay_to_book, false)
    into shop_requires_prepay
    from shop_settings
    where groomer_id = new.groomer_id;

  -- If this shop requires prepay, force every new booking into 'pending'.
  -- The booking flips to 'confirmed' when the client pays through the
  -- portal (handled by stripe-charge-card edge function).
  if shop_requires_prepay = true then
    new.status := 'pending';
  end if;

  return new;
end;
$$ language plpgsql security definer;


-- 2. Drop old trigger if rerunning the migration, then create fresh
drop trigger if exists appointments_prepay_check on appointments;

create trigger appointments_prepay_check
  before insert on appointments
  for each row
  execute function force_pending_when_prepay_required();


-- =============================================================================
-- Optional verify — run after the migration to confirm
-- =============================================================================
-- select tgname, tgenabled
-- from pg_trigger
-- where tgrelid = 'appointments'::regclass
--   and tgname = 'appointments_prepay_check';
