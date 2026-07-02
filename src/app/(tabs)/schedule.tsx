import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, SectionList, ScrollView, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Screen, Card, Button } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import {
  ApplicationStatus,
  ACTIVE_STATUSES,
  PAST_STATUSES,
} from '@/types/status';

interface Application {
  id: string;
  status: ApplicationStatus;
  applied_at: string;
  party_size: number;
  opportunities: {
    id: string;
    title: string;
    starts_at: string | null;
    charities: {
      name: string;
    } | null;
  } | null;
}

interface ApplicationGroup {
  title: string;
  data: Application[];
}

// Status colors for all 7 canonical statuses
const STATUS_COLORS: Record<ApplicationStatus, { bg: string; text: string }> = {
  // Awaiting review
  pending: { bg: '#DBEAFE', text: '#0284C7' },
  // Confirmed/Committed (actively coming)
  confirmed: { bg: '#DCFCE7', text: '#16A34A' },
  approved: { bg: '#DCFCE7', text: '#16A34A' },
  // In action
  in_progress: { bg: '#FEF3C7', text: '#D97706' },
  // Completed
  completed: { bg: '#DCFCE7', text: '#16A34A' },
  // Not happening
  rejected: { bg: '#FEE2E2', text: '#DC2626' },
  cancelled: { bg: '#F3F4F6', text: '#6B7280' },
};

