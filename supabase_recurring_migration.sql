-- ====================================================================
-- PetPro: Recurring Appointments Migration
-- Task #19 — Recurring appointment series
-- Run this ONCE in Supabase SQL Editor
-- ====================================================================

-- 1. Create the recurring_series table
CREATE TABLE IF NOT EXISTS public.recurring_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    groomer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    interval_weeks INT NOT NULL CHECK (interval_weeks > 0),
    total_count INT NOT NULL CHECK (total_count > 0 AND total_count <= 52),
    start_date DATE NOT NULL,
    start_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by groomer
CREATE INDEX IF NOT EXISTS idx_recurring_series_groomer
    ON public.recurring_series(groomer_id);

-- Index for fast lookup by client (for "shift all future recurring" feature)
CREATE INDEX IF NOT EXISTS idx_recurring_series_client
    ON public.recurring_series(client_id, status);


-- 2. Add recurring columns to appointments table
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS recurring_series_id UUID REFERENCES public.recurring_series(id) ON DELETE SET NULL;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS recurring_sequence INT;

-- Add conflict flag so we can paint yellow tiles when an auto-booked
-- recurring appointment overlaps with another booking
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS recurring_conflict BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick series lookup
CREATE INDEX IF NOT EXISTS idx_appointments_recurring_series
    ON public.appointments(recurring_series_id)
    WHERE recurring_series_id IS NOT NULL;


-- 3. Row Level Security for recurring_series
ALTER TABLE public.recurring_series ENABLE ROW LEVEL SECURITY;

-- Groomer can SELECT their own series
DROP POLICY IF EXISTS "Groomer can view own series" ON public.recurring_series;
CREATE POLICY "Groomer can view own series"
    ON public.recurring_series
    FOR SELECT
    USING (auth.uid() = groomer_id);

-- Groomer can INSERT series for themselves
DROP POLICY IF EXISTS "Groomer can create own series" ON public.recurring_series;
CREATE POLICY "Groomer can create own series"
    ON public.recurring_series
    FOR INSERT
    WITH CHECK (auth.uid() = groomer_id);

-- Groomer can UPDATE their own series
DROP POLICY IF EXISTS "Groomer can update own series" ON public.recurring_series;
CREATE POLICY "Groomer can update own series"
    ON public.recurring_series
    FOR UPDATE
    USING (auth.uid() = groomer_id);

-- Groomer can DELETE their own series
DROP POLICY IF EXISTS "Groomer can delete own series" ON public.recurring_series;
CREATE POLICY "Groomer can delete own series"
    ON public.recurring_series
    FOR DELETE
    USING (auth.uid() = groomer_id);


-- 4. Auto-update updated_at timestamp on row change
CREATE OR REPLACE FUNCTION public.update_recurring_series_timestamp()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_recurring_series_timestamp ON public.recurring_series;
CREATE TRIGGER trg_update_recurring_series_timestamp
    BEFORE UPDATE ON public.recurring_series
    FOR EACH ROW
    EXECUTE FUNCTION public.update_recurring_series_timestamp();


-- ====================================================================
-- DONE — verify with:
--   SELECT * FROM public.recurring_series;  (should be empty)
--   \d public.appointments                   (should show 3 new columns)
-- ====================================================================
