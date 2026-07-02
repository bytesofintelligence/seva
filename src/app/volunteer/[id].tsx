import { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, Card } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface VolunteerProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  phone: string | null;
  volunteer_id: string | null;
  can_drive: boolean;
  can_drive_van: boolean;
  can_collect_and_deliver: boolean;
}

export default function VolunteerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [volunteer, setVolunteer] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchVolunteer();
    }
  }, [id]);

  const fetchVolunteer = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(
          'id, full_name, avatar_url, bio, location, phone, volunteer_id, can_drive, can_drive_van, can_collect_and_deliver'
        )
        .eq('id', id)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (!data) {
        setError('Volunteer profile not found');
        return;
      }

      setVolunteer(data);
    } catch (err: any) {
      console.error('Error fetching volunteer:', err);
      setError(err?.message || 'Failed to load volunteer profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <Screen padding="lg">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <ThemedText style={{ marginTop: Spacing.md, color: Colors.textSecondary }}>
              Loading profile...
            </ThemedText>
          </View>
        </Screen>
      </SafeAreaView>
    );
  }

  if (error || !volunteer) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <Screen padding="lg">
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: Spacing.lg }}>
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
              ← Back
            </ThemedText>
          </TouchableOpacity>

          <ThemedText
            type="h2"
            style={{
              marginBottom: Spacing.md,
              color: Colors.textPrimary,
            }}
          >
            Profile Not Found
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.xl }}>
            {error || 'Could not load volunteer profile'}
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
          <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
            ← Back
          </ThemedText>
        </TouchableOpacity>

        {/* Header with Avatar */}
        <View
          style={{
            alignItems: 'center',
            marginBottom: Spacing.xl,
          }}
        >
          <AvatarDisplay
            avatarUrl={volunteer.avatar_url}
            fullName={volunteer.full_name}
            size="lg"
          />
          <ThemedText
            type="h1"
            style={{
              marginTop: Spacing.lg,
              color: Colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {volunteer.full_name || 'Volunteer'}
          </ThemedText>
          {volunteer.volunteer_id && (
            <ThemedText
              style={{
                marginTop: Spacing.sm,
                color: Colors.primary,
                fontSize: 14,
                fontFamily: 'Courier New',
                fontWeight: '600',
                textAlign: 'center',
                letterSpacing: 1,
              }}
            >
              {volunteer.volunteer_id}
            </ThemedText>
          )}
        </View>

        {/* Location */}
        {volunteer.location && (
          <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.sm,
                fontWeight: '600',
              }}
            >
              LOCATION
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              📍 {volunteer.location}
            </ThemedText>
          </Card>
        )}

        {/* Contact Info */}
        <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.lg }}>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.md,
              fontWeight: '600',
            }}
          >
            CONTACT
          </ThemedText>

          {volunteer.phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${volunteer.phone}`)}>
              <ThemedText
                style={{
                  color: Colors.primary,
                  fontSize: 14,
                  marginBottom: Spacing.sm,
                  textDecorationLine: 'underline',
                  fontWeight: '500',
                }}
              >
                📱 {volunteer.phone}
              </ThemedText>
            </TouchableOpacity>
          )}

          {!volunteer.phone && (
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 13,
              }}
            >
              No phone number provided
            </ThemedText>
          )}
        </Card>

        {/* Bio */}
        {volunteer.bio && (
          <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.sm,
                fontWeight: '600',
              }}
            >
              ABOUT
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              {volunteer.bio}
            </ThemedText>
          </Card>
        )}

        {/* Capabilities */}
        {(volunteer.can_drive || volunteer.can_drive_van || volunteer.can_collect_and_deliver) && (
          <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.md,
                fontWeight: '600',
              }}
            >
              WHAT THEY CAN HELP WITH
            </ThemedText>

            <View style={{ gap: Spacing.sm }}>
              {volunteer.can_drive && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: Spacing.sm,
                  }}
                >
                  <ThemedText
                    style={{
                      color: Colors.primary,
                      fontSize: 18,
                      marginRight: Spacing.md,
                    }}
                  >
                    🚗
                  </ThemedText>
                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    Can drive
                  </ThemedText>
                </View>
              )}

              {volunteer.can_drive_van && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: Spacing.sm,
                  }}
                >
                  <ThemedText
                    style={{
                      color: Colors.primary,
                      fontSize: 18,
                      marginRight: Spacing.md,
                    }}
                  >
                    🚐
                  </ThemedText>
                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    Can drive a van
                  </ThemedText>
                </View>
              )}

              {volunteer.can_collect_and_deliver && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: Spacing.sm,
                  }}
                >
                  <ThemedText
                    style={{
                      color: Colors.primary,
                      fontSize: 18,
                      marginRight: Spacing.md,
                    }}
                  >
                    📦
                  </ThemedText>
                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    Willing to collect items & deliver to charity
                  </ThemedText>
                </View>
              )}
            </View>
          </Card>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
