-- =======================================================
-- PetPro — Staff Bug Diagnostic v1
-- Read-only — makes NO changes, just shows info
-- Created: April 17, 2026
-- Run this in Supabase SQL Editor
-- =======================================================
-- WHY THIS FILE:
--   Browser console showed 500 Internal Server Error when
--   loading the Staff page. This file queries Postgres
--   directly to figure out WHY.
--
--   Run all four blocks at once (or one at a time), then
--   paste the results back to Claude.
-- =======================================================


-- =======================================================
-- BLOCK 1 — Do raw rows even exist? (bypasses RLS)
-- =======================================================
-- This counts rows without any WHERE filter. If this returns
-- 0, the table is empty. If > 0, rows exist but RLS hides them.

SELECT COUNT(*) AS total_staff_rows_in_table FROM staff_members;


-- =======================================================
-- BLOCK 2 — Rows that belong to Nicole (owner UUID)
-- =======================================================
-- This is the exact filter the Staff page uses.

SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  status,
  auth_user_id,
  groomer_id,
  created_at
FROM staff_members
WHERE groomer_id = 'c9d34279-e7eb-4730-87df-6f5c049a3022'
ORDER BY created_at DESC;


-- =======================================================
-- BLOCK 3 — Show all RLS policies on staff_members
-- =======================================================
-- This lets us see which policies exist and what their
-- USING clauses look like. A broken USING clause = 500.

SELECT
  policyname,
  cmd        AS operation,
  permissive,
  roles,
  qual       AS using_clause,
  with_check AS check_clause
FROM pg_policies
WHERE tablename = 'staff_members'
ORDER BY policyname;


-- =======================================================
-- BLOCK 4 — Show all RLS policies on staff_permissions
-- =======================================================
-- Checking if staff_permissions policies reference
-- staff_members in a way that could cause recursion.

SELECT
  policyname,
  cmd        AS operation,
  permissive,
  roles,
  qual       AS using_clause,
  with_check AS check_clause
FROM pg_policies
WHERE tablename = 'staff_permissions'
ORDER BY policyname;


-- =======================================================
-- BLOCK 5 — Show any triggers on staff_members
-- =======================================================
-- A failing trigger on SELECT/INSERT/UPDATE = 500.

SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'staff_members'
ORDER BY trigger_name;


-- =======================================================
-- END OF FILE
-- Paste ALL results from all 5 blocks back to Claude.
-- =======================================================
