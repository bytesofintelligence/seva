-- ============================================================================
-- MIGRATION: 029_application_integrity.sql
--
-- Until now the rules for `applications` lived only in the app:
--
--   * 001's `applications_volunteer_insert` / `_update` policies check nothing
--     but `volunteer_id = auth.uid()`, so a volunteer could insert a row that
--     was already 'approved', or flip their own status afterwards.
--   * Capacity (max_volunteers / target_volunteers) was a client-side
--     read-then-insert. Two volunteers taking the last spot at the same moment
--     both passed the check, and a direct API call skipped it entirely.
--   * Nothing stopped two rows for the same volunteer + opportunity.
--
-- This migration moves those rules into the database, where the app cannot
-- skip them. It changes NO columns and NO policies: RLS still decides who may
-- touch a row at all, and the trigger below decides what they may do to it.
-- The app's existing writes (apply, re-apply after withdrawing, withdraw, edit
-- party size, approve, reject, cancel-a-session cascade) all remain valid.
--
-- ⚠️  BEFORE APPLYING — the unique index needs one row per volunteer per
-- opportunity. If double-submits ever created duplicates, this migration stops
-- at step 0 and changes nothing. Preview them (read-only) with:
--
--   SELECT volunteer_id, opportunity_id, count(*), array_agg(status ORDER BY applied_at)
--   FROM applications GROUP BY 1, 2 HAVING count(*) > 1;
--
-- To resolve, keep the most advanced row of each pair and delete the rest:
--
--   DELETE FROM applications a USING (
--     SELECT id, row_number() OVER (
--       PARTITION BY volunteer_id, opportunity_id
--       ORDER BY array_position(ARRAY['completed','in_progress','approved','confirmed',
--                                     'pending','rejected','cancelled','draft'], status),
--                applied_at DESC) AS rn
--     FROM applications) d
--   WHERE a.id = d.id AND d.rn > 1;
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Refuse to continue if duplicates exist (see header).
-- ============================================================================
DO $$
DECLARE
  v_dupes INT;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT 1 FROM public.applications
    GROUP BY volunteer_id, opportunity_id HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      '029 not applied: % volunteer/opportunity pair(s) have duplicate applications. See the header of this file.',
      v_dupes;
  END IF;
END;
$$;


-- ============================================================================
-- 1. One application per volunteer per opportunity.
--
-- The app already models it this way (re-applying UPDATEs the cancelled row
-- rather than inserting a second one); this makes a double-tap or two devices
-- unable to break that assumption.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS applications_volunteer_opportunity_key
  ON public.applications (volunteer_id, opportunity_id);


