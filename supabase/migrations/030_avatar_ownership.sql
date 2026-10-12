-- ============================================================================
-- MIGRATION: 030_avatar_ownership.sql
--
-- 006_fix_storage_policies.sql left the `avatars` bucket open to every
-- signed-in user: anyone could read, overwrite or delete anyone else's photo.
-- That also undid 028 -- a volunteer who cannot read another volunteer's
-- profile row could still list the bucket and download their picture.
--
-- 1. Storage policies: you may only write inside your own folder, and may only
--    read what the app actually needs you to see.
-- 2. delete_volunteer_account(): refuses to finish while the caller's photos
--    are still in storage, so "delete my account" cannot leave them behind.
--
-- The app uploads to `<auth.uid()>/avatar-<timestamp>.<ext>` for volunteers
-- AND for charity logos (src/components/AvatarUpload.tsx), so "first folder
-- segment = my user id" is the ownership test for both.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Avatar policies
--
-- Policies are permissive (OR'd together), so a single leftover from 004b, 006
-- or one made by hand in the dashboard would keep the bucket open. Rather than
-- guess at names, drop every policy on storage.objects that mentions the
-- avatars bucket, then create exactly four.
-- ============================================================================
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (COALESCE(qual, '') ILIKE '%avatars%' OR COALESCE(with_check, '') ILIKE '%avatars%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
    RAISE NOTICE 'dropped avatar policy: %', p.policyname;
  END LOOP;
END;
$$;

-- READ. Three cases, matching the screens that show a photo:
--   * your own files;
--   * a coordinator viewing volunteers (directory, applicants) -- the same
--     "owns a charity" test 028 uses for reading volunteer profiles;
--   * a charity's logo, which every signed-in user sees while browsing. Only
--     the one file a charity row points at, not the coordinator's whole folder.
-- `objects.name` is qualified because `charities` has a `name` column too.
CREATE POLICY avatars_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.charities c
        WHERE c.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.charities c
        WHERE c.avatar_url = objects.name
      )
    )
  );

-- WRITE. Own folder only.
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text
  );

-- These policies only protect a PRIVATE bucket: a public bucket serves files
-- by URL without consulting them. Not changed here (flipping it could break
-- any stored public URLs) -- just surfaced.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL
     AND EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars' AND public) THEN
    RAISE WARNING 'The avatars bucket is PUBLIC: files are readable by URL regardless of these policies. Make it private in Storage settings.';
  END IF;
END;
$$;


-- ============================================================================
-- 2. delete_volunteer_account(): do not leave photos behind
--
-- Storage files must be removed through the Storage API -- deleting the
-- storage.objects row from SQL would orphan the actual file (and Supabase
-- blocks it). So the app removes the caller's folder first
-- (src/app/edit-profile-volunteer.tsx) and this function verifies it: if any
-- file is still there, nothing is deleted and the app can retry.
--
-- Also new: a coordinator's account is not deleted from here. profiles ->
-- charities -> opportunities -> applications all cascade, so one call would
-- wipe a charity's sessions and every volunteer's sign-ups to them. There is
-- no coordinator delete button in the app; that removal is an admin action.
--
-- Otherwise identical to 026: no arguments, acts only on auth.uid().
-- ============================================================================
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'delete_volunteer_account'
  LOOP
    EXECUTE format('DROP FUNCTION %s', fn.sig);
  END LOOP;
END;
$$;

CREATE FUNCTION public.delete_volunteer_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller UUID;
BEGIN
  caller := (SELECT auth.uid());

  IF caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF EXISTS (SELECT 1 FROM public.charities c WHERE c.owner_id = caller) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Coordinator accounts cannot be deleted in the app. Please contact SEVA support.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'avatars'
      AND (storage.foldername(o.name))[1] = caller::text
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Your profile photo could not be removed. Please try again.');
  END IF;

  -- Withdraw outstanding commitments (see 026 for why cancel, not delete).
  UPDATE public.applications
     SET status = 'cancelled'
   WHERE volunteer_id = caller
     AND status IN ('pending', 'confirmed', 'approved');

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pledges') THEN
    UPDATE public.pledges
       SET status = 'cancelled'
     WHERE volunteer_id = caller
       AND status = 'pledged';
  END IF;

  DELETE FROM auth.users WHERE id = caller;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'delete_volunteer_account failed for %: %', caller, SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', 'Could not delete account');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_volunteer_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_volunteer_account() TO authenticated;

COMMIT;
