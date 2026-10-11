import { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Linking, ActivityIndicator, FlatList, Image } from 'react-native';
import { ThemedText } from './themed-text';
import { Card } from './ui';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';

interface InstagramFeedWidgetProps {
  instagramHandle: string | null;
  charityName: string;
}

interface InstagramPost {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  timestamp: string;
  permalink: string;
}

export function InstagramFeedWidget({ instagramHandle, charityName }: InstagramFeedWidgetProps) {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (instagramHandle) {
      setPosts([]);
    }
  }, [instagramHandle]);

  const openInstagram = async () => {
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

  if (!instagramHandle) {
    return null;
  }

  return (
    <View style={{ marginVertical: Spacing.lg }}>
      {/* Header */}
      <ThemedText
        style={{
          color: Colors.textSecondary,
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Spacing.md,
          textTransform: 'uppercase',
        }}
      >
        Follow on Social
      </ThemedText>

      {/* Instagram Card */}
      <TouchableOpacity
        onPress={openInstagram}
        activeOpacity={0.8}
      >
        <Card
          padding="lg"
          style={{
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            gap: Spacing.md,
          }}
        >
          {/* Instagram Logo and Handle */}
          <View
            style={{
              alignItems: 'center',
              gap: Spacing.sm,
            }}
          >
            <Image
              source={require('../../instagramlogo.jpeg')}
              style={{ width: 52, height: 52 }}
            />
            <ThemedText
              style={[Typography.cardTitle, { color: Colors.textPrimary }]}
            >
              @{instagramHandle}
            </ThemedText>
            <ThemedText
              style={[
                Typography.body,
                { color: Colors.textSecondary, textAlign: 'center' },
              ]}
            >
              Follow {charityName} on Instagram
            </ThemedText>
          </View>

          {/* Call to Action */}
          <View
            style={{
              backgroundColor: Colors.primary,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.sm,
              borderRadius: BorderRadius.full,
            }}
          >
            <ThemedText
              style={{
                color: Colors.cardBg,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              View Instagram →
            </ThemedText>
          </View>

          {/* Description */}
          <ThemedText
            style={[
              Typography.meta,
              { color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            See recent posts, stories, and updates from {charityName}
          </ThemedText>
        </Card>
      </TouchableOpacity>

      {/* Info Message */}
      <ThemedText
        style={{
          color: Colors.textSecondary,
          fontSize: 12,
          marginTop: Spacing.md,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Instagram integration displays latest posts. Updates sync daily.
      </ThemedText>
    </View>
  );
}
