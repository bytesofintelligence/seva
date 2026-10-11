-- ============================================================================
-- MIGRATION: 027_security_hardening.sql
--
-- Follow-up to 025/026. Those two are already applied to production and are
-- NOT touched here. This migration closes the issues that the post-025 audit
-- found still outstanding:
--
--   1. Functions still reachable by `anon`. 018/019/021/023 use the
--      `REVOKE EXECUTE ... FROM PUBLIC` form, which does NOT remove Supabase's
--      explicit ALTER DEFAULT PRIVILEGES grant to anon. 025 documented this
--      trap but only fixed the functions it created itself.
--
--   2. `handle_new_user()` never had a REVOKE (025 used CREATE OR REPLACE,
--      which preserves the pre-existing ACL).
--
--   3. `generate_series_occurrences()` — SECURITY DEFINER, anon-callable, and
--      it INSERTs into `opportunities` with no authorization check on the
--      caller and no bound on the loop count. Verified: an unauthenticated
--      caller created 52 opportunity rows. This is fixed two ways here — the
--      anon grant is removed AND an ownership check is added, because even
--      after the revoke, ANY authenticated user could generate occurrences
--      into ANY charity's series.
--
--   4. `profiles` INSERT accepted a caller-supplied `role` and `volunteer_id`.
--      `prevent_role_self_change` (025) is BEFORE UPDATE only, and
--      `profiles_insert_self` only checked the id. Verified: a user whose
--      profiles row was missing could self-insert role='charity'.
--
--   5. Coordinator self-registration. Signup metadata still decided the role,
--      so anyone could register as a charity. For v1 the role is now assigned
--      by the database only, and a charity request goes into an approval queue.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. Remove the `anon` EXECUTE grants left by the FROM PUBLIC-only revokes.
--
-- Every one of these is called from the app only while logged in (verified
-- against src/), so `authenticated` is re-granted and nothing breaks.
-- The REVOKE names each role explicitly — that is the whole point.
-- ============================================================================
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.expire_stale_pledges()',
    'public.charity_accepts_sponsorship(uuid)',
    'public.get_bank_details(uuid)',
    'public.mark_item_fulfilled(uuid)',
    'public.generate_series_occurrences(uuid,date,integer)',
    'public.get_opportunity_volunteer_counts()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
      RAISE NOTICE 'locked to authenticated: %', fn;
    ELSE
      RAISE NOTICE 'skipped (not present): %', fn;
    END IF;
  END LOOP;
END;
$$;


-- ============================================================================
-- 2. Trigger functions: no role needs EXECUTE on these.
--
-- PostgreSQL checks EXECUTE at trigger-creation time, not at fire time, so
-- revoking everything here does not affect the triggers. None of them are
-- directly callable anyway (RETURNS TRIGGER is rejected with 0A000), so this
-- is defence in depth rather than a live hole — but `handle_new_user` is a
-- SECURITY DEFINER function that writes profiles.role, and it should not be
-- sitting there with an anon grant.
-- ============================================================================
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.generate_volunteer_id()',
    'public.generate_pledge_reference()',
    'public.enforce_pledge_capacity()',
    'public.enforce_pledge_status_transition()',
    'public.sync_sponsorship_item_status()',
    'public.cascade_opportunity_cancellation()',
    'public.require_verified_email()',
    'public.prevent_role_self_change()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END;
$$;

