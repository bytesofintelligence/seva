/**
 * Rounding policy for proportional sponsorship pledge amounts.
 *
 * Each pledge's amount is quantity/quantity_needed of total_cost, rounded to
 * the penny. We round DOWN (floor), not up: if every partial pledge rounded
 * up, the sum of many small pledges can overshoot total_cost by more than a
 * penny (e.g. quantity_needed=3, total_cost=£10.00 -> 3 pledges of 1 unit
 * each at ceil(£3.34) = £10.02, 2p over). Flooring guarantees the sum of any
 * set of pledges whose quantities add up to quantity_needed never exceeds
 * total_cost — the only direction that actually matters financially.
 *
 * The one exception: a pledge's amount must be > 0 (DB constraint), so a
 * pledge for a tiny fraction of a very cheap item is floored up to 1p. This
 * is the sole case where the total could overshoot by a few pence, and only
 * for pathologically low-cost-per-unit items.
 */
export function computePledgeAmount(quantity: number, totalCost: number, quantityNeeded: number): number {
  if (quantityNeeded <= 0) return 0;
  const totalCostCents = Math.round(totalCost * 100);
  const cents = Math.max(1, Math.floor((quantity * totalCostCents) / quantityNeeded));
  return cents / 100;
}
