-- =============================================================================
-- Mobile Pickup Schema v1a — Add default_mobile_visit to clients
-- =============================================================================
-- Tiny addition to v1. Lets a client be tagged as default Mobile Visit OR
-- default Mobile Pick Up (or storefront). Without this column the client
-- form would only have 2 options instead of 3.
-- =============================================================================

alter table clients
  add column if not exists default_mobile_visit boolean not null default false;

-- Optional sanity: prevent a client from being marked as BOTH default visit
-- types at once. UI should enforce, but DB belt-and-suspenders.
alter table clients
  drop constraint if exists clients_one_default_mobile_type;
alter table clients
  add constraint clients_one_default_mobile_type
  check (not (default_mobile_visit = true and default_mobile_pickup = true));
