-- ============================================================================
-- MIGRATION: 028_profile_privacy.sql
--
-- Closes the last item from the auth audit: every authenticated user could
-- read every profile row.
--
-- 005_profile_rls_policies.sql replaced 001's correct `id = auth.uid()` SELECT
-- policy with:
--
--     CREATE POLICY "Authenticated users can select profiles" ON profiles
--       FOR SELECT USING (auth.role() = 'authenticated');
--
-- That exposed full_name, phone, bio, location, avatar_url and volunteer_id
-- for the entire user base to anyone with an account. The comment at the time
-- said it was "needed for charities to view applicants" — true, but it granted
-- it to volunteers as well, which is what this migration separates.
--
-- New model (two permissive SELECT policies, OR'd):
--
--   1. profiles_select_own          - you can always read your own row.
--   2. profiles_select_coordinator  - if you own a charity, you can read
--                                     VOLUNTEER rows.
--
-- A volunteer therefore sees exactly one profile: their own.
--
-- "Coordinator" is defined as owning a `charities` row, which is the same
-- predicate the opportunities/applications/pledges policies already use for
-- coordinator power. It is deliberately NOT `profiles.role = 'charity'`: a
-- policy on `profiles` that reads `profiles` would recurse.
--
-- Bank details on `charities` are intentionally left exactly as they are --
-- they are treated as public within the authenticated app. This migration
-- does not touch the charities table or any of its policies.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Coordinator test, as a SECURITY DEFINER helper.
--
-- Two reasons this is a function rather than an inline EXISTS on `charities`:
--
--   * Recursion safety. Inline, the subquery would be subject to the charities
--     SELECT policy. That policy is `USING (true)` today, but if it ever grows
--     a reference back to `profiles`, the two policies would recurse and every
--     profile read would fail. SECURITY DEFINER evaluates the ownership check
--     without RLS, so the two tables stay decoupled.
--
--   * Cost. Marked STABLE so the planner evaluates it once per statement
--     instead of once per candidate row -- volunteer-directory reads the whole
--     volunteer table through this predicate.
--
-- It leaks nothing: a boolean about the caller's own account.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.charities c
    WHERE c.owner_id = (SELECT auth.uid())
  );
$$;

-- Unlike the trigger helpers in 025, this one IS called from an RLS policy.
-- Policy expressions are evaluated with the querying role's privileges, so
-- `authenticated` must hold EXECUTE or every profile read would fail.
-- anon is named explicitly (Supabase's ALTER DEFAULT PRIVILEGES grants to it).
REVOKE ALL ON FUNCTION public.is_coordinator() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_coordinator() TO authenticated;


-- ----------------------------------------------------------------------------
-- Replace every historical SELECT policy on profiles with the two above.
-- Both naming conventions are dropped: 001 used snake_case, 005 used prose.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can select profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can select own profile"            ON public.profiles;
DROP POLICY IF EXISTS profiles_select                           ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own                       ON public.profiles;
DROP POLICY IF EXISTS profiles_select_coordinator               ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- Serves volunteer-directory, opportunity/[id]/applications, volunteer/[id]
-- and the pledger list on sponsorship-item/[id] -- all coordinator-only
-- screens. Scoped to volunteer rows: a coordinator has no need to read another
-- coordinator's profile, and does not get one.
CREATE POLICY profiles_select_coordinator ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role = 'volunteer'
    AND public.is_coordinator()
  );
