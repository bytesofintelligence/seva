-- Add new columns to opportunities table
ALTER TABLE opportunities
ADD COLUMN featured BOOLEAN DEFAULT false,
ADD COLUMN target_volunteers INT,
ADD COLUMN max_volunteers INT,
ADD COLUMN signup_mode TEXT DEFAULT 'review',
ADD CONSTRAINT opportunities_signup_mode_check CHECK (signup_mode IN ('review', 'auto_confirm'));

-- Add new columns to applications table
ALTER TABLE applications
ADD COLUMN party_size INT DEFAULT 1,
ADD CONSTRAINT applications_party_size_check CHECK (party_size >= 1 AND party_size <= 20);

-- Update applications status check constraint to include 'confirmed'
-- First drop the existing constraint (if it exists)
ALTER TABLE applications
DROP CONSTRAINT IF EXISTS applications_status_check;

-- Add updated constraint with new status
ALTER TABLE applications
ADD CONSTRAINT applications_status_check CHECK (status IN ('pending', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled', 'confirmed'));

-- Note: All existing RLS policies remain unchanged and continue to work because:
-- 1. SELECT policies are unaffected (they don't reference these new columns)
-- 2. INSERT policies use WITH CHECK which validates new rows - new columns have defaults
-- 3. UPDATE policies remain the same - they don't need to know about new columns
-- 4. The ownership/charity relationships are unchanged

-- ============================================================================
-- VIEW: opportunity_volunteer_counts
-- ============================================================================
-- Provides per-opportunity volunteer signup statistics.
--
-- SECURITY MODEL:
-- - Uses SECURITY DEFINER to bypass RLS on applications table
-- - This is safe because the view exposes ONLY:
--   1. id, charity_id (publicly visible from opportunities table)
--   2. volunteers_count (SUM of party_size, aggregated data, no personal info)
--   3. signups_count (COUNT only, no individual identities exposed)
--
-- - Filters to status IN ('confirmed', 'approved') to hide pending/rejected/cancelled
-- - No personal data (volunteer_id, email, cover_letter) ever exposed
-- - Data is non-sensitive aggregate statistics for public opportunities

-- Function to get volunteer counts (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_opportunity_volunteer_counts()
RETURNS TABLE (
  id UUID,
  charity_id UUID,
  volunteers_count BIGINT,
  signups_count BIGINT
) AS $$
SELECT
  opp.id,
  opp.charity_id,
  COALESCE(SUM(CASE WHEN app.status IN ('confirmed', 'approved') THEN app.party_size ELSE 0 END), 0)::BIGINT,
  COUNT(CASE WHEN app.status IN ('confirmed', 'approved') THEN 1 END)::BIGINT
FROM opportunities opp
LEFT JOIN applications app ON app.opportunity_id = opp.id
GROUP BY opp.id, opp.charity_id;
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public;

-- Create a view wrapper for easy querying (optional, but allows SELECT like a view)
CREATE OR REPLACE VIEW opportunity_volunteer_counts AS
SELECT * FROM get_opportunity_volunteer_counts();
