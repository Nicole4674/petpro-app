-- =======================================================
-- PetPro Boarding Database Schema
-- Step 9 - Boarding Build, Phase 1
-- Created: April 15, 2026
-- Run this in Supabase SQL Editor
-- =======================================================

-- 1. Per-shop boarding configuration (one row per groomer/shop)
CREATE TABLE boarding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  setup_type TEXT NOT NULL CHECK (setup_type IN ('numbered', 'capacity', 'sized', 'tiered')),
  allow_family_kennels BOOLEAN DEFAULT true,
  late_checkout_time TIME DEFAULT '12:00:00',
  late_checkout_fee NUMERIC(10,2) DEFAULT 0,
  daily_checks_required BOOLEAN DEFAULT false,
  pricing_model TEXT CHECK (pricing_model IN ('flat', 'by_weight', 'by_kennel', 'custom')) DEFAULT 'flat',
  base_nightly_rate NUMERIC(10,2) DEFAULT 0,
  multi_pet_discount NUMERIC(5,2) DEFAULT 0,
  cancellation_hours INT DEFAULT 48,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(groomer_id)
);

-- 2. Kennel categories (Standard Suite, Large Run, Cat Condo, Puppy Pen, etc.)
CREATE TABLE kennel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  size_label TEXT,
  base_price NUMERIC(10,2) DEFAULT 0,
  default_capacity INT DEFAULT 1,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Individual kennels (Large 1, Large 2, Suite 1, Cat Condo A, etc.)
CREATE TABLE kennels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES kennel_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  position INT DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  is_under_maintenance BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Boarding reservations (the main bookings)
CREATE TABLE boarding_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id UUID NOT NULL REFERENCES groomers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kennel_id UUID REFERENCES kennels(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  start_time TIME DEFAULT '08:00:00',
  end_date DATE NOT NULL,
  end_time TIME DEFAULT '12:00:00',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'wait_list')),
  total_price NUMERIC(10,2) DEFAULT 0,
  deposit_paid NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  confirmed_with_customer BOOLEAN DEFAULT false,
  created_by UUID REFERENCES groomers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

-- 5. Junction table for multi-pet family bookings (siblings sharing a kennel)
CREATE TABLE boarding_reservation_pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES boarding_reservations(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reservation_id, pet_id)
);

-- 6. Add-ons booked per reservation (bath, playtime, daycare, etc.)
CREATE TABLE boarding_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES boarding_reservations(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL
    CHECK (addon_type IN ('bath', 'groom', 'playtime', 'meds_admin', 'daycare', 'extra_walk', 'other')),
  description TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  scheduled_for DATE,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Daily welfare check logs (the kennel tech daily checks - SmartPractice card style)
CREATE TABLE welfare_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES boarding_reservations(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ate_breakfast BOOLEAN,
  ate_lunch BOOLEAN,
  ate_dinner BOOLEAN,
  food_notes TEXT,
  drank_water BOOLEAN,
  walks JSONB DEFAULT '[]'::jsonb,  -- array of walk timestamps
  bowel_movement TEXT CHECK (bowel_movement IN ('normal', 'loose', 'none', 'diarrhea')),
  urination TEXT CHECK (urination IN ('normal', 'none', 'accident', 'frequent')),
  vomited BOOLEAN DEFAULT false,
  vomit_notes TEXT,
  behavior TEXT CHECK (behavior IN ('normal', 'anxious', 'aggressive', 'lethargic', 'playful', 'happy')),
  observations TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  recorded_by UUID REFERENCES groomers(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Medication tracking during boarding stay
CREATE TABLE medication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES boarding_reservations(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dose TEXT NOT NULL,
  scheduled_time TIME,
  given_at TIMESTAMPTZ DEFAULT NOW(),
  given_by UUID REFERENCES groomers(id),
  notes TEXT
);

-- 9. Photo updates sent to clients
CREATE TABLE photo_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES boarding_reservations(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sent_via TEXT CHECK (sent_via IN ('sms', 'email', 'in_app')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by UUID REFERENCES groomers(id)
);

-- 10. Detailed vaccination records (separate vaccines have separate expirations)
-- This is IN ADDITION TO the pets.vaccination_status / vaccination_expiry columns you already have
CREATE TABLE pet_vaccinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vaccine_type TEXT NOT NULL
    CHECK (vaccine_type IN ('rabies', 'dhpp', 'bordetella', 'leptospirosis', 'lyme', 'canine_influenza', 'other')),
  vaccine_name TEXT,
  administered_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  vet_clinic TEXT,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================
-- INDEXES (for fast calendar queries and lookups)
-- =======================================================
CREATE INDEX idx_kennels_groomer ON kennels(groomer_id);
CREATE INDEX idx_kennels_category ON kennels(category_id);
CREATE INDEX idx_reservations_groomer ON boarding_reservations(groomer_id);
CREATE INDEX idx_reservations_kennel ON boarding_reservations(kennel_id);
CREATE INDEX idx_reservations_dates ON boarding_reservations(start_date, end_date);
CREATE INDEX idx_reservations_status ON boarding_reservations(status);
CREATE INDEX idx_welfare_logs_reservation ON welfare_logs(reservation_id);
CREATE INDEX idx_welfare_logs_date ON welfare_logs(log_date);
CREATE INDEX idx_medication_logs_reservation ON medication_logs(reservation_id);
CREATE INDEX idx_photo_updates_client ON photo_updates(client_id);
CREATE INDEX idx_vaccinations_pet ON pet_vaccinations(pet_id);
CREATE INDEX idx_vaccinations_expiry ON pet_vaccinations(expiration_date);
