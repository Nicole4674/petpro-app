-- =============================================================================
-- Agreements Schema v1 — custom waivers + e-signature
-- =============================================================================
-- Creates two tables:
--   1. agreements         — the waiver TEMPLATES each groomer customizes
--   2. signed_agreements  — the SIGNED records (one per client per waiver)
--
-- Each groomer gets ONE grooming waiver + ONE boarding waiver (rows in
-- agreements). They can edit the text — defaults are pre-written with
-- the late-fee + matted-pet liability clauses Nicole asked for.
--
-- Clients sign at signup (or before their first booking). Signature can
-- be typed (signature_text) OR drawn (signature_image as base64 PNG).
-- We snapshot the agreement content at signing time so future text
-- edits don't change what someone agreed to.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
--   5. The script also seeds default waivers for ALL existing groomers
--      so you (and any other groomer accounts) have something to start with.
-- =============================================================================


-- ─── agreements (templates) ────────────────────────────────────────────────
create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null,
  type text not null check (type in ('grooming', 'boarding')),
  title text not null,
  content text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- One waiver per type per groomer (so we don't accidentally show
  -- the client two grooming waivers to sign).
  unique (groomer_id, type)
);

create index if not exists agreements_groomer_idx on agreements(groomer_id);

-- ─── signed_agreements (signature records) ─────────────────────────────────
create table if not exists signed_agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agreement_id uuid not null references agreements(id) on delete cascade,
  -- One of these two will be set; both is fine too (drawn + typed name)
  signature_text text,
  signature_image text,                  -- base64 PNG of drawn signature
  -- Snapshot of waiver content at time of signing — if groomer later edits
  -- the agreement text, we still know exactly what THIS client agreed to.
  agreement_content_snapshot text,
  signed_at timestamptz default now(),
  ip_address text,
  user_agent text
);

create index if not exists signed_agreements_client_idx on signed_agreements(client_id);
create index if not exists signed_agreements_agreement_idx on signed_agreements(agreement_id);

-- ─── RLS — Row Level Security ─────────────────────────────────────────────
alter table agreements enable row level security;
alter table signed_agreements enable row level security;

-- Groomers can fully manage their OWN agreements
drop policy if exists "Groomers manage own agreements" on agreements;
create policy "Groomers manage own agreements" on agreements
  for all
  using (groomer_id = auth.uid())
  with check (groomer_id = auth.uid());

-- Clients can READ their groomer's agreements (so they can sign them).
-- We match via the clients table → groomer_id.
drop policy if exists "Clients read own groomer agreements" on agreements;
create policy "Clients read own groomer agreements" on agreements
  for select
  using (
    groomer_id in (
      select groomer_id from clients where user_id = auth.uid()
    )
  );

-- Groomers can view all signatures for their clients
drop policy if exists "Groomers view client signatures" on signed_agreements;
create policy "Groomers view client signatures" on signed_agreements
  for select
  using (
    client_id in (
      select id from clients where groomer_id = auth.uid()
    )
  );

-- Clients can insert their own signatures + read them back
drop policy if exists "Clients sign agreements" on signed_agreements;
create policy "Clients sign agreements" on signed_agreements
  for insert
  with check (
    client_id in (
      select id from clients where user_id = auth.uid()
    )
  );

drop policy if exists "Clients read own signatures" on signed_agreements;
create policy "Clients read own signatures" on signed_agreements
  for select
  using (
    client_id in (
      select id from clients where user_id = auth.uid()
    )
  );

