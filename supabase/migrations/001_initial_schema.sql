-- Drop existing toy table if it exists
DROP TABLE IF EXISTS opportunities;

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('volunteer', 'charity')),
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create charities table
CREATE TABLE charities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create opportunities table
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  type TEXT,
  spots_total INT DEFAULT 1,
  spots_filled INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create applications table
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  cover_letter TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to create a profile when a new user signs up
CREATE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO profiles (id, role, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'volunteer'),
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$$;

-- Trigger to run handle_new_user() after each user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- charities table
ALTER TABLE charities ENABLE ROW LEVEL SECURITY;

CREATE POLICY charities_select ON charities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY charities_insert ON charities
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY charities_update ON charities
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- opportunities table
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunities_select ON opportunities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY opportunities_insert ON opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

CREATE POLICY opportunities_update ON opportunities
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

CREATE POLICY opportunities_delete ON opportunities
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charities
      WHERE charities.id = charity_id
      AND charities.owner_id = auth.uid()
    )
  );

-- applications table
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_volunteer_select ON applications
  FOR SELECT
  TO authenticated
  USING (volunteer_id = auth.uid());

CREATE POLICY applications_volunteer_insert ON applications
  FOR INSERT
  TO authenticated
  WITH CHECK (volunteer_id = auth.uid());

CREATE POLICY applications_volunteer_update ON applications
  FOR UPDATE
  TO authenticated
  USING (volunteer_id = auth.uid())
  WITH CHECK (volunteer_id = auth.uid());

CREATE POLICY applications_charity_select ON applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_id
      AND EXISTS (
        SELECT 1 FROM charities
        WHERE charities.id = opportunities.charity_id
        AND charities.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY applications_charity_update ON applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_id
      AND EXISTS (
        SELECT 1 FROM charities
        WHERE charities.id = opportunities.charity_id
        AND charities.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_id
      AND EXISTS (
        SELECT 1 FROM charities
        WHERE charities.id = opportunities.charity_id
        AND charities.owner_id = auth.uid()
      )
    )
  );
