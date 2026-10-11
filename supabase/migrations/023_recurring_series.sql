-- supabase/migrations/023_recurring_series.sql
-- Recurring opportunity series: charities define a weekly/daily template once,
-- and occurrences are generated as real `opportunities` rows so all existing
-- application/RLS/volunteer-count logic keeps working unmodified.

BEGIN;

-- ============================================================================
-- 1. opportunity_series table
-- ============================================================================

CREATE TABLE opportunity_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'daily')),
  -- 0 = Sunday .. 6 = Saturday. Default 5 = Friday.
  recurrence_day_of_week INT DEFAULT 5,
  -- Time of day the event starts, interpreted in Europe/London when generating starts_at.
  template_time TIME NOT NULL DEFAULT '18:30:00',
  template_duration_minutes INT NOT NULL DEFAULT 120,
  generate_weeks_ahead INT NOT NULL DEFAULT 12,
  active BOOLEAN NOT NULL DEFAULT true,
  -- Snapshot of all opportunity fields used when generating occurrences:
  -- title, description, location, type, latitude, longitude, target_volunteers,
  -- max_volunteers, signup_mode, featured.
  template JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. opportunities table additions
-- ============================================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES opportunity_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_date DATE,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

COMMENT ON COLUMN opportunities.occurrence_date IS 'Calendar date this occurrence represents; null for standalone events.';

-- ============================================================================
-- 3. applications status check: add 'draft' for the duplicate-opportunity feature
-- ============================================================================

ALTER TABLE applications
DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE applications
ADD CONSTRAINT applications_status_check
  CHECK (status IN ('draft', 'pending', 'confirmed', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled'));

-- ============================================================================
-- 4. RLS on opportunity_series
-- ============================================================================

ALTER TABLE opportunity_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_series_select ON opportunity_series
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY opportunity_series_insert ON opportunity_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

CREATE POLICY opportunity_series_update ON opportunity_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

CREATE POLICY opportunity_series_delete ON opportunity_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. generate_series_occurrences(p_series_id, p_from_date, p_weeks)
-- ============================================================================
-- Idempotent: skips any date where a row already exists for this series on
-- that occurrence_date, so it is safe to call repeatedly (e.g. from a cron
-- job that keeps extending the horizon).

CREATE OR REPLACE FUNCTION generate_series_occurrences(
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

  FOR v_week IN 0..(p_weeks - 1) LOOP
    v_week_start := p_from_date + (v_week * 7);

    -- Next occurrence date on or after v_week_start matching recurrence_day_of_week.
    v_day_offset := (v_series.recurrence_day_of_week - EXTRACT(DOW FROM v_week_start)::INT + 7) % 7;
    v_occurrence_date := v_week_start + v_day_offset;

    -- Skip if a row for this series already exists on this occurrence_date.
    IF EXISTS (
      SELECT 1 FROM opportunities
      WHERE series_id = p_series_id
      AND occurrence_date = v_occurrence_date
    ) THEN
      CONTINUE;
    END IF;

    -- Combine the occurrence date with the template time in Europe/London,
    -- so DST is respected automatically (18:30 London becomes 17:30 UTC in
    -- summer and 18:30 UTC in winter, never the wrong way round).
    v_starts_at := (v_occurrence_date || ' ' || v_series.template_time)::TIMESTAMP AT TIME ZONE 'Europe/London';

    INSERT INTO opportunities (
      charity_id,
      title,
      description,
      location,
      type,
      latitude,
      longitude,
      target_volunteers,
      max_volunteers,
      signup_mode,
      featured,
      series_id,
      occurrence_date,
      starts_at,
      status,
      spots_filled
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

-- ============================================================================
-- 6. Cancellation cascade trigger
-- ============================================================================
-- When an opportunity is cancelled, cascade the cancellation to all of its
-- active applications. This is the mechanism that updates volunteers'
-- schedules when a coordinator cancels a week.
--
-- NOTE: a future notifications job should read these cancellations and
-- alert affected volunteers.

CREATE OR REPLACE FUNCTION cascade_opportunity_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    UPDATE applications
    SET status = 'cancelled'
    WHERE opportunity_id = NEW.id
    AND status IN ('pending', 'confirmed', 'approved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_opportunity_cancellation ON opportunities;

CREATE TRIGGER trg_cascade_opportunity_cancellation
  AFTER UPDATE OF status ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION cascade_opportunity_cancellation();

-- ============================================================================
-- 7. opportunity_volunteer_counts view: add series_id, occurrence_date
-- ============================================================================

DROP VIEW IF EXISTS opportunity_volunteer_counts;

CREATE VIEW opportunity_volunteer_counts AS
SELECT
  opp.id,
  opp.charity_id,
  opp.series_id,
  opp.occurrence_date,
  COALESCE(SUM(CASE WHEN app.status IN ('confirmed', 'approved', 'in_progress', 'completed') THEN app.party_size ELSE 0 END), 0)::BIGINT AS volunteers_count,
  COUNT(CASE WHEN app.status IN ('pending', 'confirmed', 'approved', 'in_progress', 'completed') THEN 1 END)::BIGINT AS signups_count
FROM opportunities opp
LEFT JOIN applications app ON app.opportunity_id = opp.id
GROUP BY opp.id, opp.charity_id, opp.series_id, opp.occurrence_date;

-- ============================================================================
-- 8. Jalaram conversion: turn the existing weekly distribution opportunity
--    into a series, and backfill/generate its future occurrences.
-- ============================================================================

DO $$
DECLARE
  v_opp opportunities%ROWTYPE;
  v_new_series_id UUID;
  v_generated_count INT;
BEGIN
  SELECT * INTO v_opp
  FROM opportunities
  WHERE featured = true
  AND signup_mode = 'auto_confirm'
  AND series_id IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'No matching Jalaram opportunity found (featured=true, signup_mode=auto_confirm); skipping conversion.';
  ELSE
    INSERT INTO opportunity_series (
      charity_id,
      title,
      recurrence_type,
      recurrence_day_of_week,
      template_time,
      template_duration_minutes,
      generate_weeks_ahead,
      active,
      template
    )
    VALUES (
      v_opp.charity_id,
      v_opp.title,
      'weekly',
      5,
      '18:30:00',
      120,
      12,
      true,
      jsonb_build_object(
        'title', v_opp.title,
        'description', v_opp.description,
        'location', v_opp.location,
        'type', v_opp.type,
        'latitude', v_opp.latitude,
        'longitude', v_opp.longitude,
        'target_volunteers', v_opp.target_volunteers,
        'max_volunteers', v_opp.max_volunteers,
        'signup_mode', v_opp.signup_mode,
        'featured', v_opp.featured
      )
    )
    RETURNING id INTO v_new_series_id;

    UPDATE opportunities
    SET series_id = v_new_series_id,
        occurrence_date = v_opp.starts_at::DATE
    WHERE id = v_opp.id;

    -- Generate the next 12 weeks; the existing row's date is skipped
    -- automatically since a row for this series already exists on that date.
    SELECT generate_series_occurrences(v_new_series_id, CURRENT_DATE, 12) INTO v_generated_count;

    RAISE NOTICE 'Jalaram series % created; % new occurrence(s) generated.', v_new_series_id, v_generated_count;
  END IF;
END $$;

COMMIT;
