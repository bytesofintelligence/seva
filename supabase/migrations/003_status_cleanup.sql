-- ============================================================================
-- MIGRATION: 003_status_cleanup.sql
-- Purpose: Consolidate application status values to a single canonical set
-- ============================================================================

-- Step 1: Migrate any existing 'withdrawn' statuses to 'cancelled'
-- Withdrawn applications are treated as cancelled (user or system withdrew them)
UPDATE applications
SET status = 'cancelled'
WHERE status = 'withdrawn';

-- Step 2: Drop the old applications status check constraint
-- The old constraint allowed: pending, approved, in_progress, completed, rejected, cancelled, confirmed
ALTER TABLE applications
DROP CONSTRAINT IF EXISTS applications_status_check;

-- Step 3: Add the new, cleaned-up status check constraint
-- Canonical status values:
--   'pending'     - Application submitted, awaiting charity review (initial state)
--   'confirmed'   - Auto-confirmed by system when signup_mode='auto_confirm'
--   'approved'    - Manually approved by charity when signup_mode='review'
--   'in_progress' - Volunteer is actively working on the opportunity
--   'completed'   - Volunteer finished the opportunity
--   'rejected'    - Charity rejected the application
--   'cancelled'   - Application or opportunity cancelled (was 'withdrawn')
ALTER TABLE applications
ADD CONSTRAINT applications_status_check
  CHECK (status IN ('pending', 'confirmed', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled'));

-- Note: This constraint ensures no invalid statuses can be inserted or updated.
-- All app code must use only these 7 values.

-- ============================================================================
-- VOLUNTEER COUNT VIEW UPDATE
-- ============================================================================
-- Update the opportunity_volunteer_counts view to count only volunteers
-- who are actively "coming" (confirmed, approved, or in_progress).

CREATE OR REPLACE VIEW opportunity_volunteer_counts AS
SELECT
  opp.id,
  opp.charity_id,
  COALESCE(SUM(CASE WHEN app.status IN ('confirmed', 'approved', 'in_progress') THEN app.party_size ELSE 0 END), 0)::BIGINT AS volunteers_count,
  COUNT(CASE WHEN app.status IN ('confirmed', 'approved', 'in_progress') THEN 1 END)::BIGINT AS signups_count
FROM opportunities opp
LEFT JOIN applications app ON app.opportunity_id = opp.id
GROUP BY opp.id, opp.charity_id;

-- ============================================================================
-- COUNTING LOGIC EXPLANATION
-- ============================================================================
-- volunteers_count (SUM of party_size) and signups_count (COUNT) include ONLY:
--
--   ✅ 'confirmed'     - Volunteer auto-confirmed by system
--                        They are committed and counted as coming
--
--   ✅ 'approved'      - Volunteer manually approved by charity
--                        They are confirmed and counted as coming
--
--   ✅ 'in_progress'   - Volunteer is actively working/volunteering right now
--                        They are actively counted as present/working
--
-- Excluded from counts:
--
--   ❌ 'pending'       - Not yet reviewed/confirmed, might be rejected
--                        Don't count until charity approves or auto-confirm triggers
--
--   ❌ 'completed'     - Already finished, no longer "coming"
--                        Work is done, don't count toward future capacity
--
--   ❌ 'rejected'      - Charity said no, never confirmed
--                        Never counted toward goal
--
--   ❌ 'cancelled'     - Withdrew or opportunity cancelled
--                        Should not count toward volunteers coming
--
-- This ensures:
-- - Progress ring shows only "committed" volunteers toward target
-- - Capacity checks prevent overbooking (pending→approved/confirmed must respect max)
-- - Past/completed volunteers don't artificially inflate current counts
