/**
 * Canonical Application Status Types
 *
 * This is the single source of truth for all application statuses.
 * Import from here instead of hardcoding strings to prevent spelling drift.
 */

/**
 * All seven canonical application statuses
 * Do not add new statuses without:
 * 1. Adding to database check constraint
 * 2. Updating migration
 * 3. Adding status color mapping in UI
 */
export type ApplicationStatus =
  | 'pending'      // Awaiting charity review
  | 'confirmed'    // Auto-confirmed by system
  | 'approved'     // Manually approved by charity
  | 'in_progress'  // Volunteer is actively working
  | 'completed'    // Volunteer finished
  | 'rejected'     // Charity rejected
  | 'cancelled';   // Withdrawn/cancelled

/**
 * All valid application statuses as a constant array
 * Use for database constraints, validation, etc.
 */
export const ALL_STATUSES: ApplicationStatus[] = [
  'pending',
  'confirmed',
  'approved',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
];

/**
 * Statuses where volunteer is still involved or awaiting action
 * Used to group applications as "Upcoming" in the schedule view
 */
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  'pending',      // Waiting for charity review
  'confirmed',    // Auto-confirmed, actively coming
  'approved',     // Manually approved, actively coming
  'in_progress',  // Currently volunteering
];

/**
 * Statuses where volunteer's involvement is finished
 * Used to group applications as "Past" in the schedule view
 */
export const PAST_STATUSES: ApplicationStatus[] = [
  'completed',    // Finished work
  'rejected',     // Never happened (rejected)
  'cancelled',    // Withdrawn/cancelled
];

/**
 * Statuses that count toward volunteer capacity
 * Used in opportunity_volunteer_counts view and capacity checking
 */
export const COUNTED_STATUSES: ApplicationStatus[] = [
  'confirmed',    // Auto-confirmed, actively coming
  'approved',     // Manually approved, actively coming
  'in_progress',  // Currently working
];

/**
 * Type guard: check if a string is a valid ApplicationStatus
 * @param value - String to validate
 * @returns true if value is a valid ApplicationStatus
 */
export function isValidStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && ALL_STATUSES.includes(value as ApplicationStatus);
}

/**
 * Statuses that indicate a decision has been made (not pending)
 * @param status - Status to check
 * @returns true if decision is final
 */
export function isStatusDecided(status: ApplicationStatus): boolean {
  return status !== 'pending';
}

/**
 * Statuses where volunteer is actively coming/working
 * @param status - Status to check
 * @returns true if volunteer is actively committed
 */
export function isStatusActive(status: ApplicationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
