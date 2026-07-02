-- Create sequence for volunteer IDs
CREATE SEQUENCE IF NOT EXISTS volunteer_id_seq START 1 INCREMENT 1;

-- Add volunteer_id column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS volunteer_id TEXT UNIQUE;

-- Function to generate volunteer ID when profile is created
CREATE OR REPLACE FUNCTION generate_volunteer_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'volunteer' AND NEW.volunteer_id IS NULL THEN
    NEW.volunteer_id := 'SEVA-' || LPAD(nextval('volunteer_id_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS generate_volunteer_id_trigger ON profiles;

-- Create trigger to auto-generate volunteer ID
CREATE TRIGGER generate_volunteer_id_trigger
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION generate_volunteer_id();

-- Generate IDs for existing volunteers who don't have one
UPDATE profiles
SET volunteer_id = 'SEVA-' || LPAD(nextval('volunteer_id_seq')::TEXT, 5, '0')
WHERE role = 'volunteer' AND volunteer_id IS NULL;
