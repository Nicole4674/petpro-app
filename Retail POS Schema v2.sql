-- =============================================================================
-- Retail POS Schema v2 — Top-Tier POS Features
-- =============================================================================
-- Builds on Retail POS Schema v1. Adds the "must-have" POS features so big
-- shops can switch to PetPro without feeling like a downgrade.
--
-- What this migration adds:
--   • Tips (preset + custom) + tip attribution to a specific staff member
--   • Discount reason tracking (VIP / Comp / Damaged / Employee / Other)
--   • Custom line items ($15 de-shed surcharge, no inventory link)
--   • Split payments (cash + card combo on one sale)
--   • Refunds (partial or full, with reason, restock-aware)
--   • Cash drawer sessions (open/close with starting cash, counted cash, variance)
--   • Parked sales (save cart, ring quick walk-in, come back to it)
--   • Receipt customization (logo + footer in shop_settings)
--   • Promotes sales_tax_rate from localStorage → shop_settings (multi-device)
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Verify with the SELECTs at the bottom
--
-- Safe to re-run — every change is guarded with IF NOT EXISTS / IF EXISTS.
-- =============================================================================


-- ─── 1. SALES — extra columns ─────────────────────────────────────────────
-- Tips (separate from total so reports can split tip vs revenue)
alter table sales add column if not exists tip_amount               numeric(10, 2) not null default 0;
alter table sales add column if not exists tip_recipient_staff_id   uuid references staff_members(id) on delete set null;

-- Discount reason (free-text bucket, expected values below in app code)
--   'vip' / 'comp' / 'damaged' / 'employee' / 'returning_customer' / 'other'
alter table sales add column if not exists discount_reason          text;

-- Status — for parked carts (sale not yet completed)
--   'completed' / 'parked' / 'voided'
alter table sales add column if not exists status                   text not null default 'completed';

-- Optional label so a parked cart can be named ("Mrs. Smith pickup")
alter table sales add column if not exists parked_label             text;

-- Link to the cash drawer session this sale rang under (null = no drawer open)
alter table sales add column if not exists cash_drawer_session_id   uuid;

-- Quick index for parked sales lookup
create index if not exists idx_sales_groomer_status on sales(groomer_id, status, created_at desc);


-- ─── 2. SALE_ITEMS — allow custom (no-product) line items ────────────────
-- Drop NOT NULL so we can record ad-hoc charges like "de-shed surcharge $15"
-- that aren't tied to a real product. custom_name fills in the missing label.
alter table sale_items alter column product_id drop not null;
alter table sale_items add column if not exists custom_name text;

-- Constraint: either product_id OR custom_name must exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sale_items_product_or_custom_chk'
  ) then
    alter table sale_items add constraint sale_items_product_or_custom_chk
      check (product_id is not null or custom_name is not null);
  end if;
end$$;


