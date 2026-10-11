import { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, Card } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { ThemedText } from '@/components/themed-text';
import { InstagramFeedWidget } from '@/components/InstagramFeedWidget';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface CharityProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  mission: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  operating_areas: string | null;
  how_it_works: string | null;
  key_services: string | null;
  volunteer_requirements: string | null;
  instagram_handle: string | null;
  twitter_handle: string | null;
  facebook_url: string | null;
}

export default function CharityProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [charity, setCharity] = useState<CharityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchCharity();
    }
  }, [id]);

  const fetchCharity = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('charities')
        .select('*')
        .eq('id', id)
        .single();

      if (supabaseError) throw supabaseError;
      setCharity(data);
    } catch (err: any) {
      console.error('Error fetching charity:', err);
      setError(err?.message || 'Failed to load charity profile');
    } finally {
      setLoading(false);
    }
  };

  const openUrl = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Error opening URL:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <Screen>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        </Screen>
      </SafeAreaView>
    );
  }

  if (error || !charity) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <Screen padding="lg">
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: Spacing.lg }}>
            <ThemedText style={{ color: Colors.primary, fontSize: 14 }}>
              ← Back
            </ThemedText>
          </TouchableOpacity>
          <ThemedText type="h2" style={{ color: Colors.textPrimary }}>
            Error
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary, marginTop: Spacing.md }}>
            {error || 'Charity not found'}
          </ThemedText>
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.lg,
        }}
      >
        {/* Back Button */}
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: Spacing.lg }}>
          <ThemedText style={{ color: Colors.primary, fontSize: 14 }}>
            ← Back
          </ThemedText>
        </TouchableOpacity>

        {/* Avatar */}
        {charity.avatar_url && (
          <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
            <AvatarDisplay
              avatarUrl={charity.avatar_url}
              fullName={charity.name}
              size="lg"
            />
          </View>
        )}

        {/* Charity Name */}
        <ThemedText
          type="h1"
          style={{
            color: Colors.textPrimary,
            marginBottom: Spacing.sm,
            textAlign: 'center',
          }}
        >
          {charity.name}
        </ThemedText>

        {/* Description */}
        {charity.description && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                lineHeight: 20,
              }}
            >
              {charity.description}
            </ThemedText>
          </Card>
        )}

        {/* Mission */}
        {charity.mission && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                marginBottom: Spacing.sm,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              Mission
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                lineHeight: 20,
              }}
            >
              {charity.mission}
            </ThemedText>
          </Card>
        )}

        {/* How It Works */}
        {charity.how_it_works && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                marginBottom: Spacing.sm,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              How It Works
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                lineHeight: 20,
              }}
            >
              {charity.how_it_works}
            </ThemedText>
          </Card>
        )}

        {/* Key Services */}
        {charity.key_services && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                marginBottom: Spacing.sm,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              Key Services
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                lineHeight: 20,
              }}
            >
              {charity.key_services}
            </ThemedText>
          </Card>
        )}

        {/* Operating Areas */}
        {charity.operating_areas && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                marginBottom: Spacing.sm,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              Where We Operate
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                lineHeight: 20,
              }}
            >
              {charity.operating_areas}
            </ThemedText>
          </Card>
        )}

        {/* Volunteer Requirements */}
        {charity.volunteer_requirements && (
          <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                marginBottom: Spacing.sm,
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              Volunteer Requirements
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                lineHeight: 20,
              }}
            >
              {charity.volunteer_requirements}
            </ThemedText>
          </Card>
        )}

        {/* Contact Information */}
        <Card padding="lg" style={{ marginBottom: Spacing.lg }}>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 11,
              marginBottom: Spacing.md,
              fontWeight: '600',
              textTransform: 'uppercase',
            }}
          >
            Contact
          </ThemedText>

          {charity.website && (
            <TouchableOpacity
              onPress={() => openUrl(charity.website!)}
              style={{ marginBottom: Spacing.md }}
            >
              <ThemedText style={{ color: Colors.primary, textDecorationLine: 'underline' }}>
                🌐 {charity.website}
              </ThemedText>
            </TouchableOpacity>
          )}

          {charity.contact_email && (
            <TouchableOpacity
              onPress={() => openUrl(`mailto:${charity.contact_email}`)}
              style={{ marginBottom: Spacing.md }}
            >
              <ThemedText style={{ color: Colors.primary, textDecorationLine: 'underline' }}>
                ✉️ {charity.contact_email}
              </ThemedText>
            </TouchableOpacity>
          )}

          {charity.contact_phone && (
            <TouchableOpacity onPress={() => openUrl(`tel:${charity.contact_phone}`)}>
              <ThemedText style={{ color: Colors.primary, textDecorationLine: 'underline' }}>
                📞 {charity.contact_phone}
              </ThemedText>
            </TouchableOpacity>
          )}
        </Card>

        {/* Instagram Feed */}
        {charity.instagram_handle && (
          <InstagramFeedWidget
            instagramHandle={charity.instagram_handle}
            charityName={charity.name}
          />
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
