import { useEffect, useState, useCallback } from 'react';
import { View, FlatList, TouchableOpacity, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { Screen, Card, Button, SkeletonCard, EmptyState } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { ApplicationStatus } from '@/types/status';

interface Application {
  id: string;
  status: ApplicationStatus;
  cover_letter: string | null;
  applied_at: string;
  volunteer_id: string;
  party_size: number;
  profiles: {
    full_name: string | null;
    phone: string | null;
    bio: string | null;
    location: string | null;
    can_drive: boolean;
    can_drive_van: boolean;
    can_collect_and_deliver: boolean;
  } | null;
}

interface Opportunity {
  id: string;
  title: string;
  target_volunteers: number | null;
  signup_mode: 'review' | 'auto_confirm';
}

interface OpportunityStats {
  volunteers_count: number;
  signups_count: number;
}

export default function ApplicationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id: opportunityId } = useLocalSearchParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [opportunityStats, setOpportunityStats] = useState<OpportunityStats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!opportunityId || !session?.user.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch opportunity data
      const { data: oppData, error: oppError } = await supabase
        .from('opportunities')
        .select('id, title, target_volunteers, signup_mode')
        .eq('id', opportunityId)
        .single();

      if (oppError) {
        throw oppError;
      }

      setOpportunity(oppData);

      // Fetch volunteer count stats from the view (source of truth)
      const { data: statsData } = await supabase
        .from('opportunity_volunteer_counts')
        .select('volunteers_count, signups_count')
        .eq('id', opportunityId)
        .single();

      if (statsData) {
        setOpportunityStats(statsData);
      }

      // Fetch applications for this opportunity with volunteer details
      const { data: appsData, error: appsError } = await supabase
        .from('applications')
        .select(
          `
          id,
          status,
          cover_letter,
          applied_at,
          volunteer_id,
          party_size,
          profiles(
            full_name,
            phone,
            bio,
            location,
            can_drive,
            can_drive_van,
            can_collect_and_deliver
          )
        `
        )
        .eq('opportunity_id', opportunityId)
        .order('applied_at', { ascending: false });

      if (appsError) {
        throw appsError;
      }

      setApplications(appsData || []);
    } catch (err: any) {
      console.error('Error fetching applications:', err);
      setError(err?.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [opportunityId, session?.user.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleUpdateStatus = async (appId: string, newStatus: Extract<ApplicationStatus, 'approved' | 'rejected'>) => {
    if (!opportunity) return;

    setUpdatingId(appId);

    // Store original state for rollback
    const originalApplications = applications;
    const originalOpportunity = opportunity;

    try {
      // OPTIMISTIC: Update UI immediately
      setApplications((prevApps) =>
        prevApps.map((app) =>
          app.id === appId ? { ...app, status: newStatus } : app
        )
      );

      // Haptic feedback for the action
      await haptics.medium();

      // ASYNC: Update application status in background
      // (spots_filled is computed from application statuses via the view, not stored)
      const { error: updateError } = await supabase
        .from('applications')
        .update({ status: newStatus })
        .eq('id', appId);

      if (updateError) {
        throw updateError;
      }

      // Success feedback
      await haptics.success();
      const action = newStatus === 'approved' ? 'Approved' : 'Rejected';
      Alert.alert(
        '✓ Success',
        `Application ${action.toLowerCase()}${newStatus === 'approved' ? ' • Spot filled' : ''}`
      );
    } catch (err: any) {
      console.error('Error updating application:', err);

      // ROLLBACK: Restore UI to original state
      setApplications(originalApplications);
      setOpportunity(originalOpportunity);

      // Error feedback
      await haptics.warning();
      Alert.alert('Error', err?.message || 'Failed to update application');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' => {
    switch (status) {
      // Waiting for review
      case 'pending':
        return 'info';

      // Confirmed/Committed (actively coming)
      case 'confirmed':
      case 'approved':
        return 'success';

      // In action
      case 'in_progress':
        return 'warning';

      // Completed
      case 'completed':
        return 'success';

      // Not coming
      case 'rejected':
      case 'cancelled':
        return 'error';

      default:
        return 'info';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderApplicationCard = ({ item }: { item: Application }) => {
    // Status is "decided" if it's confirmed, approved, or rejected (no longer pending review)
    const isDecided = item.status === 'confirmed' || item.status === 'approved' || item.status === 'rejected';
    // For auto_confirm mode, never show review buttons (volunteers are auto-confirmed)
    const isAutoConfirmMode = opportunity?.signup_mode === 'auto_confirm';
    const showButtons = !isDecided && !isAutoConfirmMode && item.status === 'pending';
    const isUpdating = updatingId === item.id;

    return (
      <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.lg }}>
        {/* Applicant Info */}
        <TouchableOpacity
          onPress={() => router.push(`/volunteer/${item.volunteer_id}`)}
          style={{ marginBottom: Spacing.md }}
        >
          <ThemedText
            type="h3"
            style={{
              marginBottom: Spacing.xs,
              color: Colors.primary,
              textDecorationLine: 'underline',
            }}
          >
            {item.profiles?.full_name || 'Unknown Applicant'}
          </ThemedText>
        </TouchableOpacity>

        <View style={{ marginBottom: Spacing.md }}>

          {item.party_size && (
            <ThemedText
              style={{
                color: Colors.primary,
                fontSize: 13,
                fontWeight: '600',
                marginBottom: Spacing.xs,
              }}
            >
              👥 {item.party_size} {item.party_size === 1 ? 'person' : 'people'}
            </ThemedText>
          )}

          {item.profiles?.location && (
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.xs,
              }}
            >
              📍 {item.profiles.location}
            </ThemedText>
          )}

          {item.profiles?.phone && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${item.profiles?.phone}`)}
            >
              <ThemedText
                style={{
                  color: Colors.primary,
                  fontSize: 12,
                  marginBottom: Spacing.xs,
                  textDecorationLine: 'underline',
                }}
              >
                📱 {item.profiles.phone}
              </ThemedText>
            </TouchableOpacity>
          )}

          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.sm,
            }}
          >
            Applied {formatDate(item.applied_at)}
          </ThemedText>

          {/* Volunteer Capabilities */}
          {(item.profiles?.can_drive || item.profiles?.can_drive_van || item.profiles?.can_collect_and_deliver) && (
            <View
              style={{
                backgroundColor: Colors.primaryTintBg,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                borderRadius: BorderRadius.md,
                marginTop: Spacing.sm,
              }}
            >
              <ThemedText
                style={{
                  color: Colors.primary,
                  fontSize: 11,
                  fontWeight: '600',
                }}
              >
                {[
                  item.profiles?.can_drive && '🚗 Can drive',
                  item.profiles?.can_drive_van && '🚐 Can drive van',
                  item.profiles?.can_collect_and_deliver && '📦 Can collect & deliver',
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Status Badge */}
        <View
          style={{
            marginBottom: Spacing.md,
            alignSelf: 'flex-start',
          }}
        >
          <View
            style={{
              backgroundColor:
                item.status === 'pending'
                  ? Colors.semantic.info
                  : item.status === 'approved'
                    ? Colors.primary
                    : Colors.category.coral.text,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.xs,
              borderRadius: BorderRadius.full,
            }}
          >
            <ThemedText
              style={{
                color: Colors.cardBg,
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {getStatusLabel(item.status)}
            </ThemedText>
          </View>
        </View>

        {/* Volunteer Bio */}
        {item.profiles?.bio && (
          <View
            style={{
              backgroundColor: Colors.surfaceMuted,
              padding: Spacing.md,
              borderRadius: BorderRadius.md,
              marginBottom: Spacing.md,
            }}
          >
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.sm,
              }}
            >
              ABOUT VOLUNTEER
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              {item.profiles.bio}
            </ThemedText>
          </View>
        )}

        {/* Cover Letter */}
        {item.cover_letter && (
          <View
            style={{
              backgroundColor: Colors.surfaceMuted,
              padding: Spacing.md,
              borderRadius: BorderRadius.md,
              marginBottom: Spacing.md,
            }}
          >
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.sm,
              }}
            >
              WHY THEY'RE INTERESTED
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {item.cover_letter}
            </ThemedText>
          </View>
        )}

        {/* Action Buttons (Review Mode Only) */}
        {showButtons && (
          <View style={{ gap: Spacing.md, flexDirection: 'row' }}>
            <Button
              label={isUpdating ? 'Accepting...' : 'Accept'}
              onPress={() => handleUpdateStatus(item.id, 'approved')}
              disabled={isUpdating}
              variant="primary"
              size="md"
              style={{ flex: 1 }}
            />
            <Button
              label={isUpdating ? 'Rejecting...' : 'Reject'}
              onPress={() => handleUpdateStatus(item.id, 'rejected')}
              disabled={isUpdating}
              variant="ghost"
              size="md"
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Status Message (After Decision) */}
        {isDecided && (
          <View
            style={{
              padding: Spacing.md,
              backgroundColor:
                item.status === 'approved' || item.status === 'confirmed'
                  ? Colors.primary
                  : Colors.category.coral.text,
              borderRadius: BorderRadius.md,
              alignItems: 'center',
            }}
          >
            <ThemedText
              style={{
                color: Colors.cardBg,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {item.status === 'confirmed'
                ? '✓ Auto-confirmed'
                : item.status === 'approved'
                  ? '✓ Manually approved'
                  : '✗ Application rejected'}
            </ThemedText>
          </View>
        )}
      </Card>
    );
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  const renderEmptyState = () => (
    <EmptyState
      icon="📬"
      title="No applications yet"
      description="When volunteers apply to this opportunity, they'll appear here."
    />
  );

  if (loading) {
    return (
      <Screen padding="lg" scrollable>
        <View style={{ gap: Spacing.lg }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (error || !opportunity) {
    return (
      <Screen padding="lg">
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: Spacing.lg }}
        >
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
          Error
        </ThemedText>
        <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.xl }}>
          {error || 'Could not load opportunity'}
        </ThemedText>
        <Button label="Go Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  // Use volunteer count from view (source of truth)
  const volunteersCount = opportunityStats?.volunteers_count || 0;
  const targetVolunteers = opportunity?.target_volunteers || 0;
  const spotsLeft = Math.max(0, targetVolunteers - volunteersCount);

  return (
    <Screen scrollable padding="lg">
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: Spacing.xl,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: Spacing.md }}
        >
          <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
            ←
          </ThemedText>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <ThemedText
            type="h3"
            style={{
              marginBottom: Spacing.xs,
              color: Colors.textPrimary,
            }}
          >
            {opportunity.title}
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
            Applications
          </ThemedText>
        </View>
      </View>

      {/* Opportunity Stats */}
      <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: Spacing.lg,
          }}
        >
          <View>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.xs,
              }}
            >
              TOTAL APPLICATIONS
            </ThemedText>
            <ThemedText
              type="h2"
              style={{
                color: Colors.textPrimary,
              }}
            >
              {applications.length}
            </ThemedText>
          </View>

          <View>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.xs,
              }}
            >
              SPOTS FILLED
            </ThemedText>
            <ThemedText
              type="h2"
              style={{
                color: Colors.textPrimary,
              }}
            >
              {volunteersCount}/{targetVolunteers}
            </ThemedText>
          </View>

          <View>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 12,
                marginBottom: Spacing.xs,
              }}
            >
              PENDING
            </ThemedText>
            <ThemedText
              type="h2"
              style={{
                color: Colors.textPrimary,
              }}
            >
              {applications.filter((a) => a.status === 'pending').length}
            </ThemedText>
          </View>
        </View>
      </Card>

      {/* Applications List */}
      {applications.length > 0 ? (
        <FlatList
          data={applications}
          renderItem={renderApplicationCard}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        />
      ) : (
        renderEmptyState()
      )}
    </Screen>
  );
}
