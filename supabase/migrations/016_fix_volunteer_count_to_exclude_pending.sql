-- Fix opportunity_volunteer_counts view to only count confirmed/approved volunteers
-- This ensures "spots filled" only includes volunteers who have been accepted
-- Pending applications should not count towards capacity

CREATE OR REPLACE VIEW opportunity_volunteer_counts AS
SELECT
  opp.id,
  opp.charity_id,
  -- volunteers_count: only confirmed, approved, in_progress, or completed applications count as "filled"
  COALESCE(SUM(CASE WHEN app.status IN ('confirmed', 'approved', 'in_progress', 'completed') THEN app.party_size ELSE 0 END), 0)::BIGINT AS volunteers_count,
  -- signups_count: all active/non-rejected applications
  COUNT(CASE WHEN app.status IN ('pending', 'confirmed', 'approved', 'in_progress', 'completed') THEN 1 END)::BIGINT AS signups_count
FROM opportunities opp
LEFT JOIN applications app ON app.opportunity_id = opp.id
GROUP BY opp.id, opp.charity_id;
