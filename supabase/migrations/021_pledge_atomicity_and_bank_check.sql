-- ============================================================================
-- MIGRATION: 021_pledge_atomicity_and_bank_check.sql
-- Purpose: Hardening pass fixes.
--
-- 1. RACE CONDITION FIX: the app previously re-checked
--    sponsorship_item_progress.quantity_remaining client-side right before
--    inserting a pledge, then did a plain INSERT. That's a classic
--    check-then-act race — two volunteers pledging the last N items at the
--    same moment can both pass the check and both insert, over-pledging the
--    item. Fixed here with a BEFORE INSERT trigger that takes a row lock on
--    the parent sponsorship_items row (SELECT ... FOR UPDATE) before
--    computing the already-pledged quantity. The row lock serializes
--    concurrent inserts on the same item: the second transaction blocks
--    until the first commits (or rolls back), and then sees the first
--    pledge's effect when it re-checks. This works no matter which code
--    path performs the insert (plain client insert, an RPC, anything) —
--    unlike an RPC-only fix, it can't be bypassed by calling .insert()
--    directly, so no client-side change is required for correctness (the
--    client-side re-check stays purely as a fast, friendly first check).
--
-- 2. BANK DETAILS PRESENCE CHECK: the RLS hardening pass found that
--    charities.bank_* columns are still exposed to any authenticated user
--    via the general charities_select policy (documented in SECURITY.md).
--    The volunteer app needs to know *whether* a charity has set up bank
--    details (to block the pledge flow with a friendly message) without
--    querying those columns directly and re-opening that gap. This function
--    answers only true/false — it never returns the actual values.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_pledge_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_quantity_needed INT;
  v_already_pledged BIGINT;
  v_remaining BIGINT;
BEGIN
  -- Lock the parent item row so concurrent inserts on the same item
  -- serialize instead of racing past each other.
  SELECT quantity_needed INTO v_quantity_needed
  FROM sponsorship_items
  WHERE id = NEW.item_id
  FOR UPDATE;

  IF v_quantity_needed IS NULL THEN
    RAISE EXCEPTION 'Sponsorship item not found';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already_pledged
  FROM pledges
  WHERE item_id = NEW.item_id
    AND status IN ('pledged', 'transfer_claimed', 'received');

  v_remaining := v_quantity_needed - v_already_pledged;

  IF NEW.quantity > v_remaining THEN
    RAISE EXCEPTION 'Only % left (requested %)', v_remaining, NEW.quantity
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_pledge_capacity_trigger
BEFORE INSERT ON pledges
FOR EACH ROW
EXECUTE FUNCTION enforce_pledge_capacity();

CREATE OR REPLACE FUNCTION charity_accepts_sponsorship(p_charity_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
STABLE
AS $$
  SELECT bank_account_name IS NOT NULL
    AND bank_sort_code IS NOT NULL
    AND bank_account_number IS NOT NULL
  FROM charities
  WHERE id = p_charity_id;
$$;

REVOKE EXECUTE ON FUNCTION charity_accepts_sponsorship(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION charity_accepts_sponsorship(UUID) TO authenticated;
