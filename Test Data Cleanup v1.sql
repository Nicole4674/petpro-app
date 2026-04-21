-- =======================================================
-- PetPro Test Data Cleanup v1
-- Run this in Supabase SQL Editor.
-- Clears all appointment/boarding/chat activity so clients
-- don't see test data when they log in to their portal.
--
-- KEEPS: clients, pets, vaccinations, pet/client notes,
-- services, staff, kennels, shop settings, booking rules,
-- blocked times (lunch breaks), groomer AI memory,
-- push subscriptions, paychecks.
--
-- DELETES: appointments, payments, boarding, waitlist,
-- recurring series, client messages.
-- =======================================================

-- =======================================================
-- STEP 1 — PREVIEW (run this first, review counts)
-- =======================================================

SELECT 'appointments'              AS table_name, COUNT(*) AS rows_to_delete FROM appointments
UNION ALL
SELECT 'appointment_pets',         COUNT(*) FROM appointment_pets
UNION ALL
SELECT 'payments',                 COUNT(*) FROM payments
UNION ALL
SELECT 'boarding_reservations',    COUNT(*) FROM boarding_reservations
UNION ALL
SELECT 'boarding_reservation_pets',COUNT(*) FROM boarding_reservation_pets
UNION ALL
SELECT 'medication_logs',          COUNT(*) FROM medication_logs
UNION ALL
SELECT 'welfare_logs',             COUNT(*) FROM welfare_logs
UNION ALL
SELECT 'recurring_series',         COUNT(*) FROM recurring_series
UNION ALL
SELECT 'grooming_waitlist',        COUNT(*) FROM grooming_waitlist
UNION ALL
SELECT 'messages',                 COUNT(*) FROM messages
UNION ALL
SELECT 'threads',                  COUNT(*) FROM threads
ORDER BY table_name;


-- =======================================================
-- STEP 2 — CLEANUP (run after reviewing Step 1)
-- Wrapped in a single transaction. If any statement fails,
-- the entire block rolls back and nothing is deleted.
-- =======================================================

BEGIN;

-- Child/junction tables first (to avoid FK errors)
DELETE FROM appointment_pets;
DELETE FROM payments;
DELETE FROM boarding_reservation_pets;
DELETE FROM medication_logs;
DELETE FROM welfare_logs;

-- Activity parent tables
DELETE FROM appointments;
DELETE FROM boarding_reservations;
DELETE FROM recurring_series;
DELETE FROM grooming_waitlist;

-- Client-facing messages
DELETE FROM messages;
DELETE FROM threads;

COMMIT;


-- =======================================================
-- STEP 3 — VERIFY (re-run the Step 1 preview)
-- All rows_to_delete values should now be 0.
-- =======================================================

SELECT 'appointments'              AS table_name, COUNT(*) AS remaining FROM appointments
UNION ALL
SELECT 'appointment_pets',         COUNT(*) FROM appointment_pets
UNION ALL
SELECT 'payments',                 COUNT(*) FROM payments
UNION ALL
SELECT 'boarding_reservations',    COUNT(*) FROM boarding_reservations
UNION ALL
SELECT 'boarding_reservation_pets',COUNT(*) FROM boarding_reservation_pets
UNION ALL
SELECT 'medication_logs',          COUNT(*) FROM medication_logs
UNION ALL
SELECT 'welfare_logs',             COUNT(*) FROM welfare_logs
UNION ALL
SELECT 'recurring_series',         COUNT(*) FROM recurring_series
UNION ALL
SELECT 'grooming_waitlist',        COUNT(*) FROM grooming_waitlist
UNION ALL
SELECT 'messages',                 COUNT(*) FROM messages
UNION ALL
SELECT 'threads',                  COUNT(*) FROM threads
ORDER BY table_name;
