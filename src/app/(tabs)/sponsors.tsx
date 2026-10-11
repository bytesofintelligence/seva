import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, AlertTriangle } from 'lucide-react-native';

import { Screen, Card, Button, SkeletonCard } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography, Layout } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { SponsorshipItemModal } from '@/components/SponsorshipItemModal';
import {
  SPONSORSHIP_ITEM_STATUS_LABEL,
  colorForItemStatus,
  colorForCategory,
} from '@/constants/sponsorship-categories';
import { SponsorshipItemStatus } from '@/types/sponsorship';
import { withRoleGuard } from '@/components/auth/RoleGate';

interface SponsorshipItemRow {
  id: string;
  title: string;
  quantity_needed: number;
  unit_label: string;
  total_cost: number;
  period_start: string;
  period_end: string;
  status: SponsorshipItemStatus;
  category: string;
  description: string | null;
  charity_id: string;
  quantity_pledged: number;
  amount_pledged: number;
  amount_received: number;
  quantity_remaining: number;
}

function isCurrentPeriod(periodEnd: string): boolean {
  const todayStr = new Date().toISOString().split('T')[0];
  return periodEnd >= todayStr;
}

function SponsorsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [charityId, setCharityId] = useState<string | null>(null);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [items, setItems] = useState<SponsorshipItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.user.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fold in any pledges that have gone stale before we read counts.
      await supabase.rpc('expire_stale_pledges');

      const { data: charity, error: charityError } = await supabase
        .from('charities')
        .select('id, bank_account_name, bank_sort_code, bank_account_number')
        .eq('owner_id', session.user.id)
        .single();

      if (charityError) throw charityError;

      setCharityId(charity.id);
      setBankDetailsMissing(
        !charity.bank_account_name || !charity.bank_sort_code || !charity.bank_account_number
      );

      const { data: itemsData, error: itemsError } = await supabase
        .from('sponsorship_items')
        .select('*')
        .eq('charity_id', charity.id)
        .order('period_start', { ascending: false });

      if (itemsError) throw itemsError;

      const { data: progressData, error: progressError } = await supabase
        .from('sponsorship_item_progress')
        .select('*')
        .eq('charity_id', charity.id);

      if (progressError) throw progressError;

      const progressById = new Map((progressData || []).map((p) => [p.item_id, p]));

      const merged: SponsorshipItemRow[] = (itemsData || []).map((it) => {
        const progress = progressById.get(it.id);
        return {
          ...it,
          quantity_pledged: progress?.quantity_pledged ?? 0,
          amount_pledged: progress?.amount_pledged ?? 0,
          amount_received: progress?.amount_received ?? 0,
          quantity_remaining: progress?.quantity_remaining ?? it.quantity_needed,
        };
      });

      setItems(merged);
    } catch (err: any) {
      console.error('Error loading sponsorship items:', err);
      setError(err?.message || 'Failed to load sponsorship items');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const activeItems = items.filter((i) => isCurrentPeriod(i.period_end));
  const pastItems = items.filter((i) => !isCurrentPeriod(i.period_end));

  const summary = activeItems.reduce(
    (acc, i) => ({
      needed: acc.needed + i.total_cost,
      pledged: acc.pledged + i.amount_pledged,
      received: acc.received + i.amount_received,
    }),
    { needed: 0, pledged: 0, received: 0 }
  );

  const renderItemCard = (item: SponsorshipItemRow) => {
    const progressPct =
      item.quantity_needed > 0
        ? Math.min(1, item.quantity_pledged / item.quantity_needed)
        : 0;
    const catColor = colorForCategory(item.category);
    const barColor = Colors.category[catColor].text;

    // A "past" item still carries whatever status it last had (open,
    // fully_pledged) unless the charity explicitly closed/fulfilled it — the
    // badge should reflect that its period has lapsed rather than show a
    // stale "Open"/"Fully pledged" label.
    const isLapsed =
      !isCurrentPeriod(item.period_end) && (item.status === 'open' || item.status === 'fully_pledged');
    const statusLabel = isLapsed ? 'Past' : SPONSORSHIP_ITEM_STATUS_LABEL[item.status];
    const statusColor = isLapsed ? 'coral' : colorForItemStatus(item.status);
    const statusPair = Colors.category[statusColor];

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => router.push(`/sponsorship-item/${item.id}` as any)}
        activeOpacity={0.8}
        style={{ marginBottom: Layout.cardGap }}
      >
        <Card padding="md">
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: Spacing.sm,
            }}
          >
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={[Typography.cardTitle, { color: Colors.textPrimary }]}>
                {item.title}
              </Text>
              <Text style={[Typography.meta, { color: Colors.textSecondary, marginTop: 2 }]}>
                {item.quantity_needed} {item.unit_label}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: statusPair.bg,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: BorderRadius.pill,
              }}
            >
              <Text style={[Typography.badge, { color: statusPair.text }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View
            style={{
              height: 8,
              borderRadius: BorderRadius.pill,
              backgroundColor: Colors.ringTrack,
              overflow: 'hidden',
              marginBottom: Spacing.sm,
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progressPct * 100}%`,
                backgroundColor: barColor,
                borderRadius: BorderRadius.pill,
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              £{item.amount_pledged.toFixed(2)} of £{item.total_cost.toFixed(2)} raised
            </Text>
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              {item.quantity_remaining} {item.unit_label} left
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <Screen scrollable>
        <View style={{ marginTop: Spacing.md }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <View style={{ marginBottom: Spacing.lg, marginTop: Spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[Typography.screenTitle, { color: Colors.textPrimary }]}>
              Sponsorship
            </Text>
            <Text style={[Typography.body, { color: Colors.textSecondary, marginTop: 2 }]}>
              What your kitchen needs this week
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            style={{
              backgroundColor: Colors.primary,
              borderRadius: BorderRadius.pill,
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={22} color={Colors.cardBg} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {bankDetailsMissing && items.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/edit-profile-charity')}
          activeOpacity={0.8}
          style={{ marginBottom: Spacing.lg }}
        >
          <Card padding="md" backgroundColor={Colors.category.amber.bg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <AlertTriangle size={20} color={Colors.category.amber.text} strokeWidth={1.5} />
              <Text style={[Typography.body, { color: Colors.category.amber.text, flex: 1 }]}>
                Add your bank details in Org so volunteers can pay
              </Text>
            </View>
          </Card>
        </TouchableOpacity>
      )}

      {/* Summary strip */}
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl }}>
        {[
          { label: 'NEEDED', value: summary.needed },
          { label: 'PLEDGED', value: summary.pledged },
          { label: 'RECEIVED', value: summary.received },
        ].map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.sm,
              padding: Spacing.md,
            }}
          >
            <Text style={[Typography.statLabel, { color: Colors.textSecondary, marginBottom: Spacing.xs }]}>
              {s.label}
            </Text>
            <Text style={[Typography.statNumber, { color: Colors.textPrimary }]}>
              £{s.value.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {error && (
        <View
          style={{
            backgroundColor: Colors.category.coral.bg,
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            marginBottom: Spacing.lg,
          }}
        >
          <Text style={{ color: Colors.category.coral.text, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {activeItems.length > 0 && (
        <View style={{ marginBottom: Spacing.lg }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            THIS PERIOD
          </Text>
          <FlatList
            data={activeItems}
            renderItem={({ item }) => renderItemCard(item)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        </View>
      )}

      {pastItems.length > 0 && (
        <View style={{ marginBottom: Spacing.lg }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            PAST
          </Text>
          <FlatList
            data={pastItems}
            renderItem={({ item }) => renderItemCard(item)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        </View>
      )}

      {items.length === 0 && !error && (
        <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
          <Text style={[Typography.body, { color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg }]}>
            No sponsorship items yet. Post what your kitchen needs this week and let volunteers pledge toward it.
          </Text>
          <Button label="+ New item" onPress={() => setShowCreateModal(true)} variant="primary" />
        </View>
      )}

      {charityId && (
        <SponsorshipItemModal
          visible={showCreateModal}
          charityId={charityId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}
    </Screen>
  );
}

// Coordinator-only route. RLS in Postgres is the real boundary; this stops
// the screen rendering at all for a volunteer who reaches it by deep link.
export default withRoleGuard(SponsorsScreen, 'charity');
