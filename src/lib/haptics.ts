import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback utilities for key actions
 * Provides tactile feedback to make interactions feel more responsive
 */

export const haptics = {
  /**
   * Light tap feedback - for quick interactions like button presses
   */
  light: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      // Silently fail if haptics unavailable
      console.debug('Haptics unavailable');
    }
  },

  /**
   * Medium feedback - for form submissions, accepting applications
   */
  medium: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.debug('Haptics unavailable');
    }
  },

  /**
   * Heavy feedback - for significant actions like completing a task
   */
  heavy: async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (err) {
      console.debug('Haptics unavailable');
    }
  },

  /**
   * Success notification - for successful submissions
   */
  success: async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.debug('Haptics unavailable');
    }
  },

  /**
   * Warning notification - for errors or important alerts
   */
  warning: async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (err) {
      console.debug('Haptics unavailable');
    }
  },

  /**
   * Selection feedback - for toggle/switch changes
   */
  selection: async () => {
    try {
      await Haptics.selectionAsync();
    } catch (err) {
      console.debug('Haptics unavailable');
    }
  },
};
