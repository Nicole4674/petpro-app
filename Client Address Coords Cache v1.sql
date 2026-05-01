-- =============================================================================
-- Client Address Coords Cache v1
-- =============================================================================
-- Adds latitude / longitude columns to the `clients` table so we can cache
-- geocoded coordinates from Google Maps. Without this cache, every page load
-- of the Route view re-geocodes every client address (slow + costs API calls).
--
-- With this cache:
--   • First time a client's address is seen → geocode via Google → store coords
--   • Every page load after → read coords directly from DB → instant render
--   • If client's address changes → coords auto-cleared on save → re-geocode next time
--
-- Future-proofs us for:
--   • Phase 4 route optimizer (uses coords directly, no live geocoding needed)
--   • Phase 8 drive-time padding when booking
--   • Mobile-aware booking modal (Task #12)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- 1. Add latitude + longitude columns. Numeric(10,7) gives ~1cm precision —
--    way more than needed for routing, but standard for geo data.
alter table clients
  add column if not exists latitude  numeric(10, 7);

alter table clients
  add column if not exists longitude numeric(10, 7);


-- 2. Add a column to track when the address was last geocoded. Used to
--    detect if a client's address changed since we cached coords (manual
--    UPDATE clients SET address = '...' wipes coords automatically below).
alter table clients
  add column if not exists coords_geocoded_at timestamptz;


-- 3. Trigger: when a client's address changes, wipe the cached coords so
--    the Route page re-geocodes on next load. Prevents stale coordinates
--    pointing at the OLD address after a move.
create or replace function clear_client_coords_on_address_change()
returns trigger
language plpgsql
as $$
begin
  -- Only wipe if address actually changed (not just any update)
  if new.address is distinct from old.address then
    new.latitude := null;
    new.longitude := null;
    new.coords_geocoded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_client_coords on clients;
create trigger trg_clear_client_coords
  before update on clients
  for each row
  execute function clear_client_coords_on_address_change();


-- 4. Index for fast filtering — useful for "show me all clients we've
--    successfully mapped" queries later.
create index if not exists idx_clients_has_coords
  on clients (latitude, longitude)
  where latitude is not null and longitude is not null;


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'clients'
--   and column_name in ('latitude', 'longitude', 'coords_geocoded_at');
