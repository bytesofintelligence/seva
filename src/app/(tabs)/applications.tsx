import { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { Screen, Card, Button, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

interface Application {
  id: string;
  status: string;
  cover_letter: string | null;
  applied_at: string;
  opportunities: {
    id: string;
    title: string;
    location: string;
    charities: {
      name: string;
    } | null;
  } | null;
}

const STATUS_COLORS: Record<string, 'teal' | 'coral' | 'blue' | 'purple' | 'amber'> = {
  pending: 'blue',
  confirmed: 'teal',
  approved: 'teal',
  in_progress: 'purple',
  completed: 'teal',
  rejected: 'coral',
  cancelled: 'amber',
};

export default function ApplicationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    if (!session?.user.id) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('applications')
        .select(
          `
          id,
          status,
          cover_letter,
          applied_at,
          opportunities(
            id,
            title,
            location,
            charities(name)
          )
        `
        )
        .eq('volunteer_id', session.user.id)
        .order('applied_at', { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }

      setApplications(data || []);
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Date unknown';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const renderApplicationCard = ({ item }: { item: Application }) => {
    const opp = item.opportunities;
    const statusColor = STATUS_COLORS[item.status] || 'blue';

    if (!opp) {
      return (
        <Card shadow="md" padding="lg">
          <ThemedText style={{ color: Colors.textSecondary }}>
            Opportunity no longer available
          </ThemedText>
        </Card>
      );
    }

    return (
      <TouchableOpacity onPress={() => router.push(`/opportunity/${opp.id}`)}>
        <Card shadow="md" padding="lg">
          {/* Status Tag */}
          <View style={{ marginBottom: Spacing.md }}>
            <Tag label={getStatusLabel(item.status)} color={statusColor} />
          </View>

          {/* Opportunity Title */}
          <ThemedText
            type="h3"
            style={{
              marginBottom: Spacing.sm,
              color: Colors.textPrimary,
            }}
          >
            {opp.title}
          </ThemedText>

          {/* Charity and Location */}
          <ThemedText
            style={{
              marginBottom: Spacing.sm,
              color: Colors.textSecondary,
              fontSize: 14,
            }}
          >
            {opp.charities?.name || 'Unknown Charity'}
          </ThemedText>

          <ThemedText
            style={{
              marginBottom: Spacing.md,
              color: Colors.textSecondary,
              fontSize: 12,
            }}
          >
            📍 {opp.location}
          </ThemedText>

          {/* Cover Letter Preview */}
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
                  marginBottom: Spacing.xs,
                }}
              >
                YOUR MESSAGE
              </ThemedText>
              <ThemedText
                numberOfLines={2}
                style={{
                  color: Colors.textPrimary,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {item.cover_letter}
              </ThemedText>
            </View>
          )}

          {/* Applied Date */}
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              textAlign: 'right',
            }}
          >
            Applied {formatDate(item.applied_at)}
          </ThemedText>
        </Card>
      </TouchableOpacity>
    );
  };

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
        No applications yet
      </ThemedText>
      <ThemedText
        style={{
          textAlign: 'center',
          color: Colors.textSecondary,
          marginBottom: Spacing.xl,
        }}
      >
        Start applying to opportunities to see your applications here.
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
    <Screen scrollable padding="lg">
      {/* Header */}
      <ThemedText type="h1" style={{ marginBottom: Spacing.xl, color: Colors.textPrimary }}>
        My Applications
      </ThemedText>

      {error && (
        <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.lg }}>
          <ThemedText style={{ color: Colors.category.coral.text, marginBottom: Spacing.md }}>
            {error}
          </ThemedText>
          <Button label="Retry" onPress={fetchApplications} size="sm" />
        </Card>
      )}

      {/* Applications List */}
      {loading ? (
        <View style={{ gap: Spacing.lg }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} shadow="md" padding="lg">
              <View
                style={{
                  height: 20,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  marginBottom: Spacing.md,
                }}
              />
              <View
                style={{
                  height: 24,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  marginBottom: Spacing.md,
                }}
              />
              <View
                style={{
                  height: 16,
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  width: '60%',
                }}
              />
            </Card>
          ))}
        </View>
      ) : applications.length > 0 ? (
        <FlatList
          data={applications}
          renderItem={renderApplicationCard}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: Spacing.lg, paddingBottom: Spacing.xxl }}
        />
      ) : (
        renderEmptyState()
      )}
    </Screen>
  );
}
