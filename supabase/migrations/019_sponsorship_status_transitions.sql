-- ============================================================================
-- MIGRATION: 019_sponsorship_status_transitions.sql
-- Purpose: Server-side status transitions for sponsorship_items, so the
-- client never has to (and can't) set these directly.
--
--   - open <-> fully_pledged: automatic, driven by pledge changes (insert,
--     cancel, expire, etc. all shift quantity_remaining). Runs as
--     SECURITY DEFINER because a volunteer cancelling their own pledge must
--     be able to reopen an item, even though sponsorship_items UPDATE is
--     normally owner-only.
--   - fully_pledged/open -> fulfilled: a deliberate action only the charity
--     owner can take, once everything pledged has actually been received.
--     Implemented as a normal (SECURITY INVOKER) RPC so the existing
--     sponsorship_items RLS UPDATE policy (owner-only) enforces who can call
--     it — no need to duplicate that check here.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_sponsorship_item_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_item_id UUID := COALESCE(NEW.item_id, OLD.item_id);
  v_remaining BIGINT;
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM sponsorship_items
  WHERE id = v_item_id;

  -- Item may have been deleted (ON DELETE CASCADE) in the same statement.
  IF v_current_status IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only 'open' and 'fully_pledged' are auto-managed; leave manual states alone.
  IF v_current_status NOT IN ('open', 'fully_pledged') THEN
    RETURN NULL;
  END IF;

  SELECT quantity_remaining INTO v_remaining
  FROM sponsorship_item_progress
  WHERE item_id = v_item_id;

  IF v_remaining <= 0 AND v_current_status = 'open' THEN
    UPDATE sponsorship_items SET status = 'fully_pledged' WHERE id = v_item_id;
  ELSIF v_remaining > 0 AND v_current_status = 'fully_pledged' THEN
    UPDATE sponsorship_items SET status = 'open' WHERE id = v_item_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_sponsorship_item_status_trigger
AFTER INSERT OR UPDATE OR DELETE ON pledges
FOR EACH ROW
EXECUTE FUNCTION sync_sponsorship_item_status();

-- ============================================================================
-- RPC: mark_item_fulfilled
-- Charity owner confirms every pledge on the item has actually been
-- received (bank transfer landed) and marks the item done. Runs as the
-- caller (SECURITY INVOKER, the default), so the existing owner-only
-- sponsorship_items_update RLS policy is what actually authorizes this.
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_item_fulfilled(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_needed INT;
  v_received BIGINT;
  v_outstanding_count INT;
BEGIN
  SELECT quantity_needed INTO v_needed
  FROM sponsorship_items
  WHERE id = p_item_id;

  IF v_needed IS NULL THEN
    RAISE EXCEPTION 'Sponsorship item not found';
  END IF;

  SELECT quantity_received INTO v_received
  FROM sponsorship_item_progress
  WHERE item_id = p_item_id;

  SELECT COUNT(*) INTO v_outstanding_count
  FROM pledges
  WHERE item_id = p_item_id AND status IN ('pledged', 'transfer_claimed');

  IF v_outstanding_count > 0 THEN
    RAISE EXCEPTION 'Cannot mark fulfilled: % pledge(s) have not been received yet', v_outstanding_count;
  END IF;

  IF COALESCE(v_received, 0) < v_needed THEN
    RAISE EXCEPTION 'Cannot mark fulfilled: only % of % received', COALESCE(v_received, 0), v_needed;
  END IF;

  -- This UPDATE runs as the caller, so it goes through the normal owner-only
  -- RLS policy on sponsorship_items just like any client-side update would.
  UPDATE sponsorship_items SET status = 'fulfilled' WHERE id = p_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_item_fulfilled(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_item_fulfilled(UUID) TO authenticated;
