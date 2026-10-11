import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Pencil } from 'lucide-react-native';

import { Screen, Card, Button } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { SponsorshipItemModal } from '@/components/SponsorshipItemModal';
import {
  SPONSORSHIP_ITEM_STATUS_LABEL,
  colorForItemStatus,
  colorForCategory,
} from '@/constants/sponsorship-categories';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { PledgeStatus, SponsorshipItemStatus } from '@/types/sponsorship';

interface ItemDetail {
  id: string;
  charity_id: string;
  title: string;
  description: string | null;
  quantity_needed: number;
  unit_label: string;
  total_cost: number;
  period_start: string;
  period_end: string;
  status: SponsorshipItemStatus;
  category: string;
}

interface Progress {
  quantity_pledged: number;
  quantity_received: number;
  amount_pledged: number;
  amount_received: number;
  quantity_remaining: number;
}

interface PledgeRow {
  id: string;
  quantity: number;
  amount: number;
  reference: string;
  status: PledgeStatus;
  gift_aid: boolean;
  created_at: string;
  volunteer: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

const PLEDGE_STATUS_LABEL: Record<PledgeStatus, string> = {
  pledged: 'Pledged',
  transfer_claimed: 'Transfer claimed',
  received: 'Received',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default function SponsorshipItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pledges, setPledges] = useState<PledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      await supabase.rpc('expire_stale_pledges');

      const { data: itemData, error: itemError } = await supabase
        .from('sponsorship_items')
        .select('*')
        .eq('id', id)
        .single();
      if (itemError) throw itemError;
      setItem(itemData);

      const { data: progressData, error: progressError } = await supabase
        .from('sponsorship_item_progress')
        .select('*')
        .eq('item_id', id)
        .single();
      if (progressError) throw progressError;
      setProgress(progressData);

