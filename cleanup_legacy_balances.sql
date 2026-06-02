-- ============================================================
-- PetPro — Clear legacy unpaid balances (migration cleanup)
-- Marks all GROOMING appointments dated BEFORE 2026-06-01 as paid
-- by inserting a "catch-up" payment equal to each remaining balance.
--
-- Safe by design:
--   * Nothing is deleted. Appointment history stays intact.
--   * Each inserted payment uses method='other' (the only allowed
--     "misc" value) and a unique note so it can be found/undone,
--     and is dated to the appointment day (not today), so today's
--     revenue is NOT affected.
--   * Fully reversible — see STEP 4 (rollback) at the bottom.
--
-- Run the steps IN ORDER in the Supabase SQL Editor.
-- ============================================================


-- ─────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only, changes nothing)
-- Run this first to see exactly what will be cleared.
-- ─────────────────────────────────────────────
SELECT
  a.appointment_date,
  c.first_name || ' ' || c.last_name AS client,
  pt.name                            AS pet,
  COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
    - COALESCE(p.paid, 0)            AS balance_to_clear
FROM appointments a
LEFT JOIN clients c ON c.id = a.client_id
LEFT JOIN pets    pt ON pt.id = a.pet_id
LEFT JOIN (
  SELECT appointment_id, SUM(amount) AS paid
  FROM payments
  WHERE appointment_id IS NOT NULL
  GROUP BY appointment_id
) p ON p.appointment_id = a.id
WHERE a.appointment_date < '2026-06-01'
  AND a.status NOT IN ('cancelled', 'no_show', 'rescheduled')
  AND (COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
       - COALESCE(p.paid, 0)) > 0.01
ORDER BY a.appointment_date;


-- ─────────────────────────────────────────────
-- STEP 2 — TOTALS (read-only) — sanity check the count/$ amount
-- ─────────────────────────────────────────────
SELECT
  COUNT(*)                                 AS appointments_to_clear,
  SUM(COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
      - COALESCE(p.paid, 0))               AS total_balance_to_clear
FROM appointments a
LEFT JOIN (
  SELECT appointment_id, SUM(amount) AS paid
  FROM payments
  WHERE appointment_id IS NOT NULL
  GROUP BY appointment_id
) p ON p.appointment_id = a.id
WHERE a.appointment_date < '2026-06-01'
  AND a.status NOT IN ('cancelled', 'no_show', 'rescheduled')
  AND (COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
       - COALESCE(p.paid, 0)) > 0.01;


-- ─────────────────────────────────────────────
-- STEP 3 — APPLY THE CLEANUP (this writes data)
-- Only run after STEP 1/2 look right.
-- ─────────────────────────────────────────────
INSERT INTO payments
  (appointment_id, client_id, groomer_id, pet_id, amount, tip_amount, method, notes, created_at)
SELECT
  a.id,
  a.client_id,
  a.groomer_id,
  a.pet_id,
  (COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
   - COALESCE(p.paid, 0))                       AS amount,
  0                                             AS tip_amount,
  'other'                                       AS method,
  'Legacy balance cleared during migration from previous system' AS notes,
  (a.appointment_date::timestamp + interval '12 hours')          AS created_at
FROM appointments a
LEFT JOIN (
  SELECT appointment_id, SUM(amount) AS paid
  FROM payments
  WHERE appointment_id IS NOT NULL
  GROUP BY appointment_id
) p ON p.appointment_id = a.id
WHERE a.appointment_date < '2026-06-01'
  AND a.status NOT IN ('cancelled', 'no_show', 'rescheduled')
  AND (COALESCE(a.final_price, a.quoted_price, 0) - COALESCE(a.discount_amount, 0)
       - COALESCE(p.paid, 0)) > 0.01;


-- ─────────────────────────────────────────────
-- VERIFY — should return 0 rows after STEP 3
-- (same query as STEP 1; empty result = all cleared)
-- ─────────────────────────────────────────────
-- (re-run STEP 1 to confirm)


-- ─────────────────────────────────────────────
-- STEP 4 — ROLLBACK (only if you need to undo STEP 3)
-- Removes ONLY the catch-up payments this script created
-- (matched by both method and the exact note text, so it will
--  never touch a real 'other' payment).
-- ─────────────────────────────────────────────
-- DELETE FROM payments
-- WHERE method = 'other'
--   AND notes = 'Legacy balance cleared during migration from previous system';
