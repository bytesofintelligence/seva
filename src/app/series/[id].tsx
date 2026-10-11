import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { Screen, Card, Button } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// occurrence_date is a plain DATE column with no time component. Parsing it
// as `new Date(occurrence_date)` reads it as UTC midnight, which then
// renders as the *previous* calendar day once formatted in a timezone
// behind UTC (e.g. a Friday occurrence showing as "Thursday"). Anchoring to
// local midnight via the `T00:00:00` suffix avoids that shift.
const parseDateOnly = (dateString: string) => new Date(`${dateString}T00:00:00`);

const isPastOccurrence = (occ: { starts_at: string | null }) =>
  !!occ.starts_at && new Date(occ.starts_at) <= new Date();

interface SeriesRow {
  id: string;
  title: string;
  recurrence_type: 'weekly' | 'daily';
  recurrence_day_of_week: number;
  template_time: string;
  generate_weeks_ahead: number;
}

interface OccurrenceRow {
  id: string;
  occurrence_date: string | null;
  starts_at: string | null;
  status: string;
  volunteers_count: number;
}

const statusBadge: Record<string, { bg: string; text: string; label: string; dimmed?: boolean }> = {
  active: { bg: Colors.category.teal.bg, text: Colors.category.teal.text, label: 'Active' },
  cancelled: { bg: Colors.category.coral.bg, text: Colors.category.coral.text, label: 'Cancelled', dimmed: true },
  completed: { bg: Colors.surfaceMuted, text: Colors.textSecondary, label: 'Completed' },
};

