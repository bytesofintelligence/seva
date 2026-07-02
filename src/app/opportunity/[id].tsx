import { useEffect, useState } from 'react';
import { View, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, Card, Button, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { ApplicationModal } from '@/components/ApplicationModal';
import { LocationCard } from '@/components/LocationCard';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES } from '@/types/status';

interface Opportunity {
  id: string;
  title: string;
  description: string;
  location: string;
  type: string | null;
  starts_at: string | null;
  status: string;
  featured: boolean;
  signup_mode: 'review' | 'auto_confirm';
  target_volunteers: number | null;
  max_volunteers: number | null;
  charities: {
    id: string;
    name: string;
    description: string | null;
  } | null;
}

interface VolunteerCount {
  volunteers_count: number;
}

const typeToColor = (type: string | null): 'teal' | 'coral' | 'blue' | 'purple' | 'amber' => {
  if (!type) return 'teal';
  const t = type.toLowerCase();
  if (t === 'delivery') return 'coral';
  if (t === 'on-site') return 'blue';
  if (t === 'remote') return 'purple';
  if (t === 'flagship') return 'coral';
  return 'teal';
};

const formatTagLabel = (type: string | null): string => {
  if (!type) return '';
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
};

export default function OpportunityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [volunteerCount, setVolunteerCount] = useState<VolunteerCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [userApplicationStatus, setUserApplicationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchOpportunity();
    }
  }, [id]);

  useFocusEffect(() => {
    if (id && session?.user.id) {
      checkApplicationStatus();
    }
  });

  const checkApplicationStatus = async () => {
    if (!id || !session?.user.id) return;

    try {
      const { data: appData } = await supabase
        .from('applications')
        .select('status')
        .eq('volunteer_id', session.user.id)
        .eq('opportunity_id', id);

      if (appData && appData.length > 0) {
        const status = appData[0].status;
        // Only show status for active applications
        // If cancelled/rejected, treat as no application (show "Apply to help")
        if (ACTIVE_STATUSES.includes(status)) {
          setUserApplicationStatus(status);
        } else {
          setUserApplicationStatus(null);
        }
      } else {
        setUserApplicationStatus(null);
      }
    } catch (err) {
      console.error('Error checking application status:', err);
    }
  };

  const fetchOpportunity = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('opportunities')
        .select(
          `
          id,
          title,
          description,
          location,
          type,
          starts_at,
          status,
          featured,
          signup_mode,
          target_volunteers,
          max_volunteers,
          charities(
            id,
            name,
            description
          )
        `
        )
        .eq('id', id)
        .single();

      if (supabaseError) {
        throw supabaseError;
      }

      if (!data) {
        setError('Opportunity not found');
        return;
      }

      setOpportunity(data);

      // Fetch volunteer count from the view (source of truth)
      const { data: countData } = await supabase
        .from('opportunity_volunteer_counts')
        .select('volunteers_count')
        .eq('id', id)
        .single();

      if (countData) {
        setVolunteerCount(countData);
      }

      // Check if user has already applied to this opportunity
      if (session?.user.id) {
        await checkApplicationStatus();
      }
    } catch (err: any) {
      console.error('Error fetching opportunity:', err);
      setError(err?.message || 'Failed to load opportunity');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuccess = () => {
    setShowApplicationModal(false);
    // Navigate to schedule screen to see the confirmed opportunity
    router.push('/(tabs)/schedule');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Date TBD';
    try {
      const date = new Date(dateString);
      const options: Intl.DateTimeFormatOptions = {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return 'Date TBD';
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Use volunteers_count from view (source of truth)
  const volunteersCount = volunteerCount?.volunteers_count || 0;
  const targetVolunteers = opportunity?.target_volunteers || 0;
  const maxVolunteers = opportunity?.max_volunteers;

  // Determine effective cap: use max_volunteers if set, otherwise use target_volunteers (no overbooking by default)
  const effectiveCap = maxVolunteers !== null ? maxVolunteers : targetVolunteers;

  // Calculate spots left toward target
  const spotsLeft = Math.max(0, targetVolunteers - volunteersCount);

  // Opportunity is full if at effective capacity
  const isFull = effectiveCap !== null && volunteersCount >= effectiveCap;

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
            Loading opportunity...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !opportunity) {
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
              Opportunity Not Found
            </ThemedText>
            <ThemedText
              style={{
                textAlign: 'center',
                color: Colors.textSecondary,
                marginBottom: Spacing.xl,
              }}
            >
              {error || 'This opportunity may have been removed.'}
            </ThemedText>
            <Button label="Go Back" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const time = formatTime(opportunity.starts_at);

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
            Opportunity
          </ThemedText>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.xl }}>
          {/* Category Tag */}
          {opportunity.type && (
            <View>
              <Tag label={formatTagLabel(opportunity.type)} color={typeToColor(opportunity.type)} />
            </View>
          )}

          {/* Title */}
          <View>
            <ThemedText
              type="h1"
              style={{
                marginBottom: Spacing.md,
                color: Colors.textPrimary,
              }}
            >
              {opportunity.title}
            </ThemedText>
          </View>

          {/* Charity Info Card */}
          <TouchableOpacity
            onPress={() => {
              if (opportunity.charities?.id) {
                router.push(`/charity/${opportunity.charities.id}`);
              }
            }}
            activeOpacity={0.7}
          >
            <Card shadow="md" padding="lg">
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                }}
              >
                ORGANIZED BY
              </ThemedText>
              <ThemedText
                type="h3"
                style={{
                  marginBottom: Spacing.sm,
                  color: Colors.primary,
                }}
              >
                {opportunity.charities?.name || 'Unknown Charity'} →
              </ThemedText>
              {opportunity.charities?.description && (
                <ThemedText
                  style={{
                    color: Colors.textSecondary,
                    lineHeight: 20,
                  }}
                >
                  {opportunity.charities.description}
                </ThemedText>
              )}
            </Card>
          </TouchableOpacity>

          {/* Details Grid */}
          <View style={{ gap: Spacing.md }}>
            {/* Date and Time */}
            <Card shadow="sm" padding="lg">
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                }}
              >
                WHEN
              </ThemedText>
              <ThemedText
                style={{
                  color: Colors.textPrimary,
                  fontSize: 16,
                  fontWeight: '600',
                  marginBottom: Spacing.xs,
                }}
              >
                {formatDate(opportunity.starts_at)}
              </ThemedText>
              {time && (
                <ThemedText style={{ color: Colors.textSecondary }}>
                  {time}
                </ThemedText>
              )}
            </Card>

            {/* Location with Map */}
            <LocationCard location={opportunity.location} />

            {/* Spots Available */}
            <Card
              shadow="sm"
              padding="lg"
              backgroundColor={
                isFull ? Colors.category.coral.text : Colors.primaryTintBg
              }
            >
              <ThemedText
                style={{
                  color: isFull ? Colors.cardBg : Colors.primary,
                  fontSize: 12,
                  marginBottom: Spacing.sm,
                  fontWeight: '600',
                }}
              >
                AVAILABILITY
              </ThemedText>
              <ThemedText
                style={{
                  color: isFull ? Colors.cardBg : Colors.primary,
                  fontSize: 18,
                  fontWeight: '600',
                }}
              >
                {volunteersCount >= targetVolunteers && targetVolunteers > 0
                  ? `Target Reached! +${volunteersCount - targetVolunteers} overbooking`
                  : isFull
                  ? 'Opportunity Full'
                  : `${spotsLeft} of ${targetVolunteers} needed`}
              </ThemedText>
            </Card>
          </View>

          {/* Description */}
          <View>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.md,
              }}
            >
              ABOUT THIS OPPORTUNITY
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 16,
                lineHeight: 24,
              }}
            >
              {opportunity.description || 'No description available'}
            </ThemedText>
          </View>

          {/* Spacer for button */}
          <View style={{ height: Spacing.xxl }} />
        </View>
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View
        style={{
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.lg,
          backgroundColor: Colors.cardBg,
          borderTopWidth: 1,
          borderTopColor: Colors.surfaceMuted,
        }}
      >
        <Button
          label={
            userApplicationStatus
              ? `${userApplicationStatus.charAt(0).toUpperCase() + userApplicationStatus.slice(1)}`
              : isFull
                ? 'Opportunity Full'
                : 'Offer to Help'
          }
          onPress={() => {
            if (!userApplicationStatus) {
              setShowApplicationModal(true);
            }
          }}
          disabled={isFull || !!userApplicationStatus}
          variant={userApplicationStatus ? 'ghost' : 'primary'}
          size="lg"
        />
      </View>

      {/* Application Modal */}
      {opportunity && (
        <ApplicationModal
          visible={showApplicationModal}
          opportunityId={opportunity.id}
          opportunityTitle={opportunity.title}
          onClose={() => setShowApplicationModal(false)}
          onSuccess={handleApplySuccess}
        />
      )}
    </SafeAreaView>
  );
}
