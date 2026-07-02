-- supabase/migrations/007_charity_operational_fields.sql
-- Add avatar and operational fields to charities table for more detailed charity information

ALTER TABLE charities ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS operating_areas text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS how_it_works text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS key_services text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS volunteer_requirements text;
