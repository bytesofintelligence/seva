import { useState } from 'react';
import { View, TouchableOpacity, Linking, ActivityIndicator, Text } from 'react-native';
import { ThemedText } from './themed-text';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';

interface InstagramFeedProps {
  instagramHandle: string | null;
  charityName: string;
}

export function InstagramFeed({ instagramHandle, charityName }: InstagramFeedProps) {
  const [loading, setLoading] = useState(false);

  if (!instagramHandle) {
    return null;
  }

  const openInstagram = async () => {
    setLoading(true);
    const igDeepLink = `instagram://user?username=${instagramHandle}`;
    const igWebURL = `https://instagram.com/${instagramHandle}`;

    try {
      // Try to open Instagram app first
      const canOpen = await Linking.canOpenURL(igDeepLink);
      if (canOpen) {
        await Linking.openURL(igDeepLink);
      } else {
        // Fall back to web if app not installed
        await Linking.openURL(igWebURL);
      }
    } catch (error) {
      console.error('Error opening Instagram:', error);
      // Fallback to web
      try {
        await Linking.openURL(igWebURL);
      } catch (err) {
        console.error('Error opening Instagram web:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={openInstagram}
      disabled={loading}
      style={{
        backgroundColor: Colors.surfaceMuted,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        marginVertical: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
      }}
    >
      <View>
        <ThemedText
          style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.xs }]}
        >
          Follow on Instagram
        </ThemedText>
        <ThemedText
          style={[
            Typography.cardTitle,
            { color: Colors.textPrimary, marginBottom: Spacing.xs },
          ]}
        >
          @{instagramHandle}
        </ThemedText>
        <ThemedText
          style={[Typography.meta, { color: Colors.textSecondary }]}
        >
          Tap to view their posts and stories
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} size="small" />
      ) : (
        <ThemedText style={{ fontSize: 24, marginLeft: 'auto' }}>📷</ThemedText>
      )}
    </TouchableOpacity>
  );
}