-- ─── 3. SALE_PAYMENTS — split payments (N tenders per 1 sale) ────────────
-- Existing sales.payment_method stays as the "primary" / single payment.
-- For split sales, write one row per tender here. Sum of amounts = sale.total.
create table if not exists sale_payments (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references sales(id) on delete cascade,
  groomer_id      uuid not null references auth.users(id) on delete cascade,
  method          text not null,                                          -- 'cash' / 'card' / 'zelle' / etc
  amount          numeric(10, 2) not null check (amount > 0),
  stripe_payment_id text,                                                 -- when method = 'card' or 'stripe_terminal'
  cash_tendered   numeric(10, 2),                                         -- when method = 'cash'
  cash_change     numeric(10, 2),                                         -- when method = 'cash'
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_sale_payments_sale on sale_payments(sale_id);
create index if not exists idx_sale_payments_groomer on sale_payments(groomer_id, created_at desc);


-- ─── 4. SALE_REFUNDS — partial or full refunds ───────────────────────────
-- One sale can have multiple partial refunds (refund the shampoo today,
-- then the brush next week). Each row writes its own audit trail.
create table if not exists sale_refunds (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references sales(id) on delete cascade,
  groomer_id      uuid not null references auth.users(id) on delete cascade,
  amount          numeric(10, 2) not null check (amount > 0),
  reason          text,                                                   -- 'wrong_item' / 'damaged' / 'dog_reaction' / 'customer_changed_mind' / 'other'
  refunded_by     uuid references staff_members(id) on delete set null,
  stripe_refund_id text,                                                  -- if processed via Stripe
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_sale_refunds_sale on sale_refunds(sale_id);
create index if not exists idx_sale_refunds_groomer on sale_refunds(groomer_id, created_at desc);


-- ─── 5. CASH_DRAWER_SESSIONS — open/close drawer with variance ───────────
-- One row per "till session." Open at start of day with starting cash, close
-- at end of day with counted cash. expected_cash = starting + cash sales − cash
-- refunds in this session. variance = ending − expected. If non-zero, the
-- groomer entered a note about why.
create table if not exists cash_drawer_sessions (
  id              uuid primary key default gen_random_uuid(),
  groomer_id      uuid not null references auth.users(id) on delete cascade,
  staff_id        uuid references staff_members(id) on delete set null,   -- who opened/closed
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  starting_cash   numeric(10, 2) not null default 0,
  ending_cash     numeric(10, 2),
  expected_cash   numeric(10, 2),                                         -- computed at close: starting + cash in − cash out
  variance        numeric(10, 2),                                         -- ending − expected (negative = short, positive = over)
  note            text,                                                   -- "drawer was 2 short, I think I gave too much change to dog #4"
  created_at      timestamptz not null default now()
);

create index if not exists idx_drawer_groomer_open on cash_drawer_sessions(groomer_id, closed_at) where closed_at is null;
create index if not exists idx_drawer_groomer_recent on cash_drawer_sessions(groomer_id, opened_at desc);

-- Now that the table exists, add the FK from sales → drawer session
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_cash_drawer_session_id_fkey'
  ) then
    alter table sales add constraint sales_cash_drawer_session_id_fkey
      foreign key (cash_drawer_session_id) references cash_drawer_sessions(id) on delete set null;
  end if;
end$$;


-- ─── 6. SHOP_SETTINGS — receipt customization + persistent tax rate ──────
-- Logo shows at top of every receipt (print/email/SMS). Footer text appears
-- at bottom — perfect for return policy, "see you in 6 weeks!" reminder, etc.
alter table shop_settings add column if not exists receipt_logo_url     text;
alter table shop_settings add column if not exists receipt_footer_text  text;
alter table shop_settings add column if not exists sales_tax_rate       numeric(5, 3) default 0;  -- e.g. 8.250 = 8.25%


-- ─── 7. ROW-LEVEL SECURITY — same pattern as v1 ──────────────────────────
alter table sale_payments         enable row level security;
alter table sale_refunds          enable row level security;
alter table cash_drawer_sessions  enable row level security;

-- SALE_PAYMENTS
drop policy if exists "Groomers manage own sale payments" on sale_payments;
create policy "Groomers manage own sale payments"
  on sale_payments for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop sale payments" on sale_payments;
create policy "Staff access shop sale payments"
  on sale_payments for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));

-- SALE_REFUNDS
drop policy if exists "Groomers manage own sale refunds" on sale_refunds;
create policy "Groomers manage own sale refunds"
  on sale_refunds for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop sale refunds" on sale_refunds;
create policy "Staff access shop sale refunds"
  on sale_refunds for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));

-- CASH_DRAWER_SESSIONS
drop policy if exists "Groomers manage own drawer sessions" on cash_drawer_sessions;
create policy "Groomers manage own drawer sessions"
  on cash_drawer_sessions for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop drawer sessions" on cash_drawer_sessions;
create policy "Staff access shop drawer sessions"
  on cash_drawer_sessions for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));


-- ─── 8. VERIFY ────────────────────────────────────────────────────────────
-- After running, paste these in a fresh query window to confirm:
--
--   -- 3 new tables should exist
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('sale_payments', 'sale_refunds', 'cash_drawer_sessions');
--   -- → 3 rows
--
--   -- New columns on sales
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'sales'
--      and column_name in ('tip_amount','tip_recipient_staff_id','discount_reason','status','parked_label','cash_drawer_session_id');
--   -- → 6 rows
--
--   -- sale_items.product_id should be NULLABLE now
--   select is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'sale_items' and column_name = 'product_id';
--   -- → 'YES'
--
--   -- shop_settings receipt columns
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'shop_settings'
--      and column_name in ('receipt_logo_url','receipt_footer_text','sales_tax_rate');
--   -- → 3 rows
-- =============================================================================