-- is_email_verified() is only ever called from require_verified_email(), which
-- is SECURITY DEFINER and therefore does not need the caller to hold EXECUTE.
-- 025 granted it to authenticated; it is not needed.
REVOKE ALL ON FUNCTION public.is_email_verified() FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 3. generate_series_occurrences: authorize the caller, bound the work.
--
-- Body is otherwise byte-for-byte what 023 defined. Two additions at the top:
-- an ownership check and a cap on p_weeks.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_series_occurrences(
  p_series_id UUID,
  p_from_date DATE,
  p_weeks INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series opportunity_series%ROWTYPE;
  v_week INT;
  v_week_start DATE;
  v_occurrence_date DATE;
  v_starts_at TIMESTAMPTZ;
  v_inserted_count INT := 0;
  v_day_offset INT;
BEGIN
  SELECT * INTO v_series FROM opportunity_series WHERE id = p_series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity_series % not found', p_series_id;
  END IF;

  -- AUTHORIZATION (new in 027). This function is SECURITY DEFINER, so it
  -- bypasses the opportunities RLS policies entirely. Without this check any
  -- authenticated user could materialise occurrences into any charity's
  -- series. Only gate real end-user traffic: service_role and cron (no JWT
  -- role, or 'service_role') must still be able to extend the horizon.
  IF (SELECT auth.role()) = 'authenticated'
     AND NOT EXISTS (
       SELECT 1 FROM charities c
       WHERE c.id = v_series.charity_id
         AND c.owner_id = (SELECT auth.uid())
     )
  THEN
    RAISE EXCEPTION 'Not authorized to generate occurrences for this series'
      USING ERRCODE = '42501';
  END IF;

  -- Bound the work. The loop inserts one row per week, so an unbounded
  -- p_weeks is a row-count amplification vector.
  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 104 THEN
    RAISE EXCEPTION 'p_weeks must be between 1 and 104 (got %)', p_weeks;
  END IF;

  FOR v_week IN 0..(p_weeks - 1) LOOP
    v_week_start := p_from_date + (v_week * 7);

    -- Next occurrence date on or after v_week_start matching recurrence_day_of_week.
    v_day_offset := (v_series.recurrence_day_of_week - EXTRACT(DOW FROM v_week_start)::INT + 7) % 7;
    v_occurrence_date := v_week_start + v_day_offset;

    -- NOTE: exception_dates are deliberately NOT consulted here. Per 024, the
    -- app cancels already-generated occurrences on those dates immediately
    -- after generation. Preserved exactly so 027 changes no behaviour.
    -- Skip if a row for this series already exists on this occurrence_date.
    IF EXISTS (
      SELECT 1 FROM opportunities
      WHERE series_id = p_series_id
      AND occurrence_date = v_occurrence_date
    ) THEN
      CONTINUE;
    END IF;

    v_starts_at := (v_occurrence_date || ' ' || v_series.template_time)::TIMESTAMP AT TIME ZONE 'Europe/London';

    INSERT INTO opportunities (
      charity_id, title, description, location, type,
      latitude, longitude, target_volunteers, max_volunteers,
      signup_mode, featured, series_id, occurrence_date,
      starts_at, status, spots_filled
    )
    VALUES (
      v_series.charity_id,
      v_series.template->>'title',
      v_series.template->>'description',
      v_series.template->>'location',
      v_series.template->>'type',
      (v_series.template->>'latitude')::NUMERIC,
      (v_series.template->>'longitude')::NUMERIC,
      (v_series.template->>'target_volunteers')::INT,
      (v_series.template->>'max_volunteers')::INT,
      v_series.template->>'signup_mode',
      COALESCE((v_series.template->>'featured')::BOOLEAN, false),
      p_series_id,
      v_occurrence_date,
      v_starts_at,
      'active',
      0
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_series_occurrences(uuid,date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_series_occurrences(uuid,date,integer) TO authenticated;


-- ============================================================================
-- 4. profiles INSERT: role and volunteer_id are system-assigned.
--
-- Enforced by a trigger rather than by the RLS WITH CHECK, because the
-- WITH CHECK is evaluated AFTER BEFORE-triggers have run: by then
-- generate_volunteer_id_trigger has already populated volunteer_id, so a
-- `volunteer_id IS NULL` policy clause would reject legitimate inserts.
--
-- The trigger name matters. Triggers fire in alphabetical order, and this one
-- must run BEFORE generate_volunteer_id_trigger so that it sees the value the
-- CLIENT supplied rather than the one the system generated:
--
--     enforce_profile_insert_guard_trigger   <-- 'e'
--     generate_volunteer_id_trigger          <-- 'g'
--     prevent_role_self_change_trigger       <-- 'p'
--
-- Signup is unaffected: handle_new_user() runs without a JWT (GoTrue connects
-- as supabase_auth_admin), so auth.role() is NULL and the guard passes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_profile_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    IF NEW.role IS DISTINCT FROM 'volunteer' THEN
      RAISE EXCEPTION 'Profiles can only be self-created with the volunteer role'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.volunteer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Volunteer ID is assigned by the system and cannot be supplied'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_insert_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_profile_insert_guard_trigger ON public.profiles;
CREATE TRIGGER enforce_profile_insert_guard_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_insert_guard();

-- Second layer at the policy level. `role = 'volunteer'` is safe to assert
-- here (no BEFORE trigger rewrites it); volunteer_id deliberately is not, for
-- the ordering reason above.
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = 'volunteer'
  );


-- ============================================================================
-- 5. Coordinator accounts are approved, not self-declared.
--
-- Until now `raw_user_meta_data->>'role'` decided the role at signup, so any
-- member of the public could register as a charity and immediately create a
-- charity row with full coordinator powers over its opportunities,
-- applications and pledges.
--
-- v1 model, chosen because it needs no admin UI:
--
--   * Signup ALWAYS produces a volunteer. The client cannot influence this.
--   * If the signup asked for a charity account, a row lands in
--     `charity_access_requests` recording who asked and for which org.
--   * You approve with ONE function call in the Supabase SQL Editor:
--         SELECT admin_approve_charity_access('<request-id>');
--     which flips the profile to 'charity' and stamps the request.
--   * The applicant can poll their own request status (RLS-scoped to
--     themselves), so the app can show "pending review" without any new
--     admin surface.
--
-- Existing charity accounts are untouched — this only governs new signups.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.charity_access_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_org_name TEXT,
  contact_email     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ
);

-- One open request per user; re-signup should not spam the queue.
CREATE UNIQUE INDEX IF NOT EXISTS charity_access_requests_one_pending
  ON public.charity_access_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE public.charity_access_requests ENABLE ROW LEVEL SECURITY;

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new TABLES to
-- anon/authenticated. RLS alone would still leave anon holding INSERT/UPDATE
-- privileges on a table with no policies, so strip the grants too.
REVOKE ALL ON TABLE public.charity_access_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.charity_access_requests TO authenticated;

-- Applicants may read their own request and nothing else. There is
-- deliberately no INSERT/UPDATE/DELETE policy: rows are written only by the
-- SECURITY DEFINER signup trigger and the admin approval function.
DROP POLICY IF EXISTS charity_access_requests_select_own ON public.charity_access_requests;
CREATE POLICY charity_access_requests_select_own ON public.charity_access_requests
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ----------------------------------------------------------------------------
-- Signup trigger: role is now decided by the database, never by the client.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claimed_role TEXT;
BEGIN
  claimed_role := NEW.raw_user_meta_data->>'role';

  -- Every new account is a volunteer. This is the fix for coordinator
  -- self-registration: there is no longer any value the client can put in
  -- signup metadata that yields a charity account.
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (NEW.id, 'volunteer', NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- Record the ask so it can be reviewed and approved out of band.
  IF claimed_role = 'charity' THEN
    INSERT INTO public.charity_access_requests (user_id, requested_org_name, contact_email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'org_name',
               NEW.raw_user_meta_data->>'full_name'),
      NEW.email
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ----------------------------------------------------------------------------
-- The approval action. service_role only — same posture as
-- admin_set_profile_role from 025.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_charity_access(
  p_request_id UUID,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID;
BEGIN
  UPDATE public.charity_access_requests
     SET status = 'approved', reviewed_at = NOW(), review_note = p_note
   WHERE id = p_request_id AND status = 'pending'
  RETURNING user_id INTO v_user;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending request with that id');
  END IF;

  -- Bypasses prevent_role_self_change because the caller's JWT role is
  -- service_role, not 'authenticated'. (Note: SECURITY DEFINER by itself does
  -- NOT change auth.role() — the service_role JWT is what matters here.)
  UPDATE public.profiles SET role = 'charity' WHERE id = v_user;

  RETURN jsonb_build_object('success', true, 'user_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_charity_access(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_charity_access(UUID, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION public.admin_reject_charity_access(
  p_request_id UUID,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID;
BEGIN
  UPDATE public.charity_access_requests
     SET status = 'rejected', reviewed_at = NOW(), review_note = p_note
   WHERE id = p_request_id AND status = 'pending'
  RETURNING user_id INTO v_user;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending request with that id');
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_charity_access(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_charity_access(UUID, TEXT) TO service_role;
