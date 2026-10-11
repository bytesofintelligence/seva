-- supabase/migrations/024_series_exception_dates.sql
-- Adds an exception_dates column to opportunity_series so coordinators can
-- mark specific calendar dates (e.g. Christmas Day) to skip when generating
-- occurrences. The app cancels any already-generated occurrence on these
-- dates immediately after generation; future generate_series_occurrences
-- calls don't need to know about them since occurrences are only skipped
-- when a row already exists for that date (idempotency), not by exception.

ALTER TABLE opportunity_series
  ADD COLUMN IF NOT EXISTS exception_dates DATE[] NOT NULL DEFAULT '{}';
