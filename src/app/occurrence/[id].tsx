import { useCallback, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { Screen, Button } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { FeaturedEventPanel } from '@/components/FeaturedEventPanel';
import { Spacing, Colors } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface OccurrenceDetail {
  id: string;
  title: string;
  location: string;
  starts_at: string | null;
  status: string;
  target_volunteers: number | null;
}

const formatDateLabel = (isoString: string) =>
  new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });

const formatTimeLabel = (isoString: string) =>
  new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });

export default function OccurrenceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [occurrence, setOccurrence] = useState<OccurrenceDetail | null>(null);
  const [counts, setCounts] = useState({ volunteers_count: 0, signups_count: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data } = await supabase
      .from('opportunities')
      .select('id, title, location, starts_at, status, target_volunteers')
      .eq('id', id)
      .single();

    setOccurrence(data);

    const { data: countData } = await supabase
      .from('opportunity_volunteer_counts')
      .select('volunteers_count, signups_count')
      .eq('id', id)
      .single();

    if (countData) setCounts(countData);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleCancel = () => {
    if (!occurrence) return;
    const dateLabel = occurrence.starts_at ? formatDateLabel(occurrence.starts_at) : 'this occurrence';

    Alert.alert(
      `Cancel ${dateLabel}?`,
      'Volunteers who have signed up will have their application cancelled.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel occurrence',
          style: 'destructive',
          onPress: async () => {
            // Triggers trg_cascade_opportunity_cancellation, which cascades this
            // cancellation to applications. A future notifications pass should
            // read those cascaded cancellations and alert affected volunteers.
            const { error } = await supabase
              .from('opportunities')
              .update({ status: 'cancelled' })
              .eq('id', occurrence.id);

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

  const handleReactivate = () => {
    if (!occurrence) return;

    Alert.alert(
      'Reactivate this occurrence?',
      'This makes the occurrence visible to volunteers again. It does not restore applications that were already cancelled — those volunteers would need to re-sign-up.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            const { error } = await supabase
              .from('opportunities')
              .update({ status: 'active' })
              .eq('id', occurrence.id);

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

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!occurrence) {
    return (
      <Screen>
        <ThemedText style={{ color: Colors.textSecondary }}>Occurrence not found.</ThemedText>
      </Screen>
    );
  }

  const dateLabel = occurrence.starts_at ? formatDateLabel(occurrence.starts_at) : 'Date TBD';
  const timeLabel = occurrence.starts_at ? formatTimeLabel(occurrence.starts_at) : '';

  return (
    <Screen scrollable>
      <FeaturedEventPanel
        eventName={`${occurrence.title} · ${dateLabel}`}
        date={dateLabel}
        time={timeLabel}
        location={occurrence.location}
        currentVolunteers={counts.volunteers_count}
        targetVolunteers={occurrence.target_volunteers || 0}
        signupCount={counts.signups_count}
      />

      <View style={{ gap: Spacing.md }}>
        <Button
          label="View volunteers"
          onPress={() => router.push({ pathname: '/opportunity/[id]/applications', params: { id: occurrence.id } })}
          variant="ghost"
        />
        {occurrence.status === 'active' && (
          <Button label="Cancel this occurrence" onPress={handleCancel} variant="danger" />
        )}
        {occurrence.status === 'cancelled' && (
          <Button label="Reactivate this occurrence" onPress={handleReactivate} variant="primary" />
        )}
      </View>
    </Screen>
  );
}
