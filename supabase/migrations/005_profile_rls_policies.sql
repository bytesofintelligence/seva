-- supabase/migrations/005_profile_rls_policies.sql
-- Row Level Security policies for profiles and charities tables

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can select own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can select profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can select charities" ON charities;
DROP POLICY IF EXISTS "Users can update own charities" ON charities;
DROP POLICY IF EXISTS "Authenticated users can insert charities" ON charities;

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: Authenticated users can SELECT any profile (needed for charities to view applicants)
CREATE POLICY "Authenticated users can select profiles" ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Profiles: Users can UPDATE their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Profiles: System (authenticated inserts via trigger) can INSERT
CREATE POLICY "System can insert profiles" ON profiles
  FOR INSERT
  WITH CHECK (true);

-- Enable RLS on charities table
ALTER TABLE charities ENABLE ROW LEVEL SECURITY;

-- Charities: Authenticated users can SELECT all charities (needed to view charity details when browsing)
CREATE POLICY "Authenticated users can select charities" ON charities
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Charities: Users can UPDATE only charities they own
CREATE POLICY "Users can update own charities" ON charities
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Charities: Users can INSERT charities (for onboarding)
CREATE POLICY "Authenticated users can insert charities" ON charities
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