-- ============================================================================
-- 2. Ownership, status transitions and capacity.
--
-- WHO
--   Only end-user traffic is gated (auth.role() = 'authenticated'), the same
--   convention as 025/027. service_role and the SQL editor pass straight
--   through so an admin can still repair data.
--
-- STATUS
--   The initial status is decided here, never by the client:
--       signup_mode = 'auto_confirm'  ->  'confirmed'
--       otherwise                     ->  'pending'
--   Volunteer:    pending|confirmed|approved -> cancelled      (withdraw)
--                 cancelled -> pending|confirmed               (re-apply)
--   Coordinator:  pending -> approved|rejected
--                 pending|confirmed|approved -> cancelled      (session cancelled;
--                                                               see 023's cascade)
--                 confirmed|approved -> in_progress|completed, in_progress -> completed
--   Everything else is rejected. In particular a volunteer can never reach
--   'approved', and a rejected volunteer cannot re-apply (matches the app).
--
-- CAPACITY
--   cap = COALESCE(max_volunteers, target_volunteers) -- same as the app.
--   Places are taken by confirmed/approved/in_progress/completed sign-ups
--   (the definition used by opportunity_volunteer_counts). The check runs when
--   someone applies, re-applies, is approved, or increases their party size.
--
--   The opportunity row is locked first, so concurrent sign-ups for the same
--   session queue up instead of racing: the second waits for the first to
--   commit and then counts it. Same technique as 021's pledge capacity.
--   NO KEY UPDATE rather than UPDATE so it does not fight the foreign-key
--   check's own KEY SHARE lock. The lock is only taken on paths that consume
--   capacity, so withdrawing never queues behind (or deadlocks with) a
--   coordinator cancelling the session.
--
-- SECURITY DEFINER because the volunteer's own RLS view of `applications` is
-- one row; counting the session's sign-ups needs to see all of them.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_application_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_taking_a_place CONSTANT TEXT[] := ARRAY['confirmed', 'approved', 'in_progress', 'completed'];
  c_active         CONSTANT TEXT[] := ARRAY['pending', 'confirmed', 'approved'];

  v_uid           UUID := (SELECT auth.uid());
  v_is_volunteer  BOOLEAN;
  v_is_owner      BOOLEAN;
  v_consumes      BOOLEAN;
  v_status_change BOOLEAN;

  v_opp_status    TEXT;
  v_signup_mode   TEXT;
  v_cap           INT;
  v_owner_id      UUID;
  v_initial       TEXT;
  v_party         INT;
  v_taken         BIGINT;
  v_left          BIGINT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.party_size IS NULL THEN
    NEW.party_size := 1;
  END IF;
  v_party := NEW.party_size;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.volunteer_id IS DISTINCT FROM OLD.volunteer_id
       OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
       OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
      RAISE EXCEPTION 'A sign-up cannot be moved to another volunteer or opportunity'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_status_change := TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status;

  -- Does this write need a place? Decided before reading the opportunity so
  -- the row can be locked on exactly those paths.
  v_consumes := TG_OP = 'INSERT'
    OR (v_status_change AND NEW.status = ANY (c_active))
    OR v_party > COALESCE(OLD.party_size, 1);

  IF v_consumes THEN
    SELECT o.status, o.signup_mode, COALESCE(o.max_volunteers, o.target_volunteers), c.owner_id
      INTO v_opp_status, v_signup_mode, v_cap, v_owner_id
    FROM public.opportunities o
    JOIN public.charities c ON c.id = o.charity_id
    WHERE o.id = NEW.opportunity_id
    FOR NO KEY UPDATE OF o;
  ELSE
    SELECT o.status, o.signup_mode, COALESCE(o.max_volunteers, o.target_volunteers), c.owner_id
      INTO v_opp_status, v_signup_mode, v_cap, v_owner_id
    FROM public.opportunities o
    JOIN public.charities c ON c.id = o.charity_id
    WHERE o.id = NEW.opportunity_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This opportunity no longer exists';
  END IF;

  v_is_volunteer := NEW.volunteer_id = v_uid;
  v_is_owner     := v_owner_id = v_uid;
  v_initial      := CASE WHEN v_signup_mode = 'auto_confirm' THEN 'confirmed' ELSE 'pending' END;

  IF NOT (v_is_volunteer OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to change this sign-up' USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Status
  -- --------------------------------------------------------------------------
  IF TG_OP = 'INSERT'
     OR (v_is_volunteer AND OLD.status = 'cancelled' AND NEW.status IN ('pending', 'confirmed')) THEN
    -- Applying, or re-applying after withdrawing.
    IF NOT v_is_volunteer THEN
      RAISE EXCEPTION 'You can only sign up as yourself' USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'A new sign-up cannot start as %', NEW.status USING ERRCODE = '42501';
    END IF;
    IF v_opp_status IN ('cancelled', 'draft') THEN
      RAISE EXCEPTION 'This opportunity is not open for sign-ups';
    END IF;
    -- The server's answer, whatever the client asked for.
    NEW.status := v_initial;

  ELSIF NOT v_status_change THEN
    NULL;  -- detail edit only; checked below

  ELSIF v_is_volunteer AND OLD.status = ANY (c_active) AND NEW.status = 'cancelled' THEN
    NULL;  -- withdraw

  ELSIF v_is_owner AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    NULL;  -- coordinator decision

  ELSIF v_is_owner AND OLD.status = ANY (c_active) AND NEW.status = 'cancelled' THEN
    NULL;  -- session cancelled (cascade_opportunity_cancellation, 023)

  ELSIF v_is_owner AND OLD.status IN ('confirmed', 'approved') AND NEW.status IN ('in_progress', 'completed') THEN
    NULL;  -- attendance

  ELSIF v_is_owner AND OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
    NULL;

  ELSE
    RAISE EXCEPTION 'This sign-up cannot be changed from % to %', OLD.status, NEW.status
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------------
  -- Details (party size, answers). The volunteer's to edit, and only while
  -- the sign-up is live; a coordinator changes status and nothing else.
  -- --------------------------------------------------------------------------
  IF TG_OP = 'UPDATE'
     AND (NEW.party_size IS DISTINCT FROM COALESCE(OLD.party_size, 1)
          OR NEW.additional_info IS DISTINCT FROM OLD.additional_info
          OR NEW.cover_letter IS DISTINCT FROM OLD.cover_letter) THEN
    IF NOT v_is_volunteer THEN
      RAISE EXCEPTION 'Only the volunteer can edit the details of their sign-up'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (NEW.status = ANY (c_active)) THEN
      RAISE EXCEPTION 'This sign-up can no longer be edited';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- Capacity. The opportunity row is locked (above), so this count cannot be
  -- overtaken by another sign-up for the same session.
  -- --------------------------------------------------------------------------
  IF v_consumes AND NEW.status = ANY (c_active) AND v_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(a.party_size, 1)), 0) INTO v_taken
    FROM public.applications a
    WHERE a.opportunity_id = NEW.opportunity_id
      AND a.status = ANY (c_taking_a_place)
      AND a.id <> NEW.id;

    v_left := GREATEST(v_cap - v_taken, 0);

    IF v_party > v_left THEN
      IF v_left = 0 THEN
        RAISE EXCEPTION 'This session is full' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'Only % spot% left for this session (this sign-up is for % %)',
        v_left, CASE WHEN v_left = 1 THEN '' ELSE 's' END,
        v_party, CASE WHEN v_party = 1 THEN 'person' ELSE 'people' END
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_application_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_application_rules_trigger ON public.applications;
CREATE TRIGGER enforce_application_rules_trigger
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_application_rules();

COMMIT;
