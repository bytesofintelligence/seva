import { useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Linking, Image } from 'react-native';
import { ThemedText } from './themed-text';
import { Spacing, Colors, Typography } from '@/constants/design-tokens';

interface InstagramEmbedWebViewProps {
  instagramHandle: string;
  charityName: string;
}

export function InstagramEmbedWebView({ instagramHandle, charityName }: InstagramEmbedWebViewProps) {
  const [loading, setLoading] = useState(true);

  const openInstagramProfile = async () => {
    const igDeepLink = `instagram://user?username=${instagramHandle}`;
    const igWebURL = `https://instagram.com/${instagramHandle}`;

    try {
      const canOpen = await Linking.canOpenURL(igDeepLink);
      if (canOpen) {
        await Linking.openURL(igDeepLink);
      } else {
        await Linking.openURL(igWebURL);
      }
    } catch (error) {
      console.error('Error opening Instagram:', error);
      try {
        await Linking.openURL(igWebURL);
      } catch (err) {
        console.error('Error opening Instagram web:', err);
      }
    }
  };

  return (
    <View style={{ marginVertical: Spacing.lg }}>
      <ThemedText
        style={{
          color: Colors.textSecondary,
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Spacing.md,
          textTransform: 'uppercase',
        }}
      >
        Latest from Instagram
      </ThemedText>

      {/* Instagram Feed Preview Card */}
      <TouchableOpacity
        onPress={openInstagramProfile}
        activeOpacity={0.8}
        style={{
          backgroundColor: Colors.surfaceMuted,
          borderRadius: 12,
          padding: Spacing.lg,
          gap: Spacing.md,
        }}
      >
        <View style={{ gap: Spacing.md }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.md,
            }}
          >
            <Image
              source={require('../../instagramlogo.jpeg')}
              style={{ width: 44, height: 44 }}
            />
            <View style={{ flex: 1 }}>
              <ThemedText style={[Typography.cardTitle, { color: Colors.textPrimary }]}>
                @{instagramHandle}
              </ThemedText>
              <ThemedText style={[Typography.meta, { color: Colors.textSecondary }]}>
                {charityName} on Instagram
              </ThemedText>
            </View>
          </View>

          {/* Info */}
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            Follow for:
          </ThemedText>
          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              • Recent volunteer opportunities
            </ThemedText>
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              • Impact stories and updates
            </ThemedText>
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              • Behind-the-scenes content
            </ThemedText>
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              • Event announcements
            </ThemedText>
          </View>

          {/* CTA Button */}
          <View
            style={{
              backgroundColor: Colors.primary,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: Spacing.sm,
            }}
          >
            <ThemedText
              style={{
                color: Colors.cardBg,
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              View Profile on Instagram →
            </ThemedText>
          </View>
        </View>
      </TouchableOpacity>

      {/* Note */}
      <ThemedText
        style={{
          color: Colors.textSecondary,
          fontSize: 11,
          marginTop: Spacing.md,
          fontStyle: 'italic',
          textAlign: 'center',
        }}
      >
        Opens Instagram to see all posts and stories
      </ThemedText>
    </View>
  );
}
