-- supabase/migrations/010_add_additional_info_to_applications.sql
-- Add additional_info column to applications table for volunteer responses

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS additional_info text;
