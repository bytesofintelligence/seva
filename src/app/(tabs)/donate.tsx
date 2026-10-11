import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { Card, Button, SkeletonCard } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography, Layout } from '@/constants/design-tokens';
import { colorForCategory } from '@/constants/sponsorship-categories';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { PledgeModal, PledgeableItem } from '@/components/PledgeModal';
import { ReceivedTick } from '@/components/ReceivedTick';
import { PledgeStatus, SponsorshipItemStatus } from '@/types/sponsorship';

interface BrowseItem {
  id: string;
  charity_id: string;
  charity_name: string;
  title: string;
  unit_label: string;
  quantity_needed: number;
  total_cost: number;
  status: SponsorshipItemStatus;
  category: string;
  period_start: string;
  period_end: string;
  quantity_pledged: number;
  amount_pledged: number;
  quantity_remaining: number;
}

interface MyPledge {
  id: string;
  quantity: number;
  amount: number;
  reference: string;
  status: PledgeStatus;
  gift_aid: boolean;
  item: { title: string; unit_label: string; charity_id: string } | null;
  charity_name: string;
}

function periodLabel(periodEnd: string): string {
  const today = new Date();
  const end = new Date(periodEnd);
  const diffDays = Math.round((end.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays >= 0 && diffDays <= 7) return 'This week';
  if (diffDays < 0) return 'Past';
  return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function DonateScreen() {
  const { session } = useAuth();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [pledges, setPledges] = useState<MyPledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PledgeableItem | null>(null);
  const [showPledgeModal, setShowPledgeModal] = useState(false);

  const fetchBrowse = useCallback(async () => {
    await supabase.rpc('expire_stale_pledges');

    const todayStr = new Date().toISOString().split('T')[0];

    const { data: itemsData, error: itemsError } = await supabase
      .from('sponsorship_items')
      .select('*, charities(name)')
      .neq('status', 'closed')
      .gte('period_end', todayStr)
      .order('period_end', { ascending: true });
    if (itemsError) throw itemsError;

    const ids = (itemsData || []).map((i: any) => i.id);
    const { data: progressData, error: progressError } = ids.length
      ? await supabase.from('sponsorship_item_progress').select('*').in('item_id', ids)
      : { data: [], error: null };
    if (progressError) throw progressError;

    const progressById = new Map((progressData || []).map((p: any) => [p.item_id, p]));

    const merged: BrowseItem[] = (itemsData || []).map((it: any) => {
      const progress = progressById.get(it.id);
      return {
        id: it.id,
        charity_id: it.charity_id,
        charity_name: it.charities?.name || 'Unknown charity',
        title: it.title,
        unit_label: it.unit_label,
        quantity_needed: it.quantity_needed,
        total_cost: it.total_cost,
        status: it.status,
        category: it.category,
        period_start: it.period_start,
        period_end: it.period_end,
        quantity_pledged: progress?.quantity_pledged ?? 0,
        amount_pledged: progress?.amount_pledged ?? 0,
        quantity_remaining: progress?.quantity_remaining ?? it.quantity_needed,
      };
    });

    setItems(merged);
  }, []);

  const fetchMine = useCallback(async () => {
    if (!session?.user.id) return;

    await supabase.rpc('expire_stale_pledges');

    const { data, error: pledgesError } = await supabase
      .from('pledges')
      .select('id, quantity, amount, reference, status, gift_aid, item:sponsorship_items(title, unit_label, charity_id, charities(name))')
      .eq('volunteer_id', session.user.id)
      .order('created_at', { ascending: false });
    if (pledgesError) throw pledgesError;

    const mapped: MyPledge[] = ((data as any) || []).map((p: any) => ({
      id: p.id,
      quantity: p.quantity,
      amount: p.amount,
      reference: p.reference,
      status: p.status,
      gift_aid: p.gift_aid,
      item: p.item ? { title: p.item.title, unit_label: p.item.unit_label, charity_id: p.item.charity_id } : null,
      charity_name: p.item?.charities?.name || 'Unknown charity',
    }));

    setPledges(mapped);
  }, [session?.user.id]);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([fetchBrowse(), fetchMine()]);
    } catch (err: any) {
      console.error('Error loading donate screen:', err);
      setError(err?.message || 'Failed to load');
    }
  }, [fetchBrowse, fetchMine]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll().finally(() => setLoading(false));
    }, [fetchAll])
  );

  // Realtime: keep remaining amounts live for everyone watching this screen.
  //
  // We deliberately do NOT depend on `fetchAll` here (it's a new function
  // identity on most renders) — supabase.removeChannel() is async and only
  // removes the channel from the client's internal registry once the
  // unsubscribe round-trip resolves, so re-running this effect on every
  // fetchAll change could ask for a new channel before the old one finished
  // tearing down. A ref sidesteps that while still always calling the
  // latest fetchAll.
  const fetchAllRef = useRef(fetchAll);
  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  useEffect(() => {
    // Generated fresh inside the effect body (not a ref) so that even React
    // Strict Mode's dev-only mount -> cleanup -> mount double-invoke gets a
    // brand new, never-before-used topic name on the second mount — a ref
    // would keep the same name across that remount, and since the first
    // mount's cleanup (removeChannel) hasn't resolved yet at that point,
    // supabase.channel(sameName) would hand back the still-subscribed old
    // channel instead of creating a new one, and calling .on() on it throws
    // "cannot add postgres_changes callbacks... after subscribe()".
    const channelName = `sponsorship-live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pledges' }, () => {
        fetchAllRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsorship_items' }, () => {
        fetchAllRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const grouped = useMemo(() => {
    const byCharity = new Map<string, BrowseItem[]>();
    for (const item of items) {
      const list = byCharity.get(item.charity_name) || [];
      list.push(item);
      byCharity.set(item.charity_name, list);
    }
    for (const list of byCharity.values()) {
      list.sort((a, b) => {
        const rank = (s: SponsorshipItemStatus) => (s === 'fully_pledged' || s === 'fulfilled' ? 1 : 0);
        return rank(a.status) - rank(b.status);
      });
    }
    return Array.from(byCharity.entries());
  }, [items]);

  const openPledgeModal = (item: BrowseItem) => {
    setSelectedItem({
      id: item.id,
      charity_id: item.charity_id,
      charity_name: item.charity_name,
      title: item.title,
      unit_label: item.unit_label,
      quantity_needed: item.quantity_needed,
      total_cost: item.total_cost,
      quantity_remaining: item.quantity_remaining,
    });
    setShowPledgeModal(true);
  };

  const confirmTransfer = (pledgeId: string) => {
    Alert.alert(
      "I've made the transfer",
      'This tells the charity to check for your transfer using the reference code.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await haptics.medium();
              const { error: updateError } = await supabase
                .from('pledges')
                .update({ status: 'transfer_claimed' })
                .eq('id', pledgeId);
              if (updateError) throw updateError;
              await haptics.success();
              fetchAll();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to update pledge');
            }
          },
        },
      ]
    );
  };

  const cancelPledge = (pledgeId: string) => {
    Alert.alert('Cancel pledge', 'Are you sure you want to cancel this pledge?', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel pledge',
        style: 'destructive',
        onPress: async () => {
          try {
            await haptics.medium();
            const { error: updateError } = await supabase
              .from('pledges')
              .update({ status: 'cancelled' })
              .eq('id', pledgeId);
            if (updateError) throw updateError;
            await haptics.success();
            fetchAll();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to cancel pledge');
          }
        },
      },
    ]);
  };

  const renderItemCard = (item: BrowseItem) => {
    const isFullyPledged = item.status !== 'open';
    const progressPct = item.quantity_needed > 0 ? Math.min(1, item.quantity_pledged / item.quantity_needed) : 0;
    const barColor = Colors.category[colorForCategory(item.category)].text;
    const catPair = Colors.category[colorForCategory(item.category)];

    return (
      <View key={item.id} style={{ marginBottom: Layout.cardGap }}>
        <Card padding="md">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm }}>
            <View
              style={{
                backgroundColor: catPair.bg,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: BorderRadius.pill,
              }}
            >
              <Text style={[Typography.badge, { color: catPair.text }]}>
                {periodLabel(item.period_end)}
              </Text>
            </View>
            {isFullyPledged && (
              <Text style={[Typography.badge, { color: Colors.textTertiary }]}>Fully sponsored 🎉</Text>
            )}
          </View>

          <Text style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: 2 }]}>
            {item.title}
          </Text>
          <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            {item.quantity_needed} {item.unit_label} · £{item.total_cost.toFixed(2)}
          </Text>

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
                backgroundColor: isFullyPledged ? Colors.textTertiary : barColor,
                borderRadius: BorderRadius.pill,
              }}
            />
          </View>

          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            £{item.amount_pledged.toFixed(2)} raised · {item.quantity_remaining} {item.unit_label} still needed
          </Text>

          {!isFullyPledged && (
            <Button label="Sponsor this" onPress={() => openPledgeModal(item)} variant="primary" />
          )}
        </Card>
      </View>
    );
  };

  const PLEDGE_STEPS: { key: PledgeStatus; label: string }[] = [
    { key: 'pledged', label: 'Pledged' },
    { key: 'transfer_claimed', label: 'Transferred' },
    { key: 'received', label: 'Confirmed' },
  ];

  const renderPledgeCard = (pledge: MyPledge) => {
    const isTerminalBad = pledge.status === 'cancelled' || pledge.status === 'expired';
    const activeIndex = PLEDGE_STEPS.findIndex((s) => s.key === pledge.status);

    return (
      <View key={pledge.id} style={{ marginBottom: Layout.cardGap }}>
        <Card padding="md">
          <Text style={[Typography.cardTitle, { color: Colors.textPrimary }]}>
            {pledge.item?.title || 'Sponsorship item'}
          </Text>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            {pledge.charity_name} · {pledge.quantity} {pledge.item?.unit_label} · £{pledge.amount.toFixed(2)}
          </Text>

          {isTerminalBad ? (
            <View
              style={{
                backgroundColor: Colors.category.coral.bg,
                borderRadius: BorderRadius.pill,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                alignSelf: 'flex-start',
                marginBottom: Spacing.md,
              }}
            >
              <Text style={[Typography.badge, { color: Colors.category.coral.text }]}>
                {pledge.status === 'cancelled' ? 'Cancelled' : 'Expired'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
              {PLEDGE_STEPS.map((s, idx) => {
                const done = idx <= activeIndex;
                return (
                  <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', flex: idx < PLEDGE_STEPS.length - 1 ? 1 : undefined }}>
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: BorderRadius.pill,
                          backgroundColor: done ? Colors.primary : Colors.ringTrack,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {done && <Check size={13} color={Colors.cardBg} strokeWidth={2.5} />}
                      </View>
                      <Text style={[Typography.meta, { color: done ? Colors.primary : Colors.textTertiary, marginTop: 4, fontSize: 10 }]}>
                        {s.label}
                      </Text>
                    </View>
                    {idx < PLEDGE_STEPS.length - 1 && (
                      <View style={{ flex: 1, height: 2, backgroundColor: idx < activeIndex ? Colors.primary : Colors.ringTrack, marginHorizontal: 4, marginBottom: 14 }} />
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {pledge.status === 'received' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <ReceivedTick />
              <Text style={[Typography.body, { color: Colors.primary, fontWeight: '500', flex: 1 }]}>
                Thank you — this donation has been confirmed received.
              </Text>
            </View>
          )}

          {(pledge.status === 'pledged' || pledge.status === 'transfer_claimed') && (
            <View style={{ gap: Spacing.sm }}>
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
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {pledge.status === 'pledged' && (
                  <View style={{ flex: 1 }}>
                    <Button label="I've made the transfer" onPress={() => confirmTransfer(pledge.id)} variant="primary" size="sm" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Button
                    label={pledge.status === 'pledged' ? 'Cancel' : 'Cancel pledge'}
                    onPress={() => cancelPledge(pledge.id)}
                    variant={pledge.status === 'pledged' ? 'ghost' : 'danger'}
                    size="sm"
                  />
                </View>
              </View>
            </View>
          )}
        </Card>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Layout.screenPaddingHorizontal, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
      >
        <View style={{ marginTop: Spacing.md, marginBottom: Spacing.lg }}>
          <Text style={[Typography.screenTitle, { color: Colors.textPrimary }]}>Sponsor a meal</Text>
          <Text style={[Typography.body, { color: Colors.textSecondary, marginTop: 2 }]}>
            Small pledges add up to a full kitchen — see what's needed this week
          </Text>
        </View>

        {/* Segmented control */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.lg,
            padding: 4,
            marginBottom: Spacing.lg,
          }}
        >
          {(['browse', 'mine'] as const).map((t) => {
            const selected = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.sm,
                  borderRadius: BorderRadius.md,
                  alignItems: 'center',
                  backgroundColor: selected ? Colors.cardBg : 'transparent',
                }}
              >
                <Text style={[Typography.chip, { color: selected ? Colors.textPrimary : Colors.textSecondary, fontWeight: selected ? '500' : '400' }]}>
                  {t === 'browse' ? 'Browse' : 'My donations'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && (
          <View style={{ backgroundColor: Colors.category.coral.bg, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg }}>
            <Text style={{ color: Colors.category.coral.text, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </View>
        ) : tab === 'browse' ? (
          grouped.length === 0 ? (
            <Text style={[Typography.body, { color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.xl }]}>
              Nothing needs sponsoring right now — check back Friday.
            </Text>
          ) : (
            grouped.map(([charityName, charityItems]) => (
              <View key={charityName} style={{ marginBottom: Spacing.xl }}>
                <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
                  {charityName.toUpperCase()}
                </Text>
                {charityItems.map((item) => renderItemCard(item))}
              </View>
            ))
          )
        ) : pledges.length === 0 ? (
          <Text style={[Typography.body, { color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.xl }]}>
            No pledges yet — browse what's needed above and make your first one.
          </Text>
        ) : (
          pledges.map((pledge) => renderPledgeCard(pledge))
        )}
      </ScrollView>

      <PledgeModal
        visible={showPledgeModal}
        item={selectedItem}
        onClose={() => setShowPledgeModal(false)}
        onSuccess={() => {
          setShowPledgeModal(false);
          setTab('mine');
          fetchAll();
        }}
      />
    </SafeAreaView>
  );
}
