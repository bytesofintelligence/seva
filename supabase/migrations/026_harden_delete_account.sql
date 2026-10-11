-- ============================================================================
-- MIGRATION: 026_harden_delete_account.sql
--
-- ⚠️  READ BEFORE APPLYING  ⚠️
--
-- `delete_volunteer_account()` is called from the app
-- (src/app/edit-profile-volunteer.tsx) but has NO definition anywhere in this
-- repository — it was created directly in the Supabase dashboard. That means
-- its body has never been reviewed, and it is SECURITY DEFINER by necessity
-- (deleting from auth.users requires privileges `authenticated` does not have).
--
-- An unreviewed SECURITY DEFINER function that deletes users is exactly the
-- shape of a critical vulnerability: if it takes a user id as an argument, or
-- reads one from anywhere other than auth.uid(), any authenticated user can
-- delete any other account.
--
-- BEFORE running this migration, dump what is currently deployed so you know
-- what you are replacing:
--
--   SELECT p.prosecdef AS is_security_definer,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          pg_get_functiondef(p.oid) AS definition
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.proname = 'delete_volunteer_account';
--
-- If the deployed version takes ANY argument, treat it as compromised-by-design
-- and assume accounts could have been deleted by other users.
--
-- This migration replaces it with a version that takes no arguments and can
-- only ever act on `auth.uid()` — the caller's own account, as proven by their
-- JWT. There is no parameter to tamper with.
-- ============================================================================

-- Drop every existing variant. Argument-taking ones MUST not survive (an id
-- parameter is the vulnerability); the zero-argument one is dropped too
-- because CREATE OR REPLACE cannot change a return type, and we don't know
-- what the dashboard-created version returns.
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
    RAISE NOTICE 'Dropped existing delete_volunteer_account: %', fn.sig;
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

  -- No session, no deletion. Without this, service_role or an internal caller
  -- with a null uid would fall through to a DELETE with no WHERE match — or
  -- worse, depending on how the rest is written.
  IF caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Withdraw outstanding commitments so charities don't keep counting a
  -- volunteer who has left. Cancelling rather than deleting preserves the
  -- charity's own historical records.
  UPDATE public.applications
     SET status = 'cancelled'
   WHERE volunteer_id = caller
     AND status IN ('pending', 'approved');

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pledges') THEN
    -- Only 'pledged' — enforce_pledge_status_transition (018) reserves
    -- transfer_claimed -> cancelled for the receiving charity, and tripping
    -- that trigger here would abort the whole deletion.
    UPDATE public.pledges
       SET status = 'cancelled'
     WHERE volunteer_id = caller
       AND status = 'pledged';
  END IF;

  -- Deleting the auth user cascades to profiles (profiles.id REFERENCES
  -- auth.users(id) ON DELETE CASCADE) and onward through the schema.
  -- The WHERE clause is bound to auth.uid() and nothing else.
  DELETE FROM auth.users WHERE id = caller;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    -- Do not leak SQLERRM to the client; it carries table/constraint names.
    RAISE WARNING 'delete_volunteer_account failed for %: %', caller, SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', 'Could not delete account');
END;
$$;

REVOKE ALL ON FUNCTION public.delete_volunteer_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_volunteer_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_volunteer_account() TO authenticated;