-- ─── Default waiver text — used when seeding new groomers ──────────────────
-- These are written to be useful out-of-the-box. The two key clauses Nicole
-- asked for are baked in: late fees (#1) + matted/pelted dog liability (#2).
-- Groomers can edit the text from the Agreements page in PetPro.

-- ─── Seed default waivers for ALL existing groomers ────────────────────────
-- For each groomer that doesn't have a grooming/boarding waiver yet, insert
-- the default text. Safe to re-run — the unique(groomer_id, type) constraint
-- + the on conflict do nothing means it won't duplicate.

insert into agreements (groomer_id, type, title, content)
select
  g.id,
  'grooming',
  'Grooming Service Agreement',
  $$GROOMING SERVICE AGREEMENT

By signing this agreement, you (the pet owner) acknowledge and agree to the following:

1. APPOINTMENT TIMING & LATE FEES
If you arrive more than 15 minutes late to your scheduled appointment, you will be charged 50% of the agreed grooming price as a late fee. This policy keeps our schedule fair to all clients and respects everyone's time.

2. MATTED & PELTED COATS — LIABILITY RELEASE
Severely matted, pelted, or neglected coats restrict blood flow to the skin and can hide pre-existing conditions including (but not limited to): hot spots, sores, cuts, bruising, redness, parasites, or skin irritation. These conditions are often only revealed AFTER the matting is removed.

We use safe, professional techniques to remove mats. However, matted coats may result in:
- Minor nicks or cuts in areas of dense matting
- Redness, brush burn, or skin irritation
- Bruising caused by the matted coat's restricted blood flow
- Hematomas in the ears (especially in long-coated breeds)

These outcomes are NOT the result of negligent grooming — they are conditions caused by the matted coat itself, revealed during the de-matting process. By signing this agreement, you release the groomer from all liability for skin conditions, irritation, nicks, cuts, or bruising that result from grooming a matted or pelted pet.

3. EMERGENCY CARE
If your pet shows signs of significant distress during grooming, we will stop immediately and contact you. In a true medical emergency, we may transport your pet to a veterinarian and you will be responsible for any associated costs.

4. PHOTOS
We may take before/after photos for our records, social media, or marketing. Pet faces may be shown publicly unless you specifically request otherwise in writing.

5. PAYMENT
Payment is due at completion of service. Cards on file may be charged automatically per the payment terms set when you booked.

By signing below, you acknowledge that you have read, understood, and agreed to the above terms.$$
from groomers g
where not exists (
  select 1 from agreements where groomer_id = g.id and type = 'grooming'
);

insert into agreements (groomer_id, type, title, content)
select
  g.id,
  'boarding',
  'Boarding Service Agreement',
  $$BOARDING SERVICE AGREEMENT

By signing this agreement, you (the pet owner) acknowledge and agree to the following:

1. VACCINATION REQUIREMENTS
All boarded pets must be current on Rabies, DHPP, and Bordetella vaccinations. Proof of vaccination must be provided BEFORE check-in. Pets without current vaccinations will not be accepted for boarding.

2. HEALTH & BEHAVIOR DISCLOSURE
You confirm that your pet:
- Is in good general health and free of contagious illness
- Has no history of aggressive behavior toward humans or other animals
- Is current on flea / tick prevention

If your pet shows aggressive behavior or signs of contagious illness during the stay, we reserve the right to contact you for early pickup at your expense.

3. EMERGENCY CARE
In a medical emergency, we will attempt to contact you immediately. If we cannot reach you within a reasonable time, we are authorized to seek veterinary care on your behalf, and you agree to be responsible for any associated costs.

4. LATE PICKUP
Pickups more than 1 hour past your scheduled pickup time will be charged a daycare fee equivalent to one additional day of boarding.

5. ABANDONMENT
If your pet is not picked up within 7 days of the scheduled pickup date and we cannot reach you despite reasonable attempts, the pet may be considered abandoned and turned over to local animal services per state law.

6. PERSONAL ITEMS
We are not responsible for lost or damaged personal items (toys, bedding, leashes, harnesses, etc.) brought to the boarding facility. Please label all items clearly.

By signing below, you acknowledge that you have read, understood, and agreed to the above terms.$$
from groomers g
where not exists (
  select 1 from agreements where groomer_id = g.id and type = 'boarding'
);

-- =============================================================================
-- Optional verify
-- =============================================================================
-- select id, groomer_id, type, title, length(content) as content_length
-- from agreements
-- order by groomer_id, type;
