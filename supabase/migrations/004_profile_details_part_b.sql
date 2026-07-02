-- supabase/migrations/004_profile_details_part_b.sql
-- Storage RLS policies for avatars bucket
-- Note: Create the 'avatars' bucket in Supabase Dashboard first (Storage → Create bucket → Name: avatars, Private)

-- Policy 1: Authenticated users can read (SELECT) any avatar
CREATE POLICY "Avatar read for authenticated users" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Policy 2: Users can upload (INSERT) to their own user_id folder
CREATE POLICY "Avatar insert - own user_id folder" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy 3: Users can update (overwrite) their own files
CREATE POLICY "Avatar update - own user_id folder" ON storage.objects
  FOR UPDATE
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy 4: Users can delete their own files
CREATE POLICY "Avatar delete - own user_id folder" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
