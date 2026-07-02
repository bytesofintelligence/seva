/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2C2C2A',
    background: '#F5F3EE',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E1F5EE',
    textSecondary: '#5F5E5A',
    textTertiary: '#888780',
    primary: '#0F6E56',
    border: '#E7E5DD',
    tabBarBg: '#FFFFFF',
    tabBarActive: '#0F6E56',
    tabBarInactive: '#888780',
  },
  dark: {
    text: '#FFFFFF',
    background: '#1A1917',
    backgroundElement: '#2C2A27',
    backgroundSelected: '#3D3A35',
    textSecondary: '#B0B4BA',
    textTertiary: '#888780',
    primary: '#0F6E56',
    border: '#2C2A27',
    tabBarBg: '#2C2A27',
    tabBarActive: '#0F6E56',
    tabBarInactive: '#888780',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = {
  sans: 'Inter-Regular',
  serif: 'Inter-Regular',
  rounded: 'Inter-Regular',
  mono: 'monospace',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