      const { data: pledgesData, error: pledgesError } = await supabase
        .from('pledges')
        .select('id, quantity, amount, reference, status, gift_aid, created_at, volunteer:profiles!pledges_volunteer_id_fkey(id, full_name, avatar_url)')
        .eq('item_id', id)
        .order('created_at', { ascending: false });
      if (pledgesError) throw pledgesError;
      setPledges(((pledgesData as any) || []).map((p: any) => ({ ...p, volunteer: Array.isArray(p.volunteer) ? p.volunteer[0] : p.volunteer })));
    } catch (err: any) {
      console.error('Error loading sponsorship item:', err);
      setError(err?.message || 'Failed to load item');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const confirmReceived = (pledgeId: string) => {
    Alert.alert(
      'Confirm received',
      'Only confirm once the transfer shows in your bank account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoadingId(pledgeId);
            try {
              await haptics.medium();
              const { error: updateError } = await supabase
                .from('pledges')
                .update({ status: 'received' })
                .eq('id', pledgeId);
              if (updateError) throw updateError;
              await haptics.success();
              fetchData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to confirm receipt');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const cancelPledge = (pledgeId: string, pledgeStatus: string) => {
    Alert.alert(
      'Cancel pledge',
      pledgeStatus === 'transfer_claimed'
        ? 'The volunteer has marked this as transferred — they may have already sent the money. Only cancel if you\'ve checked your bank statement and the transfer isn\'t there. This cannot be undone.'
        : 'This will cancel the volunteer\'s pledge. This cannot be undone.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel pledge',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(pledgeId);
            try {
              await haptics.medium();
              const { error: updateError } = await supabase
                .from('pledges')
                .update({ status: 'cancelled' })
                .eq('id', pledgeId);
              if (updateError) throw updateError;
              await haptics.success();
              fetchData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel pledge');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const markFulfilled = () => {
    if (!item) return;
    Alert.alert(
      'Mark as fulfilled',
      'This confirms every pledge on this item has been received.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark fulfilled',
          onPress: async () => {
            try {
              await haptics.medium();
              const { error: rpcError } = await supabase.rpc('mark_item_fulfilled', {
                p_item_id: item.id,
              });
              if (rpcError) throw rpcError;
              await haptics.success();
              fetchData();
            } catch (err: any) {
              Alert.alert('Cannot mark fulfilled', err?.message || 'Something went wrong');
            }
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

  if (error || !item || !progress) {
    return (
      <Screen>
        <Text style={[Typography.screenTitle, { color: Colors.textPrimary, marginTop: Spacing.lg }]}>
          Something went wrong
        </Text>
        <Text style={[Typography.body, { color: Colors.textSecondary, marginVertical: Spacing.lg }]}>
          {error || 'Item not found'}
        </Text>
        <Button label="Try again" onPress={fetchData} variant="primary" />
      </Screen>
    );
  }

  const progressPct = item.quantity_needed > 0 ? Math.min(1, progress.quantity_pledged / item.quantity_needed) : 0;
  const catColor = colorForCategory(item.category);
  const barColor = Colors.category[catColor].text;
  const statusColor = colorForItemStatus(item.status);
  const statusPair = Colors.category[statusColor];
  const canMarkFulfilled =
    (item.status === 'open' || item.status === 'fully_pledged') &&
    progress.quantity_remaining <= 0 &&
    pledges.every((p) => ['received', 'cancelled', 'expired'].includes(p.status));

  return (
    <Screen scrollable>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: Spacing.md }}>
          <ArrowLeft size={22} color={Colors.textPrimary} strokeWidth={1.5} />
        </TouchableOpacity>
        <Text style={[Typography.screenTitle, { color: Colors.textPrimary, flex: 1 }]} numberOfLines={1}>
          {item.title}
        </Text>
        <TouchableOpacity onPress={() => setShowEditModal(true)}>
          <Pencil size={20} color={Colors.textTertiary} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <Card padding="lg">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md }}>
            <Text style={[Typography.body, { color: Colors.textSecondary, flex: 1 }]}>
              {item.quantity_needed} {item.unit_label} • {new Date(item.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(item.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
            <View style={{ backgroundColor: statusPair.bg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.pill }}>
              <Text style={[Typography.badge, { color: statusPair.text }]}>{SPONSORSHIP_ITEM_STATUS_LABEL[item.status]}</Text>
            </View>
          </View>

          {item.description && (
            <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
              {item.description}
            </Text>
          )}

          <View style={{ height: 8, borderRadius: BorderRadius.pill, backgroundColor: Colors.ringTrack, overflow: 'hidden', marginBottom: Spacing.sm }}>
            <View style={{ height: '100%', width: `${progressPct * 100}%`, backgroundColor: barColor, borderRadius: BorderRadius.pill }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs }}>
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              £{progress.amount_pledged.toFixed(2)} of £{item.total_cost.toFixed(2)} raised
            </Text>
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              {progress.quantity_remaining} {item.unit_label} left
            </Text>
          </View>
          <Text style={[Typography.meta, { color: Colors.textTertiary }]}>
            £{progress.amount_received.toFixed(2)} received so far
          </Text>
        </Card>
      </View>

      {canMarkFulfilled && (
        <View style={{ marginBottom: Spacing.lg }}>
          <Button label="Mark as fulfilled" onPress={markFulfilled} variant="primary" />
        </View>
      )}

      <View style={{ marginBottom: Spacing.lg }}>
        <Button
          label="Duplicate for next week"
          onPress={() => setShowDuplicateModal(true)}
          variant="ghost"
        />
      </View>

      <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
        PLEDGES ({pledges.length})
      </Text>

      {pledges.length === 0 && (
        <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.xl }]}>
          No pledges yet.
        </Text>
      )}

      {pledges.map((pledge) => {
        const pledgeStatusPair =
          pledge.status === 'received'
            ? Colors.category.teal
            : pledge.status === 'transfer_claimed'
            ? Colors.category.blue
            : pledge.status === 'cancelled' || pledge.status === 'expired'
            ? Colors.category.coral
            : Colors.category.amber;

        return (
          <View key={pledge.id} style={{ marginBottom: Spacing.md }}>
            <Card padding="md">
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                <AvatarDisplay
                  avatarUrl={pledge.volunteer?.avatar_url}
                  fullName={pledge.volunteer?.full_name}
                  size="sm"
                />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={[Typography.cardTitle, { color: Colors.textPrimary, fontSize: 14 }]}>
                    {pledge.volunteer?.full_name || 'Volunteer'}
                  </Text>
                  <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                    {pledge.quantity} {item.unit_label} • £{pledge.amount.toFixed(2)}
                  </Text>
                </View>
                <View style={{ backgroundColor: pledgeStatusPair.bg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.pill }}>
                  <Text style={[Typography.badge, { color: pledgeStatusPair.text }]}>
                    {PLEDGE_STATUS_LABEL[pledge.status]}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border }}>
                <Text
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fontWeight: '500',
                    color: Colors.textPrimary,
                    letterSpacing: 1,
                  }}
                >
                  {pledge.reference}
                </Text>
                {pledge.gift_aid && (
                  <View style={{ backgroundColor: Colors.category.purple.bg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.pill }}>
                    <Text style={[Typography.badge, { color: Colors.category.purple.text }]}>Gift Aid</Text>
                  </View>
                )}
              </View>

              {(pledge.status === 'transfer_claimed' || pledge.status === 'pledged') && (
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={actionLoadingId === pledge.id ? 'Confirming...' : 'Confirm received'}
                      onPress={() => confirmReceived(pledge.id)}
                      variant="primary"
                      size="sm"
                      disabled={actionLoadingId === pledge.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Cancel pledge"
                      onPress={() => cancelPledge(pledge.id, pledge.status)}
                      variant="danger"
                      size="sm"
                      disabled={actionLoadingId === pledge.id}
                    />
                  </View>
                </View>
              )}
            </Card>
          </View>
        );
      })}

      <View style={{ height: Spacing.xl }} />

      {item && (
        <SponsorshipItemModal
          visible={showEditModal}
          charityId={item.charity_id}
          item={item}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchData();
          }}
        />
      )}

      {item && (
        <SponsorshipItemModal
          visible={showDuplicateModal}
          charityId={item.charity_id}
          duplicateFrom={item}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => {
            setShowDuplicateModal(false);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
