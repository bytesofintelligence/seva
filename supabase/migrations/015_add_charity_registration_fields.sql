-- Add charity registration fields to charities table
-- Allows charities to specify if they are UK registered, international, or not registered
-- and optionally store their charity/registration numbers and country

ALTER TABLE charities ADD COLUMN IF NOT EXISTS charity_reg_status TEXT;
-- Values: 'uk-registered', 'international', 'not-registered', or NULL if not specified

ALTER TABLE charities ADD COLUMN IF NOT EXISTS charity_number TEXT;
-- UK charity number or international registration number (if applicable)

ALTER TABLE charities ADD COLUMN IF NOT EXISTS charity_country TEXT;
-- Country of registration (for international charities)
