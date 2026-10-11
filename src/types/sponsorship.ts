/**
 * Canonical Sponsorship Status Types
 *
 * This is the single source of truth for sponsorship_items and pledges
 * statuses. Import from here instead of hardcoding strings to prevent
 * spelling drift (see src/types/status.ts for the same pattern applied to
 * application statuses).
 */

/**
 * All four canonical sponsorship item statuses
 * Do not add new statuses without:
 * 1. Adding to the database check constraint (018_sponsorships.sql)
 * 2. Updating a migration
 * 3. Adding status color mapping in UI
 */
export type SponsorshipItemStatus =
  | 'open'           // Accepting pledges
  | 'fully_pledged'  // quantity_remaining has hit 0, no longer accepting new pledges
  | 'fulfilled'      // Charity has received everything pledged
  | 'closed';        // Manually closed by the charity, hidden from general browsing

export const ALL_SPONSORSHIP_ITEM_STATUSES: SponsorshipItemStatus[] = [
  'open',
  'fully_pledged',
  'fulfilled',
  'closed',
];

/**
 * All five canonical pledge statuses
 */
export type PledgeStatus =
  | 'pledged'          // Volunteer committed, hasn't sent money yet
  | 'transfer_claimed' // Volunteer says they've sent the bank transfer
  | 'received'         // Charity confirmed the transfer arrived
  | 'cancelled'         // Withdrawn by volunteer or charity
  | 'expired';         // Left in 'pledged' for more than 48h, auto-expired

export const ALL_PLEDGE_STATUSES: PledgeStatus[] = [
  'pledged',
  'transfer_claimed',
  'received',
  'cancelled',
  'expired',
];

/**
 * Pledge statuses that count toward an item's quantity/amount pledged.
 * Must match the CASE logic in the sponsorship_item_progress view.
 */
export const COUNTED_PLEDGE_STATUSES: PledgeStatus[] = [
  'pledged',
  'transfer_claimed',
  'received',
];

/**
 * Pledge statuses where the volunteer's commitment is still "live" and could
 * still require action (claiming transfer, or charity confirming receipt).
 */
export const ACTIVE_PLEDGE_STATUSES: PledgeStatus[] = [
  'pledged',
  'transfer_claimed',
];

/**
 * Type guard: check if a string is a valid SponsorshipItemStatus
 */
export function isValidSponsorshipItemStatus(value: unknown): value is SponsorshipItemStatus {
  return typeof value === 'string' && ALL_SPONSORSHIP_ITEM_STATUSES.includes(value as SponsorshipItemStatus);
}

/**
 * Type guard: check if a string is a valid PledgeStatus
 */
export function isValidPledgeStatus(value: unknown): value is PledgeStatus {
  return typeof value === 'string' && ALL_PLEDGE_STATUSES.includes(value as PledgeStatus);
}
