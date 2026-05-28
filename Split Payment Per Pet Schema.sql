-- =============================================================================
-- Split Payment Per Pet — Schema v1
-- =============================================================================
-- Adds 2 columns to the `payments` table so the Take Payment popup can split
-- a multi-pet appointment bill across multiple payers — e.g. Mom pays for
-- Bella, daughter pays for Max.
--
-- New columns:
--   • pet_id      — which pet this payment row covers (null = whole bill)
--   • payer_name  — optional free-text "who's paying" ("Mom", "Daughter Lisa")
--
-- Real use case: a customer brought 2 dogs in this week and asked Nicole to
-- split the bill on two separate cards. This feature makes that one-tap.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file → Run
--
-- Safe to re-run.
-- =============================================================================

alter table payments add column if not exists pet_id      uuid;
alter table payments add column if not exists payer_name  text;

-- FK on pet_id so deletes cascade cleanly
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_pet_id_fkey'
  ) then
    alter table payments add constraint payments_pet_id_fkey
      foreign key (pet_id) references pets(id) on delete set null;
  end if;
end$$;

-- Index to look up "all payments for this pet"
create index if not exists idx_payments_pet on payments(pet_id) where pet_id is not null;


-- ─── Verify ──
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'payments'
--    and column_name in ('pet_id','payer_name');
--   -- → 2 rows
-- =============================================================================