export default function ScheduleScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editPartySize, setEditPartySize] = useState(1);

  const fetchApplications = useCallback(async () => {
    if (!session?.user.id) return;

    setLoading(true);
    setError(null);
    try {
      // Join query: applications with opportunity details
      const { data, error: supabaseError } = await supabase
        .from('applications')
        .select(
          `
          id,
          status,
          applied_at,
          party_size,
          opportunities(
            id,
            title,
            starts_at,
            charities(name)
          )
        `
        )
        .eq('volunteer_id', session.user.id)
        .order('applied_at', { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }

      setAllApplications(data || []);
    } catch (err: any) {
      console.error('Error fetching applications:', err);
      setError(err?.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchApplications();
    }, [fetchApplications])
  );

  // Group applications into Upcoming and Past
  const groupedApplications = useMemo(() => {
    const upcoming = allApplications.filter((app) =>
      ACTIVE_STATUSES.includes(app.status)
    );
    const past = allApplications.filter((app) =>
      PAST_STATUSES.includes(app.status)
    );

    const groups: ApplicationGroup[] = [];

    if (upcoming.length > 0) {
      groups.push({
        title: 'Upcoming',
        data: upcoming,
      });
    }

    if (past.length > 0) {
      groups.push({
        title: 'Past',
        data: past,
      });
    }

    return groups;
  }, [allApplications]);

  // Filter based on active tab
  const filteredGroups = useMemo(() => {
    if (activeTab === 'upcoming') {
      return groupedApplications.filter((g) => g.title === 'Upcoming');
    }
    return groupedApplications.filter((g) => g.title === 'Past');
  }, [groupedApplications, activeTab]);

  const handleWithdraw = async (appId: string) => {
    try {
      await haptics.medium();
      const { error } = await supabase
        .from('applications')
        .update({ status: 'cancelled' })
        .eq('id', appId)
        .eq('volunteer_id', session?.user.id);

      if (error) throw error;

      await haptics.success();
      fetchApplications();
    } catch (err: any) {
      console.error('Error withdrawing application:', err);
      await haptics.warning();
      Alert.alert('Error', 'Failed to withdraw application');
    }
  };

  const handleEditSave = async (appId: string, newPartySize: number) => {
    try {
      await haptics.medium();
      const { error } = await supabase
        .from('applications')
        .update({ party_size: newPartySize })
        .eq('id', appId)
        .eq('volunteer_id', session?.user.id);

      if (error) throw error;

      await haptics.success();
      fetchApplications();
      setEditingAppId(null);
    } catch (err: any) {
      console.error('Error updating application:', err);
      await haptics.warning();
      Alert.alert('Error', 'Failed to update application');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Date TBD';
    try {
      const date = new Date(dateString);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Check if date is today
      if (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      ) {
        return 'Today';
      }

      // Check if date is tomorrow
      if (
        date.getFullYear() === tomorrow.getFullYear() &&
        date.getMonth() === tomorrow.getMonth() &&
        date.getDate() === tomorrow.getDate()
      ) {
        return 'Tomorrow';
      }

      // Otherwise show full date
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
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
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const getStatusLabel = (status: string) => {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const renderApplicationRow = ({ item }: { item: Application }) => {
    const opp = item.opportunities;
    const statusColors = STATUS_COLORS[item.status];

    if (!opp) {
      return (
        <Card shadow="sm" padding="lg" style={{ marginBottom: Spacing.md }}>
          <ThemedText style={{ color: Colors.textSecondary }}>
            Opportunity no longer available
          </ThemedText>
        </Card>
      );
    }

    const canEdit = ['pending', 'confirmed', 'approved'].includes(item.status);
    const canWithdraw = ['pending', 'confirmed', 'approved'].includes(item.status);

    return (
      <View style={{ marginBottom: Spacing.md }}>
        <TouchableOpacity
          onPress={() => router.push(`/opportunity/${opp.id}`)}
          activeOpacity={0.7}
        >
          <Card shadow="sm" padding="lg">
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: Spacing.md,
              }}
            >
              {/* Title and Details */}
              <View style={{ flex: 1, marginRight: Spacing.md }}>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 16,
                    fontWeight: '600',
                    marginBottom: Spacing.xs,
                  }}
                >
                  {opp.title}
                </ThemedText>
                <ThemedText
                  style={{
                    color: Colors.textSecondary,
                    fontSize: 13,
                    marginBottom: Spacing.xs,
                  }}
                >
                  {opp.charities?.name || 'Unknown Charity'}
                </ThemedText>
                <ThemedText
                  style={{
                    color: Colors.textSecondary,
                    fontSize: 12,
                  }}
                >
                  {formatDate(opp.starts_at)}{formatTime(opp.starts_at) ? ` at ${formatTime(opp.starts_at)}` : ''}
                </ThemedText>
              </View>

              {/* Status Badge */}
              <View
                style={{
                  backgroundColor: statusColors?.bg || Colors.surfaceMuted,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: BorderRadius.full,
                }}
              >
                <ThemedText
                  style={{
                    color: statusColors?.text || Colors.textSecondary,
                    fontSize: 11,
                    fontWeight: '600',
                  }}
                >
                  {getStatusLabel(item.status)}
                </ThemedText>
              </View>
            </View>

            {/* Party Size Info */}
            <View
              style={{
                backgroundColor: Colors.surfaceMuted,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                borderRadius: BorderRadius.md,
                marginBottom: Spacing.md,
              }}
            >
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                }}
              >
                👥 {item.party_size} {item.party_size === 1 ? 'person' : 'people'}
              </ThemedText>
            </View>

            {/* Action Buttons */}
            {(canEdit || canWithdraw) && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: Spacing.sm,
                }}
              >
                {canEdit && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingAppId(item.id);
                      setEditPartySize(item.party_size);
                    }}
                    style={{
                      flex: 1,
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.sm,
                      backgroundColor: Colors.primaryTintBg,
                      borderRadius: BorderRadius.md,
                      alignItems: 'center',
                    }}
                  >
                    <ThemedText
                      style={{
                        color: Colors.primary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      Edit
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {canWithdraw && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Withdraw from opportunity?',
                        'Are you sure you want to withdraw from this opportunity?',
                        [
                          { text: 'Cancel', onPress: () => {}, style: 'cancel' },
                          {
                            text: 'Withdraw',
                            onPress: () => handleWithdraw(item.id),
                            style: 'destructive',
                          },
                        ]
                      );
                    }}
                    style={{
                      flex: 1,
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.sm,
                      backgroundColor: Colors.category.coral.text,
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
                      Withdraw
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Card>
        </TouchableOpacity>

        {/* Edit Modal */}
        {editingAppId === item.id && (
          <Card shadow="md" padding="lg" style={{ marginTop: Spacing.md }}>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 14,
                fontWeight: '600',
                marginBottom: Spacing.md,
              }}
            >
              How many people are attending?
            </ThemedText>

            {/* Party Size Controls */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.md,
                marginBottom: Spacing.lg,
              }}
            >
              <TouchableOpacity
                onPress={() => setEditPartySize(Math.max(1, editPartySize - 1))}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: BorderRadius.md,
                  backgroundColor: Colors.surfaceMuted,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ThemedText style={{ fontSize: 18, fontWeight: '600' }}>−</ThemedText>
              </TouchableOpacity>

              <ThemedText
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: '700',
                  color: Colors.primary,
                }}
              >
                {editPartySize}
              </ThemedText>

              <TouchableOpacity
                onPress={() => setEditPartySize(Math.min(20, editPartySize + 1))}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: BorderRadius.md,
                  backgroundColor: Colors.surfaceMuted,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ThemedText style={{ fontSize: 18, fontWeight: '600' }}>+</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <TouchableOpacity
                onPress={() => setEditingAppId(null)}
                style={{
                  flex: 1,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.sm,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  alignItems: 'center',
                }}
              >
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  Cancel
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleEditSave(item.id, editPartySize)}
                style={{
                  flex: 1,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.sm,
                  backgroundColor: Colors.primary,
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
                  Save
                </ThemedText>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section: { title } }: { section: ApplicationGroup }) => (
    <View style={{ marginVertical: Spacing.lg, marginBottom: Spacing.md }}>
      <ThemedText
        type="h3"
        style={{
          color: Colors.textPrimary,
        }}
      >
        {title}
      </ThemedText>
    </View>
  );

  const renderEmptyState = () => (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xxl,
      }}
    >
      <ThemedText
        type="h2"
        style={{
          marginBottom: Spacing.md,
          color: Colors.textPrimary,
        }}
      >
        {activeTab === 'upcoming'
          ? 'No upcoming applications'
          : 'No past applications'}
      </ThemedText>
      <ThemedText
        style={{
          textAlign: 'center',
          color: Colors.textSecondary,
          marginBottom: Spacing.xl,
        }}
      >
        {activeTab === 'upcoming'
          ? 'Apply to opportunities to see them here'
          : 'Your past applications will appear here'}
      </ThemedText>
      <Button
        label="Browse Opportunities"
        onPress={() => router.push('/(tabs)')}
        variant="primary"
        size="md"
      />
    </View>
  );

  return (
    <Screen scrollable={false} padding="lg">
      {/* Header */}
      <ThemedText type="h1" style={{ marginBottom: Spacing.lg, color: Colors.textPrimary }}>
        Schedule
      </ThemedText>

      {error && (
        <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.lg }}>
          <ThemedText style={{ color: Colors.category.coral.text, marginBottom: Spacing.md }}>
            {error}
          </ThemedText>
          <Button label="Retry" onPress={fetchApplications} size="sm" />
        </Card>
      )}

      {/* Tab Buttons */}
      <View
        style={{
          flexDirection: 'row',
          gap: Spacing.md,
          marginBottom: Spacing.lg,
        }}
      >
        <TouchableOpacity
          onPress={() => setActiveTab('upcoming')}
          style={{
            flex: 1,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.md,
            backgroundColor:
              activeTab === 'upcoming'
                ? Colors.primary
                : Colors.surfaceMuted,
          }}
        >
          <ThemedText
            style={{
              textAlign: 'center',
              color:
                activeTab === 'upcoming'
                  ? Colors.cardBg
                  : Colors.textPrimary,
              fontWeight: '600',
            }}
          >
            Upcoming
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('past')}
          style={{
            flex: 1,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.md,
            backgroundColor:
              activeTab === 'past'
                ? Colors.primary
                : Colors.surfaceMuted,
          }}
        >
          <ThemedText
            style={{
              textAlign: 'center',
              color:
                activeTab === 'past'
                  ? Colors.cardBg
                  : Colors.textPrimary,
              fontWeight: '600',
            }}
          >
            Past
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Applications List */}
      {loading ? (
        <View style={{ gap: Spacing.lg, flex: 1 }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} shadow="sm" padding="lg">
              <View
                style={{
                  height: 16,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  marginBottom: Spacing.md,
                }}
              />
              <View
                style={{
                  height: 12,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  width: '70%',
                  marginBottom: Spacing.sm,
                }}
              />
              <View
                style={{
                  height: 12,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  width: '50%',
                }}
              />
            </Card>
          ))}
        </View>
      ) : filteredGroups.length > 0 && filteredGroups[0].data.length > 0 ? (
        <SectionList
          sections={filteredGroups}
          keyExtractor={(item) => item.id}
          renderItem={renderApplicationRow}
          renderSectionHeader={renderSectionHeader}
          scrollEnabled={true}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        />
      ) : (
        renderEmptyState()
      )}
    </Screen>
  );
}
