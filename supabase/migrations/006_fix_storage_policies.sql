-- supabase/migrations/006_fix_storage_policies.sql
-- Create minimal storage policies for avatars bucket
-- Security: bucket is private + profiles table RLS prevents misuse

DROP POLICY IF EXISTS "Avatar insert - own user_id folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update - own user_id folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete - own user_id folder" ON storage.objects;
DROP POLICY IF EXISTS "Avatar read for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Avatar read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar insert for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Avatar insert" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar deletes" ON storage.objects;

-- Allow authenticated users to read from avatars
CREATE POLICY "Allow avatar reads" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to upload to avatars
CREATE POLICY "Allow avatar uploads" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to update avatars
CREATE POLICY "Allow avatar updates" ON storage.objects
  FOR UPDATE
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to delete avatars
CREATE POLICY "Allow avatar deletes" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
