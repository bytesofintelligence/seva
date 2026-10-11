-- ============================================================================
-- MIGRATION: 022_allow_owner_confirm_from_pledged.sql
-- Purpose: A volunteer can make the bank transfer without ever tapping
-- "I've made the transfer" in the app (status stays 'pledged' even though
-- the money has actually arrived). The charity owner needs to be able to
-- confirm receipt — or cancel — straight from 'pledged', not only from
-- 'transfer_claimed'. Previously the trigger only allowed the owner to act
-- on 'transfer_claimed' rows, so both "Confirm received" and "Cancel" would
-- have been rejected server-side on a still-'pledged' pledge.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_pledge_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_volunteer BOOLEAN := (OLD.volunteer_id = auth.uid());
  is_charity_owner BOOLEAN := EXISTS (
    SELECT 1 FROM sponsorship_items si
    JOIN charities c ON c.id = si.charity_id
    WHERE si.id = OLD.item_id AND c.owner_id = auth.uid()
  );
BEGIN
  IF NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.volunteer_id IS DISTINCT FROM OLD.volunteer_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.gift_aid IS DISTINCT FROM OLD.gift_aid
    OR NEW.gift_aid_full_name IS DISTINCT FROM OLD.gift_aid_full_name
    OR NEW.gift_aid_address IS DISTINCT FROM OLD.gift_aid_address
    OR NEW.gift_aid_postcode IS DISTINCT FROM OLD.gift_aid_postcode
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only the status of a pledge may be updated';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pledged' AND NEW.status = 'expired'
     AND OLD.created_at < NOW() - INTERVAL '48 hours' THEN
    RETURN NEW;
  END IF;

  IF is_volunteer AND OLD.status = 'pledged' AND NEW.status IN ('transfer_claimed', 'cancelled') THEN
    IF NEW.status = 'transfer_claimed' THEN
      NEW.claimed_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  -- Charity owner may confirm receipt or cancel from EITHER 'pledged'
  -- (volunteer paid but never tapped "I've made the transfer") or
  -- 'transfer_claimed' (the normal path).
  IF is_charity_owner AND OLD.status IN ('pledged', 'transfer_claimed') AND NEW.status IN ('received', 'cancelled') THEN
    IF NEW.status = 'received' THEN
      NEW.received_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid pledge status transition from % to %', OLD.status, NEW.status;
END;
$$;
