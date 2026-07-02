-- supabase/migrations/012_fix_volunteer_counts_view.sql
-- Fix the opportunity_volunteer_counts view to count all active applications
-- (pending, confirmed, approved, in_progress)

CREATE OR REPLACE VIEW opportunity_volunteer_counts AS
SELECT
  opp.id,
  opp.charity_id,
  COALESCE(SUM(CASE WHEN app.status IN ('pending', 'confirmed', 'approved', 'in_progress') THEN app.party_size ELSE 0 END), 0)::BIGINT AS volunteers_count,
  COUNT(CASE WHEN app.status IN ('pending', 'confirmed', 'approved', 'in_progress') THEN 1 END)::BIGINT AS signups_count
FROM opportunities opp
LEFT JOIN applications app ON app.opportunity_id = opp.id
GROUP BY opp.id, opp.charity_id;
