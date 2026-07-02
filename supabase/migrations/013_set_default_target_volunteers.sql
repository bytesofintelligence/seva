-- supabase/migrations/013_set_default_target_volunteers.sql
-- Set a sensible default for target_volunteers on existing opportunities
-- Use 10 as a default reasonable number for volunteer opportunities

UPDATE opportunities
SET target_volunteers = COALESCE(target_volunteers, 10)
WHERE target_volunteers IS NULL;

-- Also add a NOT NULL constraint so this doesn't happen again
ALTER TABLE opportunities
ALTER COLUMN target_volunteers SET NOT NULL,
ALTER COLUMN target_volunteers SET DEFAULT 10;
