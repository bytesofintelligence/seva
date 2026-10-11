import { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, Pressable, ActivityIndicator, FlatList } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface DateSelectionSheetProps {
  visible: boolean;
  seriesId: string;
  seriesTitle: string;
  onClose: () => void;
  onSelectOccurrence: (occurrenceId: string) => void;
}

interface OccurrenceOption {
  id: string;
  starts_at: string;
  target_volunteers: number | null;
  max_volunteers: number | null;
  volunteers_count: number;
}

export function DateSelectionSheet({
  visible,
  seriesId,
  seriesTitle,
  onClose,
  onSelectOccurrence,
}: DateSelectionSheetProps) {
  const [loading, setLoading] = useState(true);
  const [occurrences, setOccurrences] = useState<OccurrenceOption[]>([]);

  useEffect(() => {
    if (!visible) return;

    const load = async () => {
      setLoading(true);

      // status = 'active' is explicit here even though the series may have
      // cancelled exception dates or a cancelled week: the cancellation
      // trigger (023_recurring_series.sql) only ever flips an opportunities
      // row's status and cascades to applications — it never deletes the
      // row. Filtering on status = 'active' means a cancelled week simply
      // never matches this query, so it never appears in the picker. There
      // is no separate "unavailable" state to render for it.
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, starts_at, target_volunteers, max_volunteers')
        .eq('series_id', seriesId)
        .eq('status', 'active')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(12);

      if (error || !data) {
        setOccurrences([]);
        setLoading(false);
        return;
      }

      const ids = data.map((o) => o.id);
      const { data: counts } = await supabase
        .from('opportunity_volunteer_counts')
        .select('id, volunteers_count')
        .in('id', ids);

      const countMap = new Map((counts || []).map((c) => [c.id, c.volunteers_count]));

      setOccurrences(
        data.map((o) => ({ ...o, volunteers_count: countMap.get(o.id) || 0 }))
      );
      setLoading(false);
    };

    load();
  }, [visible, seriesId]);

  const formatDayDate = (isoString: string) =>
    new Date(isoString).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/London',
    });

  const formatTime = (isoString: string) =>
    new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
    });

  const getCapacityInfo = (occ: OccurrenceOption) => {
    const target = occ.target_volunteers || 0;
    const max = occ.max_volunteers;

    if (max !== null && occ.volunteers_count >= max) {
      return { label: 'Full', color: Colors.textTertiary, tappable: false };
    }

    if (target > 0 && occ.volunteers_count >= target) {
      return { label: 'Target reached · still accepting', color: Colors.primary, tappable: true };
    }

    const spotsLeft = Math.max(0, target - occ.volunteers_count);
    const nearlyFull = target > 0 && (spotsLeft <= 2 || spotsLeft / target < 0.25);

    return {
      label: nearlyFull ? `Only ${spotsLeft} left` : `${spotsLeft} spots left`,
      color: nearlyFull ? Colors.category.amber.text : Colors.primary,
      tappable: true,
    };
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.cardBg,
            borderTopLeftRadius: BorderRadius.xxl,
            borderTopRightRadius: BorderRadius.xxl,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.xl,
            maxHeight: '75%',
          }}
        >
          <ThemedText
            style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: Spacing.xs }}
          >
            Choose your date
          </ThemedText>
          <ThemedText
            style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.lg }}
            numberOfLines={1}
          >
            {seriesTitle}
          </ThemedText>

          {loading ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : occurrences.length === 0 ? (
            <ThemedText style={{ color: Colors.textSecondary, paddingVertical: Spacing.xl, textAlign: 'center' }}>
              No upcoming dates available right now.
            </ThemedText>
          ) : (
            <FlatList
              data={occurrences}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const capacity = getCapacityInfo(item);
                const target = item.target_volunteers || 0;
                const fillRatio = target > 0 ? Math.min(1, item.volunteers_count / target) : 0;
                return (
                  <TouchableOpacity
                    disabled={!capacity.tappable}
                    onPress={() => onSelectOccurrence(item.id)}
                    style={{
                      paddingVertical: Spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border,
                      opacity: capacity.tappable ? 1 : 0.5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flex: 1, marginRight: Spacing.md }}>
                        <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                          {formatDayDate(item.starts_at)}
                        </ThemedText>
                        <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
                          {formatTime(item.starts_at)}
                        </ThemedText>
                      </View>
                      <ThemedText style={{ color: capacity.color, fontSize: 12, fontWeight: '600' }}>
                        {capacity.label}
                      </ThemedText>
                    </View>

                    {target > 0 && (
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: Colors.category.teal.bg,
                          overflow: 'hidden',
                          marginTop: Spacing.sm,
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${fillRatio * 100}%`,
                            borderRadius: 3,
                            backgroundColor: capacity.color,
                          }}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingVertical: Spacing.lg,
              marginTop: Spacing.lg,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.lg,
            }}
          >
            <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
              Close
            </ThemedText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
