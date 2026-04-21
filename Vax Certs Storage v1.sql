-- =======================================================
-- PetPro Vaccination Certificate Photo Storage
-- Run this in Supabase SQL Editor.
-- Creates a PRIVATE storage bucket for vaccine cert photos
-- + 4 RLS policies so each groomer can only access
-- files in their own folder.
--
-- Folder path pattern: vax-certs/{groomer_id}/{pet_id}/{filename}
-- Allowed file types: JPG, PNG, WebP, HEIC, HEIF, PDF
-- Max file size: 10 MB per file
-- =======================================================

-- 1. Create the bucket (private — not publicly accessible)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vax-certs',
  'vax-certs',
  false,
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2. RLS Policies on storage.objects
-- Each groomer can only access files where the first folder
-- in the path matches their own auth.uid().

-- SELECT — groomer can view their own certs
CREATE POLICY "Groomers can view their own vax certs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'vax-certs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT — groomer can upload to their own folder
CREATE POLICY "Groomers can upload vax certs to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vax-certs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE — groomer can update (e.g., overwrite) their own certs
CREATE POLICY "Groomers can update their own vax certs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'vax-certs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE — groomer can remove their own certs
CREATE POLICY "Groomers can delete their own vax certs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vax-certs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
