import { useEffect, useState } from 'react';
import { View, ActivityIndicator, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { Card, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface CharityProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  mission: string | null;
  description: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  operating_areas: string | null;
  how_it_works: string | null;
  key_services: string | null;
  volunteer_requirements: string | null;
}

export default function CharityProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [charity, setCharity] = useState<CharityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);

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
        .select(
          `
          id,
          name,
          avatar_url,
          mission,
          description,
          website,
          contact_email,
          contact_phone,
          operating_areas,
          how_it_works,
          key_services,
          volunteer_requirements
        `
        )
        .eq('id', id)
        .single();

      if (supabaseError) {
        throw supabaseError;
      }

      if (!data) {
        setError('Charity not found');
        return;
      }

      setCharity(data);

      // Resolve avatar URL if it's a storage path
      if (data.avatar_url) {
        if (data.avatar_url.startsWith('http://') || data.avatar_url.startsWith('https://')) {
          setResolvedAvatarUrl(data.avatar_url);
        } else {
          // It's a storage path, get signed URL
          const { data: signedUrlData } = await supabase.storage
            .from('avatars')
            .createSignedUrl(data.avatar_url, 60 * 60);
          if (signedUrlData?.signedUrl) {
            setResolvedAvatarUrl(signedUrlData.signedUrl);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching charity:', err);
      setError(err?.message || 'Failed to load charity profile');
    } finally {
      setLoading(false);
    }
  };

  const handleContactEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleContactPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleOpenWebsite = (url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    Linking.openURL(url);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color={Colors.primary} />
          <ThemedText style={{ marginTop: Spacing.md, color: Colors.textSecondary }}>
            Loading charity profile...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !charity) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <View style={{ flex: 1, padding: Spacing.lg }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginBottom: Spacing.lg }}
          >
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
              ← Back
            </ThemedText>
          </TouchableOpacity>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ThemedText
              type="h2"
              style={{
                marginBottom: Spacing.md,
                textAlign: 'center',
                color: Colors.textPrimary,
              }}
            >
              Charity Not Found
            </ThemedText>
            <ThemedText
              style={{
                textAlign: 'center',
                color: Colors.textSecondary,
                marginBottom: Spacing.xl,
              }}
            >
              {error || 'This charity profile may no longer be available.'}
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      >
        {/* Header with back button */}
        <View
          style={{
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
              ← Back
            </ThemedText>
          </TouchableOpacity>
          <ThemedText
            type="h3"
            style={{
              flex: 1,
              marginLeft: Spacing.md,
              color: Colors.textPrimary,
            }}
          >
            About
          </ThemedText>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.xl }}>
          {/* Avatar */}
          {resolvedAvatarUrl && (
            <View
              style={{
                width: '100%',
                height: 200,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: Colors.surfaceMuted,
              }}
            >
              <Image
                source={{ uri: resolvedAvatarUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
          )}

          {/* Charity Name */}
          <View>
            <ThemedText
              type="h1"
              style={{
                color: Colors.textPrimary,
              }}
            >
              {charity.name}
            </ThemedText>
          </View>

          {/* Mission Section */}
          {charity.mission && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                OUR MISSION
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.mission}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* Description Section */}
          {charity.description && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                ABOUT US
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.description}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* Operating Areas */}
          {charity.operating_areas && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                OPERATING AREAS
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.operating_areas}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* How It Works */}
          {charity.how_it_works && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                HOW WE WORK
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.how_it_works}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* Key Services */}
          {charity.key_services && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                KEY SERVICES
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.key_services}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* Volunteer Requirements */}
          {charity.volunteer_requirements && (
            <View>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                VOLUNTEER REQUIREMENTS
              </ThemedText>
              <Card shadow="sm" padding="lg">
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {charity.volunteer_requirements}
                </ThemedText>
              </Card>
            </View>
          )}

          {/* Contact Section */}
          <View>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.md,
                fontWeight: '600',
              }}
            >
              GET IN TOUCH
            </ThemedText>

            <View style={{ gap: Spacing.md }}>
              {charity.website && (
                <TouchableOpacity
                  onPress={() => handleOpenWebsite(charity.website!)}
                  activeOpacity={0.7}
                >
                  <Card shadow="sm" padding="lg">
                    <ThemedText
                      style={{
                        color: Colors.primary,
                        fontSize: 16,
                        fontWeight: '500',
                      }}
                    >
                      🌐 Visit Website
                    </ThemedText>
                  </Card>
                </TouchableOpacity>
              )}

              {charity.contact_email && (
                <TouchableOpacity
                  onPress={() => handleContactEmail(charity.contact_email!)}
                  activeOpacity={0.7}
                >
                  <Card shadow="sm" padding="lg">
                    <ThemedText
                      style={{
                        color: Colors.primary,
                        fontSize: 16,
                        fontWeight: '500',
                      }}
                    >
                      ✉️ {charity.contact_email}
                    </ThemedText>
                  </Card>
                </TouchableOpacity>
              )}

              {charity.contact_phone && (
                <TouchableOpacity
                  onPress={() => handleContactPhone(charity.contact_phone!)}
                  activeOpacity={0.7}
                >
                  <Card shadow="sm" padding="lg">
                    <ThemedText
                      style={{
                        color: Colors.primary,
                        fontSize: 16,
                        fontWeight: '500',
                      }}
                    >
                      📞 {charity.contact_phone}
                    </ThemedText>
                  </Card>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
