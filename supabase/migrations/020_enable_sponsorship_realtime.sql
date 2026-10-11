-- ============================================================================
-- MIGRATION: 020_enable_sponsorship_realtime.sql
-- Purpose: Broadcast changes on sponsorship_items and pledges over Supabase
-- Realtime, so the volunteer browse screen and the charity coordinator's
-- item detail screen both update live as pledges are made/claimed/received.
-- Tables aren't broadcast by default — they must be added to the
-- `supabase_realtime` publication explicitly. Guarded so re-running the
-- migration doesn't error if already added.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sponsorship_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sponsorship_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pledges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pledges;
  END IF;
END $$;
