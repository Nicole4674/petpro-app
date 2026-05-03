-- =============================================================================
-- PetPro Expenses Schema v1
-- =============================================================================
-- In-app expense tracking so groomers can capture tax-deductible business
-- expenses without paying for QuickBooks. Pairs with the existing payments
-- data to give a real Profit & Loss view (Revenue − Expenses = Profit).
--
-- WHY THIS EXISTS:
--   Most solo groomers either (a) don't track expenses and overpay taxes,
--   (b) try a spreadsheet and abandon it, or (c) pay $30+/mo for QuickBooks
--   they never log into. PetPro Expenses solves it inside the app where
--   they already work, with PetPro AI helping fill it out.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
-- =============================================================================


-- ─── expenses ───────────────────────────────────────────────────────────────
-- One row per business expense. Shop-level for v1 (the owner tracks for the
-- whole shop). Future v2 can add staff_id for per-employee tracking.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  expense_date date not null,
  -- Always store money as cents (int) to avoid float math errors.
  amount_cents int not null check (amount_cents >= 0),
  -- Category — one of the IRS-deductible buckets PetPro suggests. 'other'
  -- is the catch-all so groomers don't get blocked by missing category.
  category text not null check (category in (
    'supplies',           -- shampoo, conditioner, brushes, blades, scissors
    'equipment',          -- clippers, dryers, tables (capital purchases)
    'blade_sharpening',   -- routine sharpening + small repairs
    'rent',               -- shop space rent or mortgage interest
    'utilities',          -- electric, water, internet for the shop
    'phone',              -- business portion of phone bill
    'vehicle_mileage',    -- mobile groomers (HUGE deduction — track miles!)
    'marketing',          -- ads, business cards, social media spend
    'software',           -- PetPro itself, Stripe fees, other subscriptions
    'insurance',          -- business liability, equipment insurance
    'education',          -- grooming classes, conferences, certifications
    'doggy_supplies',     -- treats, bandanas, bows given to clients
    'other'               -- anything that doesn't fit a category
  )),
  vendor text,            -- "PetEdge", "Andis", "ABC Property LLC" — optional
  payment_method text check (payment_method in (
    'cash', 'card', 'zelle', 'venmo', 'check', 'paypal', 'other'
  )),
  notes text,             -- "monthly shampoo restock", "Sophia's birthday gift", etc.
  receipt_url text,       -- future: Supabase Storage URL for photo receipt
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for the most common queries
-- Monthly view: groomer + date range
create index if not exists expenses_groomer_date_idx
  on expenses(groomer_id, expense_date desc);
-- Category breakdown: groomer + category for "how much on supplies this year"
create index if not exists expenses_groomer_category_idx
  on expenses(groomer_id, category, expense_date desc);


-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- Each groomer owns their own expense rows. No one else can see or touch them.
alter table expenses enable row level security;

drop policy if exists "expenses_select_own" on expenses;
create policy "expenses_select_own"
  on expenses for select
  using (auth.uid() = groomer_id);

drop policy if exists "expenses_insert_own" on expenses;
create policy "expenses_insert_own"
  on expenses for insert
  with check (auth.uid() = groomer_id);

drop policy if exists "expenses_update_own" on expenses;
create policy "expenses_update_own"
  on expenses for update
  using (auth.uid() = groomer_id);

drop policy if exists "expenses_delete_own" on expenses;
create policy "expenses_delete_own"
  on expenses for delete
  using (auth.uid() = groomer_id);


-- ─── Auto-update updated_at on UPDATE ───────────────────────────────────────
-- Standard pattern — keeps updated_at fresh whenever a row is edited.
create or replace function update_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_expenses_updated_at on expenses;
create trigger trg_expenses_updated_at
  before update on expenses
  for each row
  execute function update_expenses_updated_at();


-- =============================================================================
-- Optional verify
-- =============================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_name = 'expenses'
-- order by ordinal_position;
