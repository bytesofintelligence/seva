/**
 * SEVA Design System Tokens
 * Single source of truth for colors, typography, spacing, and radius
 * Based on DESIGN.md sections 1-3
 */

export const Colors = {
  // Brand
  primary: '#0F6E56', // Primary teal
  primaryTintBg: '#E1F5EE', // Soft teal background

  // Neutrals (warm, not cold grey)
  textPrimary: '#2C2C2A', // Titles, main text
  textSecondary: '#5F5E5A', // Subtitles, descriptions
  textTertiary: '#888780', // Hints, placeholder, inactive icons
  pageBg: '#F5F3EE', // Screen background
  cardBg: '#FFFFFF', // Cards
  surfaceMuted: '#F1EFE8', // Search bar, stat cells, chips
  border: '#E7E5DD', // Hairline borders (1px)
  ringTrack: '#E0DED5', // Unfilled progress ring

  // Category pairs: (fill, text, icon variant)
  category: {
    teal: { bg: '#E1F5EE', text: '#0F6E56' }, // Support, positive
    coral: { bg: '#FAECE7', text: '#993C1D', icon: '#D85A30' }, // Delivery, Flagship, Volunteer
    amber: { bg: '#FAEEDA', text: '#BA7517' }, // Empower, nearly full
    blue: { bg: '#E6F1FB', text: '#0C447C' }, // On-site
    purple: { bg: '#EEEDFE', text: '#534AB7' }, // Remote, Act
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const BorderRadius = {
  none: 0,
  sm: 10, // Stat cells
  md: 12, // Search bar, pillar badges
  lg: 14, // Buttons
  xl: 18, // Opportunity/hero cards, logo mark
  xxl: 20, // Large dashboard panels
  full: 50, // Avatar circle
  pill: 999, // Tags, chips, pills
} as const;

export const Typography = {
  // SEVA wordmark: 34px / 500 / textPrimary / letter-spacing 3px
  wordmark: {
    fontSize: 34,
    fontWeight: '500' as const,
    letterSpacing: 3,
  },

  // Devanagari: 22px / 500 / primary
  devanagari: {
    fontSize: 22,
    fontWeight: '500' as const,
  },

  // Screen title: 22px / 500 / textPrimary
  screenTitle: {
    fontSize: 22,
    fontWeight: '500' as const,
  },

  // Card title (opportunity): 16px / 500 / textPrimary
  cardTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
  },

  // Hero card title: 18px / 500 / textPrimary
  heroTitle: {
    fontSize: 18,
    fontWeight: '500' as const,
  },

  // Body / org name / subtitle: 13px / 400 / textSecondary
  body: {
    fontSize: 13,
    fontWeight: '400' as const,
  },

  // Greeting: 13px / 400 / textSecondary
  greeting: {
    fontSize: 13,
    fontWeight: '400' as const,
  },

  // Tag/badge text: 11px / 500
  badge: {
    fontSize: 11,
    fontWeight: '500' as const,
  },

  // Filter chip text: 13px / 400 or 500
  chip: {
    fontSize: 13,
    fontWeight: '400' as const, // Default unselected
  },
  chipSelected: {
    fontSize: 13,
    fontWeight: '500' as const,
  },

  // Meta (distance, "2h"): 12px / 400 / textSecondary/textTertiary
  meta: {
    fontSize: 12,
    fontWeight: '400' as const,
  },

  // Button label: 15px / 500 / white or teal
  button: {
    fontSize: 15,
    fontWeight: '500' as const,
  },

  // Ring center number: 30px / 500 / textPrimary
  ringNumber: {
    fontSize: 30,
    fontWeight: '500' as const,
  },

  // Ring center caption: 12px / 400 / textSecondary
  ringCaption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },

  // Stat cell number: 20px / 500 / textPrimary
  statNumber: {
    fontSize: 20,
    fontWeight: '500' as const,
  },

  // Stat cell label: 11px / 400 / textSecondary
  statLabel: {
    fontSize: 11,
    fontWeight: '400' as const,
  },

  // Pillar word: 15px / 500 / textPrimary (first letter in accent)
  pillarWord: {
    fontSize: 15,
    fontWeight: '500' as const,
  },

  // Pillar description: 12px / 400 / textSecondary
  pillarDescription: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
} as const;

export const Layout = {
  // Screen padding
  screenPaddingHorizontal: 20,

  // Card padding
  cardPadding: 14,
  heroCardPadding: 16,
  dashboardPanelPadding: 16,

  // Gaps
  cardGap: 12,
  sectionGap: 14, // Between title/search/chips sections
  pillarGap: 16, // Between pillar rows
  chipGap: 8, // Between filter chips
} as const;
