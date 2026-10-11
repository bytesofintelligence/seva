-- Add social media fields to charities table
-- Allows charities to link their Instagram, Twitter, etc.

ALTER TABLE charities ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
-- Instagram handle without @ (e.g., "oxfam" not "@oxfam")

ALTER TABLE charities ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
-- Twitter handle without @ (optional)

ALTER TABLE charities ADD COLUMN IF NOT EXISTS facebook_url TEXT;
-- Full Facebook URL (optional)
