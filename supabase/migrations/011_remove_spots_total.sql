-- supabase/migrations/011_remove_spots_total.sql
-- Remove spots_total column - use target_volunteers as the single source of truth

ALTER TABLE opportunities
DROP COLUMN IF EXISTS spots_total;
