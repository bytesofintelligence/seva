import { SponsorshipItemStatus } from '@/types/sponsorship';

export type SponsorshipCategoryColor = 'teal' | 'coral' | 'amber' | 'blue' | 'purple';

export interface SponsorshipCategoryOption {
  key: string;
  label: string;
  color: SponsorshipCategoryColor;
}

export const SPONSORSHIP_CATEGORIES: SponsorshipCategoryOption[] = [
  { key: 'food', label: 'Food', color: 'coral' },
  { key: 'essentials', label: 'Essentials', color: 'teal' },
  { key: 'education', label: 'Education', color: 'blue' },
  { key: 'emergency', label: 'Emergency', color: 'amber' },
  { key: 'other', label: 'Other', color: 'purple' },
];

export function colorForCategory(category: string): SponsorshipCategoryColor {
  return SPONSORSHIP_CATEGORIES.find((c) => c.key === category)?.color ?? 'teal';
}

export function labelForCategory(category: string): string {
  return SPONSORSHIP_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

export const SPONSORSHIP_ITEM_STATUS_LABEL: Record<SponsorshipItemStatus, string> = {
  open: 'Open',
  fully_pledged: 'Fully pledged',
  fulfilled: 'Fulfilled',
  closed: 'Closed',
};

export function colorForItemStatus(status: SponsorshipItemStatus): SponsorshipCategoryColor {
  switch (status) {
    case 'open':
      return 'teal';
    case 'fully_pledged':
      return 'amber';
    case 'fulfilled':
      return 'blue';
    case 'closed':
    default:
      return 'coral';
  }
}
