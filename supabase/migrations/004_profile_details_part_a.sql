-- supabase/migrations/004_profile_details_part_a.sql
-- Table column additions (safe to re-run with IF NOT EXISTS)

-- Add optional profile enrichment fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_drive boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_drive_van boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_collect_and_deliver boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

-- Add optional charity descriptive fields
ALTER TABLE charities ADD COLUMN IF NOT EXISTS mission text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS contact_phone text;
