-- =============================================================================
-- Retail POS Schema v1 — Product catalog + Sales + Inventory
-- =============================================================================
-- Turns PetPro into a complete shop management tool, not just appointments.
-- Groomers can sell shampoos, brushes, treats, food, supplements, etc. with
-- barcode scanner support and inventory tracking.
--
-- 4 new tables:
--   • products            — what's for sale (name, barcode, price, qty)
--   • inventory_movements — audit trail (sale, restock, manual adjust)
--   • sales               — sale header (totals, payment, client link)
--   • sale_items          — line items per sale
--
-- All tables RLS-locked to the groomer who owns them, plus staff_members
-- access for shop staff (matches your existing patterns).
--
-- AVAILABLE ON ALL PLANS — no tier gate. Small shops on $70 basic still
-- get retail, which is huge bargain vs MoeGo/Gingr where this doesn't exist.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
-- =============================================================================


-- ─── 1. PRODUCTS ──────────────────────────────────────────────────────────
-- The catalog of stuff for sale. Each product belongs to one groomer.
-- Barcode is optional + UNIQUE per groomer so duplicate scans don't happen.
-- Prices stored in cents-less NUMERIC to match the existing services table.
create table if not exists products (
  id             uuid primary key default gen_random_uuid(),
  groomer_id     uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  description    text,
  barcode        text,                                  -- UPC, EAN, custom — optional
  category       text,                                  -- 'shampoo' / 'food' / 'treats' / 'brushes' / 'other'
  price          numeric(10, 2) not null default 0,     -- what client pays
  cost           numeric(10, 2),                        -- what you paid (optional, for margin reports)
  qty_on_hand    integer not null default 0,            -- inventory count
  low_stock_at   integer default 3,                     -- alert threshold (null = never alert)
  image_url      text,                                  -- Supabase Storage URL
  is_active      boolean not null default true,         -- soft delete via is_active=false
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Barcode lookups need to be fast (POS hits this on every scan)
create index if not exists idx_products_groomer on products(groomer_id);
create index if not exists idx_products_barcode on products(groomer_id, barcode) where barcode is not null;
create index if not exists idx_products_active on products(groomer_id, is_active);

-- One barcode per groomer (so a scan unambiguously maps to one product)
create unique index if not exists uq_products_barcode_per_groomer
  on products(groomer_id, barcode)
  where barcode is not null and is_active = true;


-- ─── 2. INVENTORY MOVEMENTS ───────────────────────────────────────────────
-- Audit trail of every stock change so we can answer "why is qty 3 when I
-- bought 10 last week?" Every increase or decrease is a row. qty_on_hand
-- on products is the running total, this is the ledger.
create table if not exists inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  groomer_id   uuid not null references auth.users(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  qty_change   integer not null,                        -- positive = stock in, negative = stock out
  reason       text not null,                           -- 'sale' / 'restock' / 'adjustment' / 'damage' / 'return'
  reference_id uuid,                                    -- sale_id if reason='sale', else null
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_invmov_product on inventory_movements(product_id, created_at desc);
create index if not exists idx_invmov_groomer on inventory_movements(groomer_id, created_at desc);


-- ─── 3. SALES ─────────────────────────────────────────────────────────────
-- One row per completed sale. Optionally linked to a client + appointment
-- (so embedded retail at end of groom shows up here too).
create table if not exists sales (
  id                    uuid primary key default gen_random_uuid(),
  groomer_id            uuid not null references auth.users(id) on delete cascade,
  client_id             uuid references clients(id) on delete set null,         -- optional (walk-in = null)
  appointment_id        uuid references appointments(id) on delete set null,    -- optional (standalone POS sale = null)
  staff_id              uuid references staff_members(id) on delete set null,   -- who rang it up
  subtotal              numeric(10, 2) not null default 0,
  discount_amount       numeric(10, 2) not null default 0,
  tax_amount            numeric(10, 2) not null default 0,
  total                 numeric(10, 2) not null default 0,
  payment_method        text,                                                   -- 'cash' / 'card' / 'zelle' / 'venmo' / 'check' / 'other' / 'stripe_terminal'
  payment_status        text not null default 'paid',                           -- 'paid' / 'refunded' / 'partial_refund' / 'voided'
  stripe_payment_id     text,                                                   -- when payment_method = 'stripe_terminal' or 'card'
  note                  text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_sales_groomer_date on sales(groomer_id, created_at desc);
create index if not exists idx_sales_client on sales(client_id) where client_id is not null;
create index if not exists idx_sales_appointment on sales(appointment_id) where appointment_id is not null;


-- ─── 4. SALE ITEMS ────────────────────────────────────────────────────────
-- Line items per sale. One row per product-qty combo in a sale.
-- Captures unit_price AT TIME OF SALE so future price changes don't
-- rewrite history.
create table if not exists sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references sales(id) on delete cascade,
  product_id   uuid not null references products(id) on delete restrict,         -- restrict = can't delete a product that's been sold
  qty          integer not null check (qty > 0),
  unit_price   numeric(10, 2) not null,
  line_total   numeric(10, 2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_product on sale_items(product_id);


-- ─── 5. AUTO-UPDATE updated_at TRIGGER on products ────────────────────────
create or replace function update_products_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_products_timestamp on products;
create trigger trg_update_products_timestamp
  before update on products
  for each row execute function update_products_timestamp();


-- ─── 6. ROW-LEVEL SECURITY ────────────────────────────────────────────────
-- Standard pattern: groomer owns their data + staff_members can access
-- their groomer's data. Matches your existing RLS patterns elsewhere.

alter table products enable row level security;
alter table inventory_movements enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;

-- PRODUCTS
drop policy if exists "Groomers manage own products" on products;
create policy "Groomers manage own products"
  on products for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop products" on products;
create policy "Staff access shop products"
  on products for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));

-- INVENTORY_MOVEMENTS
drop policy if exists "Groomers manage own inv movements" on inventory_movements;
create policy "Groomers manage own inv movements"
  on inventory_movements for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop inv movements" on inventory_movements;
create policy "Staff access shop inv movements"
  on inventory_movements for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));

-- SALES
drop policy if exists "Groomers manage own sales" on sales;
create policy "Groomers manage own sales"
  on sales for all to authenticated
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

drop policy if exists "Staff access shop sales" on sales;
create policy "Staff access shop sales"
  on sales for all to authenticated
  using (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()))
  with check (groomer_id in (select groomer_id from staff_members where auth_user_id = auth.uid()));

-- SALE_ITEMS — joins through sales (no groomer_id directly, uses parent)
drop policy if exists "Groomers manage own sale items" on sale_items;
create policy "Groomers manage own sale items"
  on sale_items for all to authenticated
  using (sale_id in (select id from sales where groomer_id = auth.uid()))
  with check (sale_id in (select id from sales where groomer_id = auth.uid()));

-- Qualify s.id so it's unambiguous (both sales and staff_members have an 'id' column)
drop policy if exists "Staff access shop sale items" on sale_items;
create policy "Staff access shop sale items"
  on sale_items for all to authenticated
  using (sale_id in (select s.id from sales s join staff_members sm on sm.groomer_id = s.groomer_id where sm.auth_user_id = auth.uid()))
  with check (sale_id in (select s.id from sales s join staff_members sm on sm.groomer_id = s.groomer_id where sm.auth_user_id = auth.uid()));


-- ─── 7. Verify ────────────────────────────────────────────────────────────
-- After running, you can confirm with:
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('products','inventory_movements','sales','sale_items');
--   -- Should return 4 rows
--
--   select count(*) from products;             -- 0 (empty so far)
--   select count(*) from sales;                -- 0
