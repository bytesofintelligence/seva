-- supabase/migrations/008_add_phone_to_profiles.sql
-- Add phone column to profiles table if it doesn't exist

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
1