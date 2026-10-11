-- ============================================================================
-- MIGRATION: 025_auth_hardening.sql
-- Purpose: Close the authorization holes found in the authentication audit.
--
--   A. `charities` INSERT was open to any authenticated user with any
--      owner_id, letting a volunteer manufacture a charity (and therefore
--      coordinator powers over its opportunities, applications and pledges).
--   B. `profiles.role` was both set from client-controlled signup metadata and
--      updatable by the user themselves — a self-serve promotion to
--      coordinator.
--   C. `profiles` INSERT was `WITH CHECK (true)`.
--   D. Nothing at the database layer required a verified email before writing.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- D. Verified-email gate
--
-- `auth.users.email_confirmed_at` is the only authority on verification. The
-- app must not be the thing enforcing this, so the check lives here and is
-- applied by triggers on the tables that accept user-generated content.
--
-- SECURITY DEFINER because `authenticated` has no read access to auth.users.
-- STABLE so it is evaluated once per statement rather than per row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_email_verified()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

-- NOTE on every REVOKE in this file: Supabase sets ALTER DEFAULT PRIVILEGES so
-- new functions are granted EXECUTE to anon/authenticated *explicitly*.
-- `REVOKE ... FROM PUBLIC` does not touch an explicit grant, so each role must
-- be named. Revoking from PUBLIC alone leaves the function callable by anon.
REVOKE ALL ON FUNCTION public.is_email_verified() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_verified() TO authenticated;


CREATE OR REPLACE FUNCTION public.require_verified_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only gate real end-user traffic. service_role (admin tooling, future edge
  -- functions) and internal triggers must not be blocked by this.
  IF (SELECT auth.role()) = 'authenticated' AND NOT public.is_email_verified() THEN
    RAISE EXCEPTION 'Email address must be verified before performing this action'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_verified_email() FROM PUBLIC, anon, authenticated;

-- Applied to the tables that accept user-generated content. Deliberately NOT
-- applied to `profiles` — the signup trigger writes that row before the user
-- can possibly have verified, and profile edits are self-scoped and harmless.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['charities', 'opportunities', 'applications', 'sponsorship_items', 'pledges']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS require_verified_email_trigger ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER require_verified_email_trigger
           BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.require_verified_email()', t);
    END IF;
  END LOOP;
END;
$$;


-- ============================================================================
-- B. profiles.role — make the database the authority
--
-- Two separate holes, closed separately:
--
--   1. handle_new_user() copied `raw_user_meta_data->>'role'` straight in.
--      That metadata is supplied by the client in the signUp() call and can be
--      set to anything. We keep it — self-serve charity signup is the intended
--      product behaviour — but we now whitelist the value so it can only ever
--      be one of the two known roles, never an unexpected string, and it is
--      recorded as a *claim* made at signup.
--
--   2. The UPDATE policy let a user rewrite their own role afterwards. That is
--      now blocked outright by a trigger, so the only ways a role can change
--      are service_role (dashboard/admin) or the promote function below.
--
-- Note: today, coordinator power comes from owning a `charities` row, not from
-- this string — see part A. Locking both means neither path is enough on its
-- own.
-- ============================================================================
-- First, pin the search_path of the volunteer-ID trigger from 014. It calls
-- nextval('volunteer_id_seq') unqualified, so it inherits whatever search_path
-- its caller has. handle_new_user() below fires it, and an empty search_path
-- there would make every signup fail with "relation volunteer_id_seq does not
-- exist". Pinning it here makes the function correct regardless of caller.
CREATE OR REPLACE FUNCTION public.generate_volunteer_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.role = 'volunteer' AND NEW.volunteer_id IS NULL THEN
    NEW.volunteer_id := 'SEVA-' || LPAD(nextval('volunteer_id_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- 'public' rather than '': this function fires other triggers on profiles
-- (generate_volunteer_id) that resolve unqualified names. Pinned explicitly,
-- so it is still not influenced by the caller's session.
SET search_path = 'public'
AS $$
DECLARE
  claimed_role TEXT;
BEGIN
  claimed_role := NEW.raw_user_meta_data->>'role';

  -- Whitelist. Anything unrecognised (or absent) falls back to the
  -- least-privileged role rather than being trusted.
  IF claimed_role IS NULL OR claimed_role NOT IN ('volunteer', 'charity') THEN
    claimed_role := 'volunteer';
  END IF;

  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    claimed_role,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- Block self-service role changes. RLS can't express this: the UPDATE policy
-- has to permit the user to edit their own row (name, phone, avatar), and a
-- WITH CHECK cannot see the OLD value to compare against.
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND (SELECT auth.role()) = 'authenticated' THEN
    RAISE EXCEPTION 'Role cannot be changed by the account holder'
      USING ERRCODE = '42501';
  END IF;

  -- volunteer_id is the public-facing SEVA ID, generated by trigger in 014.
  -- It must not be rewritten by its owner either.
  IF NEW.volunteer_id IS DISTINCT FROM OLD.volunteer_id
     AND (SELECT auth.role()) = 'authenticated' THEN
    RAISE EXCEPTION 'Volunteer ID cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_role_self_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_role_self_change_trigger ON public.profiles;
CREATE TRIGGER prevent_role_self_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_change();


-- ============================================================================
-- C. profiles INSERT — scope to the authenticated user
--
-- The signup trigger is SECURITY DEFINER and bypasses RLS, so it does not need
-- a permissive policy. Everything else should only ever be able to insert its
-- own row.
-- ============================================================================
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));


-- ============================================================================
-- A. charities INSERT — restore ownership binding
--
-- 005_profile_rls_policies.sql replaced 001's correct `owner_id = auth.uid()`
-- check with `auth.role() = 'authenticated'`, which allowed ANY authenticated
-- user to insert a charity row owned by ANY user id. Combined with the
-- opportunities/applications/pledges policies (all of which key off
-- `charities.owner_id`), that was a full path from volunteer to coordinator.
--
-- New rule: you may only create a charity you own, and only if your profile
-- role is 'charity' (which, per part B, you can no longer set yourself after
-- signup).
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert charities" ON public.charities;
DROP POLICY IF EXISTS charities_insert ON public.charities;

CREATE POLICY charities_insert_own ON public.charities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'charity'
    )
  );

-- Ownership must also be immutable: without this, a charity owner could hand
-- their row (and its opportunities/pledges) to another account, and 005's
-- UPDATE policy would allow it since only the OLD row is checked by USING.
DROP POLICY IF EXISTS "Users can update own charities" ON public.charities;
DROP POLICY IF EXISTS charities_update ON public.charities;

CREATE POLICY charities_update_own ON public.charities
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));


-- ============================================================================
-- Admin-only role promotion
--
-- The supported way to change someone's role. EXECUTE is granted to
-- service_role only, so it is unreachable from the mobile app with the anon
-- key — it exists for dashboard/admin use and for a future server-side flow
-- that verifies a charity properly before promoting a coordinator.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_profile_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new_role NOT IN ('volunteer', 'charity') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Runs as owner, so the prevent_role_self_change trigger's auth.role()
  -- check does not fire for it.
  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$;

-- anon MUST be named here. It is reachable with the publishable/anon key that
-- ships inside the mobile app, so leaving it granted would make this function
-- a one-call privilege escalation for anyone who read the bundle.
REVOKE ALL ON FUNCTION public.admin_set_profile_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(UUID, TEXT) TO service_role;