export default function SeriesManagementScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [series, setSeries] = useState<SeriesRow | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: seriesData } = await supabase
      .from('opportunity_series')
      .select('id, title, recurrence_type, recurrence_day_of_week, template_time, generate_weeks_ahead')
      .eq('id', id)
      .single();

    setSeries(seriesData);

    const { data: occData } = await supabase
      .from('opportunities')
      .select('id, occurrence_date, starts_at, status')
      .eq('series_id', id)
      .order('occurrence_date', { ascending: true });

    if (occData && occData.length > 0) {
      const { data: counts } = await supabase
        .from('opportunity_volunteer_counts')
        .select('id, volunteers_count')
        .in('id', occData.map((o) => o.id));

      const countMap = new Map((counts || []).map((c) => [c.id, c.volunteers_count]));
      setOccurrences(
        occData.map((o) => ({ ...o, volunteers_count: countMap.get(o.id) || 0 }))
      );
    } else {
      setOccurrences([]);
    }

    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleCancelWeek = (occ: OccurrenceRow) => {
    const dateLabel = occ.occurrence_date
      ? parseDateOnly(occ.occurrence_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'this occurrence';

    Alert.alert(
      `Cancel ${dateLabel}?`,
      'Volunteers who have signed up will have their application cancelled.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel occurrence',
          style: 'destructive',
          onPress: async () => {
            // Triggers trg_cascade_opportunity_cancellation, which cascades
            // this cancellation to applications. A future notifications pass
            // should read those cascaded cancellations and alert volunteers.
            const { error } = await supabase
              .from('opportunities')
              .update({ status: 'cancelled' })
              .eq('id', occ.id);

            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            fetchData();
          },
        },
      ]
    );
  };

  const handleGenerateMore = async () => {
    if (!series) return;
    setGenerating(true);
    try {
      const lastDate = occurrences.length > 0 ? occurrences[occurrences.length - 1].occurrence_date : null;
      const fromDate = lastDate
        ? new Date(new Date(lastDate).getTime() + 24 * 60 * 60 * 1000)
        : new Date();
      const fromDateString = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(
        fromDate.getDate()
      ).padStart(2, '0')}`;

      const { data: count, error } = await supabase.rpc('generate_series_occurrences', {
        p_series_id: series.id,
        p_from_date: fromDateString,
        p_weeks: 4,
      });

      if (error) throw error;

      Alert.alert('Success', `${count ?? 0} new occurrence(s) generated.`);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate more dates');
    } finally {
      setGenerating(false);
    }
  };

  const recurrenceLabel = series
    ? series.recurrence_type === 'weekly'
      ? `Every ${DAY_NAMES[series.recurrence_day_of_week]} at ${series.template_time.slice(0, 5)}`
      : `Every day at ${series.template_time.slice(0, 5)}`
    : '';

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!series) {
    return (
      <Screen>
        <Text style={[Typography.body, { color: Colors.textSecondary }]}>Series not found.</Text>
      </Screen>
    );
  }

  const upcomingOccurrences = occurrences
    .filter((o) => !isPastOccurrence(o))
    .sort((a, b) => {
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
      return aTime - bTime;
    });
  const pastOccurrences = occurrences
    .filter((o) => isPastOccurrence(o))
    .sort((a, b) => new Date(b.starts_at!).getTime() - new Date(a.starts_at!).getTime());

  const renderOccurrenceCard = ({ item }: { item: OccurrenceRow }) => {
    const badge = statusBadge[item.status] || { bg: Colors.surfaceMuted, text: Colors.textSecondary, label: item.status };
    const dateLabel = item.occurrence_date
      ? parseDateOnly(item.occurrence_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : item.starts_at
      ? new Date(item.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Europe/London' })
      : 'No date';

    return (
      <Card padding="md" style={{ marginBottom: Spacing.md, opacity: badge.dimmed ? 0.6 : 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
          <Text style={[Typography.cardTitle, { color: Colors.textPrimary }]}>{dateLabel}</Text>
          <View
            style={{
              backgroundColor: badge.bg,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.xs,
              borderRadius: BorderRadius.pill,
            }}
          >
            <Text style={[Typography.badge, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push({ pathname: '/opportunity/[id]/applications', params: { id: item.id } })}
        >
          <Text style={[Typography.meta, { color: Colors.primary, fontWeight: '600', marginBottom: Spacing.md }]}>
            {item.volunteers_count} volunteer{item.volunteers_count === 1 ? '' : 's'} signed up →
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: Spacing.lg, flexWrap: 'wrap' }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/opportunity/[id]/applications', params: { id: item.id } })}
          >
            <Text style={[Typography.body, { color: Colors.primary, fontWeight: '600' }]}>View volunteers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/edit-opportunity/[id]', params: { id: item.id } })}
          >
            <Text style={[Typography.body, { color: Colors.primary, fontWeight: '600' }]}>Edit this week</Text>
          </TouchableOpacity>
          {item.status === 'active' && (
            <TouchableOpacity onPress={() => handleCancelWeek(item)}>
              <Text style={[Typography.body, { color: Colors.semantic.error, fontWeight: '600' }]}>
                Cancel this week
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  return (
    <Screen scrollable>
      {/* Header with back button */}
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: Spacing.lg }}>
        <Text style={{ color: Colors.primary, fontSize: 16 }}>← Back</Text>
      </TouchableOpacity>

      <Text style={[Typography.screenTitle, { color: Colors.textPrimary, marginBottom: Spacing.xs }]}>
        {series.title}
      </Text>
      <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.lg }]}>
        {recurrenceLabel}
      </Text>

      <Button
        label="Edit series template"
        onPress={() => router.push({ pathname: '/edit-series/[id]', params: { id: series.id } })}
        variant="ghost"
      />

      {/* Upcoming occurrences: shown first so a past Friday never sits above
          what's coming next. */}
      <View style={{ marginTop: Spacing.xl, gap: Spacing.md }}>
        <Text style={[Typography.meta, { color: Colors.textSecondary }]}>UPCOMING OCCURRENCES</Text>

        <FlatList
          data={upcomingOccurrences}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={renderOccurrenceCard}
        />

        <Button
          label={generating ? 'Generating…' : 'Generate more dates'}
          onPress={handleGenerateMore}
          variant="ghost"
        />
      </View>

      {/* Past occurrences: kept below, same view-volunteers/edit actions. */}
      {pastOccurrences.length > 0 && (
        <View style={{ marginTop: Spacing.xl, gap: Spacing.md }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary }]}>PAST OCCURRENCES</Text>

          <FlatList
            data={pastOccurrences}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={renderOccurrenceCard}
          />
        </View>
      )}
    </Screen>
  );
}
