-- supabase/migrations/009_add_additional_info_to_opportunities.sql
-- Add optional additional info fields to opportunities table

ALTER TABLE opportunities
ADD COLUMN IF NOT EXISTS requires_additional_info boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS additional_info_prompt text;
