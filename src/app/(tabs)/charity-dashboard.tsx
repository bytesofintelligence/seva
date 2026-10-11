import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, Text, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';

import { Screen, Card, Button, Tag } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { Spacing, Colors, BorderRadius, Typography, Layout } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { startOfTodayIso } from '@/lib/dates';
import { PostOpportunityModal } from '@/components/PostOpportunityModal';
import { FeaturedEventPanel } from '@/components/FeaturedEventPanel';
import { OpportunityActionSheet } from '@/components/OpportunityActionSheet';
import { SeriesActionSheet } from '@/components/SeriesActionSheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import { withRoleGuard } from '@/components/auth/RoleGate';

interface Charity {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  verified: boolean;
  avatar_url?: string | null;
}

interface Opportunity {
  id: string;
  title: string;
  status: string;
  type: string | null;
  location: string;
  created_at: string;
  starts_at: string | null;
  occurrence_date: string | null;
  series_id: string | null;
  _applicationCount?: number;
}

interface OpportunityWithCount extends Opportunity {
  _applicationCount: number;
}

interface SeriesSummary {
  id: string;
  title: string;
  recurrence_type: 'weekly' | 'daily';
  recurrence_day_of_week: number;
  template_time: string;
  template_duration_minutes: number;
  upcomingCount: number;
  nextOccurrence: {
    starts_at: string | null;
    target_volunteers: number | null;
    volunteers_count: number;
  } | null;
}

const formatTimeRange = (templateTime: string, durationMinutes: number) => {
  const [h, m] = templateTime.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const fmt = (d: Date) => {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const period = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return minutes === 0 ? `${hour12}${period}` : `${hour12}:${String(minutes).padStart(2, '0')}${period}`;
  };

  return `${fmt(start)}–${fmt(end)}`;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface FeaturedEventData {
  id: string;
  title: string;
  location: string;
  starts_at: string | null;
  occurrence_date: string | null;
  series_id: string | null;
  target_volunteers: number | null;
  volunteers_count: number;
  signups_count: number;
}

interface UpcomingOccurrence {
  id: string;
  occurrence_date: string | null;
  starts_at: string | null;
  status: string;
  target_volunteers: number | null;
  volunteers_count: number;
}

const formatOccurrenceDateHeading = (isoString: string) =>
  new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });

const formatShortDate = (isoString: string) =>
  new Date(isoString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  });

const typeToCategory: Record<string, "coral" | "blue" | "purple" | "teal"> = {
  delivery: "coral",
  "on-site": "blue",
  remote: "purple",
  flagship: "coral",
};

const statusColorMap: Record<string, { bg: string; text: string }> = {
  active: { bg: Colors.category.teal.bg, text: Colors.category.teal.text },
  filled: { bg: Colors.category.amber.bg, text: Colors.category.amber.text },
  closed: { bg: Colors.category.coral.bg, text: Colors.category.coral.text },
  cancelled: { bg: Colors.category.coral.bg, text: Colors.category.coral.text },
  past: { bg: Colors.surfaceMuted, text: Colors.textSecondary },
};

// An opportunity only counts as past once its whole day is over — i.e. from
// midnight (Europe/London) of the following day. This keeps Friday's event
// listed as upcoming while it's actually running on Friday evening, matching
// the flagship panel above.
const isPastOpportunity = (item: { starts_at: string | null }) =>
  !!item.starts_at && item.starts_at < startOfTodayIso();

const formatTagLabel = (type: string | null): string => {
  if (!type) return '';
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
};

function CharityDashboardScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [charity, setCharity] = useState<Charity | null>(null);
  const [featuredEvent, setFeaturedEvent] = useState<FeaturedEventData | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityWithCount[]>([]);
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [actionSheetItem, setActionSheetItem] = useState<OpportunityWithCount | null>(null);
  const [seriesActionSheetItem, setSeriesActionSheetItem] = useState<SeriesSummary | null>(null);
  const [exceptionDatePickerSeriesId, setExceptionDatePickerSeriesId] = useState<string | null>(null);
  const [upcomingOccurrences, setUpcomingOccurrences] = useState<UpcomingOccurrence[]>([]);
  const [futureActiveCount, setFutureActiveCount] = useState(0);
  const [generatingMore, setGeneratingMore] = useState(false);

  const fetchCharityAndOpportunities = useCallback(async () => {
    if (!session?.user.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch charity
      const { data: charityData, error: charityError } = await supabase
        .from('charities')
        .select('*')
        .eq('owner_id', session.user.id)
        .single();

      if (charityError) {
        if (charityError.code === 'PGRST116') {
          router.replace('/charity-setup');
          return;
        }
        throw charityError;
      }

      setCharity(charityData);

      // Fetch featured opportunities for this charity.
      // "Current" occurrence = smallest starts_at at or after midnight of
      // today (Europe/London). An event therefore stays on the dashboard for
      // the whole of its own day — Friday's event is still "This Friday" at
      // 11pm Friday — and rolls over to next week's occurrence the moment
      // Saturday 00:00 hits.
      const todayStart = startOfTodayIso();
      const { data: featuredData, error: featuredError } = await supabase
        .from('opportunities')
        .select('id, title, location, starts_at, occurrence_date, series_id, target_volunteers, featured')
        .eq('charity_id', charityData.id)
        .eq('featured', true)
        .eq('status', 'active')
        .gte('starts_at', todayStart)
        .order('starts_at', { ascending: true })
        .limit(1);

      if (!featuredError && featuredData && featuredData.length > 0) {
        const featOpp = featuredData[0];
        // Fetch volunteer counts for featured opportunity
        const { data: countData } = await supabase
          .from('opportunity_volunteer_counts')
          .select('volunteers_count, signups_count')
          .eq('id', featOpp.id)
          .single();

        setFeaturedEvent({
          id: featOpp.id,
          title: featOpp.title,
          location: featOpp.location,
          starts_at: featOpp.starts_at,
          occurrence_date: featOpp.occurrence_date,
          series_id: featOpp.series_id,
          target_volunteers: featOpp.target_volunteers || 0,
          volunteers_count: countData?.volunteers_count || 0,
          signups_count: countData?.signups_count || 0,
        });

        // Upcoming weeks in the same series (both active and cancelled, so
        // exception dates show up as greyed-out cards for visibility).
        if (featOpp.series_id && featOpp.occurrence_date) {
          const nowIso = new Date().toISOString();
          const { data: upcomingData } = await supabase
            .from('opportunities')
            .select('id, occurrence_date, starts_at, status, target_volunteers')
            .eq('series_id', featOpp.series_id)
            .gt('starts_at', nowIso)
            .gt('occurrence_date', featOpp.occurrence_date)
            .order('occurrence_date', { ascending: true })
            .limit(8);

          if (upcomingData && upcomingData.length > 0) {
            const { data: upcomingCounts } = await supabase
              .from('opportunity_volunteer_counts')
              .select('id, volunteers_count')
              .in('id', upcomingData.map((o) => o.id));

            const countMap = new Map((upcomingCounts || []).map((c) => [c.id, c.volunteers_count]));
            setUpcomingOccurrences(
              upcomingData.map((o) => ({ ...o, volunteers_count: countMap.get(o.id) || 0 }))
            );
          } else {
            setUpcomingOccurrences([]);
          }

          // Dedicated count (independent of the 8-row display limit) so the
          // low-occurrences warning stays accurate even if cancelled rows
          // push active ones past the display cutoff.
          const { count: activeCount } = await supabase
            .from('opportunities')
            .select('id', { count: 'exact', head: true })
            .eq('series_id', featOpp.series_id)
            .eq('status', 'active')
            .gt('starts_at', nowIso);

          setFutureActiveCount(activeCount || 0);
        } else {
          setUpcomingOccurrences([]);
          setFutureActiveCount(0);
        }
      } else {
        setUpcomingOccurrences([]);
        setFutureActiveCount(0);
      }

      // Fetch standalone opportunities only (series_id IS NULL). Occurrences
      // that belong to a series are represented once each by the series
      // card below instead of appearing here individually — otherwise a
      // 12-week series would render 12 near-identical event cards.
      const { data: oppsData, error: oppsError } = await supabase
        .from('opportunities')
        .select('id, title, status, type, location, created_at, starts_at, occurrence_date, series_id')
        .eq('charity_id', charityData.id)
        .is('series_id', null)
        .order('created_at', { ascending: false });

      if (oppsError) {
        throw oppsError;
      }

      // For each opportunity, count applications
      if (oppsData && oppsData.length > 0) {
        const oppsWithCounts = await Promise.all(
          oppsData.map(async (opp) => {
            const { count } = await supabase
              .from('applications')
              .select('id', { count: 'exact', head: true })
              .eq('opportunity_id', opp.id);

            return {
              ...opp,
              _applicationCount: count || 0,
            };
          })
        );

        setOpportunities(oppsWithCounts);
      } else {
        setOpportunities([]);
      }

      // Fetch recurring series for this charity, one card per series
      // (not one per generated occurrence).
      const { data: seriesData } = await supabase
        .from('opportunity_series')
        .select('id, title, recurrence_type, recurrence_day_of_week, template_time, template_duration_minutes')
        .eq('charity_id', charityData.id)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (seriesData && seriesData.length > 0) {
        const nowIso = new Date().toISOString();
        const seriesWithDetails = await Promise.all(
          seriesData.map(async (s) => {
            const { count: upcomingCount } = await supabase
              .from('opportunities')
              .select('id', { count: 'exact', head: true })
              .eq('series_id', s.id)
              .eq('status', 'active')
              .gt('starts_at', nowIso);

            const { data: nextOccData } = await supabase
              .from('opportunities')
              .select('id, starts_at, target_volunteers')
              .eq('series_id', s.id)
              .eq('status', 'active')
              .gt('starts_at', nowIso)
              .order('starts_at', { ascending: true })
              .limit(1)
              .single();

            let nextVolunteersCount = 0;
            if (nextOccData) {
              const { data: countData } = await supabase
                .from('opportunity_volunteer_counts')
                .select('volunteers_count')
                .eq('id', nextOccData.id)
                .single();
              nextVolunteersCount = countData?.volunteers_count || 0;
            }

            return {
              ...s,
              upcomingCount: upcomingCount || 0,
              nextOccurrence: nextOccData
                ? {
                    starts_at: nextOccData.starts_at,
                    target_volunteers: nextOccData.target_volunteers,
                    volunteers_count: nextVolunteersCount,
                  }
                : null,
            };
          })
        );
        setSeries(seriesWithDetails);
      } else {
        setSeries([]);
      }
    } catch (err: any) {
      console.error('Error fetching charity data:', err);
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id, router]);

  useEffect(() => {
    fetchCharityAndOpportunities();
  }, [fetchCharityAndOpportunities]);

  useFocusEffect(
    useCallback(() => {
      fetchCharityAndOpportunities();
    }, [fetchCharityAndOpportunities])
  );

  const handleGenerateMoreOccurrences = async () => {
    if (!featuredEvent?.series_id) return;
    setGeneratingMore(true);
    try {
      const lastDate =
        upcomingOccurrences.length > 0
          ? upcomingOccurrences[upcomingOccurrences.length - 1].occurrence_date
          : featuredEvent.occurrence_date;
      const fromDate = lastDate
        ? new Date(new Date(lastDate).getTime() + 24 * 60 * 60 * 1000)
        : new Date();
      const fromDateString = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(
        fromDate.getDate()
      ).padStart(2, '0')}`;

      const { error } = await supabase.rpc('generate_series_occurrences', {
        p_series_id: featuredEvent.series_id,
        p_from_date: fromDateString,
        p_weeks: 4,
      });

      if (error) throw error;

      await fetchCharityAndOpportunities();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate more dates');
    } finally {
      setGeneratingMore(false);
    }
  };

  const handleAddExceptionDate = async (seriesId: string, date: Date) => {
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

    try {
      const { data: seriesRow, error: fetchError } = await supabase
        .from('opportunity_series')
        .select('exception_dates')
        .eq('id', seriesId)
        .single();

      if (fetchError) throw fetchError;

      const existingDates: string[] = seriesRow?.exception_dates || [];
      if (!existingDates.includes(dateString)) {
        const { error: updateError } = await supabase
          .from('opportunity_series')
          .update({ exception_dates: [...existingDates, dateString] })
          .eq('id', seriesId);

        if (updateError) throw updateError;
      }

      // If an occurrence for this date was already generated, cancel it
      // immediately so it stops appearing to volunteers straight away
      // rather than waiting for the next generation pass.
      const { error: cancelError } = await supabase
        .from('opportunities')
        .update({ status: 'cancelled' })
        .eq('series_id', seriesId)
        .eq('occurrence_date', dateString);

      if (cancelError) throw cancelError;

      await fetchCharityAndOpportunities();
      Alert.alert('Success', `${dateString} marked as an exception date.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add exception date');
    }
  };

  const handleDeleteOpportunity = (opportunityId: string, opportunityTitle: string) => {
    Alert.alert(
      'Delete Opportunity',
      `Are you sure you want to delete "${opportunityTitle}"? This will remove all registrations and cannot be undone.`,
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              // Delete the opportunity (cascading deletes will handle applications)
              const { error } = await supabase
                .from('opportunities')
                .delete()
                .eq('id', opportunityId);

              if (error) throw error;

              // Refresh the list
              await fetchCharityAndOpportunities();
              Alert.alert('Success', 'Opportunity deleted successfully');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete opportunity');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleDuplicateOpportunity = async (item: OpportunityWithCount) => {
    setActionSheetItem(null);
    try {
      const { data: original, error: fetchError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', item.id)
        .single();

      if (fetchError) throw fetchError;

      // Copy every field except: id, created_at, spots_filled, status, series_id,
      // occurrence_date, starts_at. The duplicate is a standalone draft that
      // still needs a date picked before it can be published.
      const {
        id,
        created_at,
        spots_filled,
        status,
        series_id,
        occurrence_date,
        starts_at,
        ...rest
      } = original;

      const { data: created, error: insertError } = await supabase
        .from('opportunities')
        .insert({
          ...rest,
          status: 'draft',
          spots_filled: 0,
          series_id: null,
          occurrence_date: null,
          starts_at: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchCharityAndOpportunities();
      router.push({
        pathname: '/edit-opportunity/[id]',
        params: { id: created.id, duplicatedFrom: original.title },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to duplicate opportunity');
    }
  };

  const handleCancelOccurrence = (item: OpportunityWithCount) => {
    setActionSheetItem(null);

    // occurrence_date is a plain DATE column; parse it at local midnight
    // (not `new Date(dateOnlyString)`, which reads as UTC midnight and can
    // render as the previous day in timezones behind UTC).
    const dateLabel = item.occurrence_date
      ? new Date(`${item.occurrence_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : item.starts_at
      ? new Date(item.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Europe/London' })
      : 'this event';

    Alert.alert(
      `Cancel ${dateLabel}?`,
      'Volunteers who have signed up will have their application cancelled.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel occurrence',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('opportunities')
                .update({ status: 'cancelled' })
                .eq('id', item.id);

              if (error) throw error;

              await fetchCharityAndOpportunities();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel occurrence');
            }
          },
        },
      ]
    );
  };

  const renderOpportunityCard = ({ item }: { item: OpportunityWithCount }) => {
    const categoryColor = item.type
      ? typeToCategory[item.type.toLowerCase()] || "teal"
      : "teal";
    // A past-dated opportunity that's still marked 'active' in the database
    // (nothing auto-transitions status once the date passes) should read as
    // "Past" here rather than "Active" — cancelled stays "Cancelled" either way.
    const displayStatus = item.status === 'active' && isPastOpportunity(item) ? 'past' : item.status;
    const statusColor = statusColorMap[displayStatus] || statusColorMap.active;

    return (
      <Card padding="md" style={{ marginBottom: Layout.cardGap }}>
        <TouchableOpacity
          onPress={() => router.push(`/opportunity/${item.id}`)}
          style={{ marginBottom: Spacing.md }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text
                style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: Spacing.sm }]}
              >
                {item.title}
              </Text>

              {item.type && (
                <View style={{ marginBottom: Spacing.sm }}>
                  <Tag label={formatTagLabel(item.type)} color={categoryColor} />
                </View>
              )}

              <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                📍 {item.location}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              {/* Status Badge */}
              <View
                style={{
                  backgroundColor: statusColor.bg,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: BorderRadius.pill,
                }}
              >
                <Text
                  style={[Typography.badge, { color: statusColor.text }]}
                >
                  {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                </Text>
              </View>

              {/* Three-dot action menu */}
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setActionSheetItem(item);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MoreHorizontal size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        {/* Applications Count and Buttons */}
        <View
          style={{
            paddingTop: Spacing.md,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: Spacing.sm,
          }}
        >
          <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
            {item._applicationCount}{' '}
            {item._applicationCount === 1 ? 'application' : 'applications'}
          </Text>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button
              label="View"
              onPress={() => router.push(`/opportunity/${item.id}/applications`)}
              variant="ghost"
            />
            <Button
              label="Delete"
              onPress={() => handleDeleteOpportunity(item.id, item.title)}
              variant="danger"
            />
          </View>
        </View>
      </Card>
    );
  };

  const renderEmptyState = () => (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xl,
      }}
    >
      <Text style={[Typography.screenTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
        No opportunities yet
      </Text>
      <Text
        style={{
          textAlign: 'center',
          ...Typography.body,
          color: Colors.textSecondary,
          marginBottom: Spacing.xl,
        }}
      >
        Post your first volunteer opportunity to connect with volunteers in your community.
      </Text>
      <Button
        label="Post an Opportunity"
        onPress={() => setShowPostModal(true)}
        variant="primary"
      />
    </View>
  );

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[Typography.body, { marginTop: Spacing.md, color: Colors.textSecondary }]}>
            Loading dashboard...
          </Text>
        </View>
      </Screen>
    );
  }

  if (error || !charity) {
    return (
      <Screen>
        <Text
          style={[Typography.screenTitle, { marginBottom: Spacing.md, color: Colors.textPrimary }]}
        >
          Something went wrong
        </Text>
        <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.xl }]}>
          {error || 'Could not load your charity'}
        </Text>
        <Button label="Try Again" onPress={fetchCharityAndOpportunities} variant="primary" />
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.lg,
        }}
      >
        <Text style={[Typography.screenTitle, { color: Colors.textPrimary }]}>
          Dashboard
        </Text>
        <TouchableOpacity onPress={() => router.push('/edit-profile-charity')}>
          <AvatarDisplay
            avatarUrl={charity?.avatar_url}
            fullName={charity?.name}
            size="sm"
          />
        </TouchableOpacity>
      </View>

      {/* Featured Event Panel: heading always includes the specific date */}
      {featuredEvent && (
        <FeaturedEventPanel
          eventName={
            featuredEvent.starts_at
              ? `${featuredEvent.title} · ${formatOccurrenceDateHeading(featuredEvent.starts_at)}`
              : featuredEvent.title
          }
          date={featuredEvent.starts_at ? new Date(featuredEvent.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBA'}
          time={featuredEvent.starts_at ? new Date(featuredEvent.starts_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
          location={featuredEvent.location}
          currentVolunteers={featuredEvent.volunteers_count}
          targetVolunteers={featuredEvent.target_volunteers || 0}
          signupCount={featuredEvent.signups_count}
        />
      )}

      {/* Low-occurrences warning */}
      {featuredEvent?.series_id && futureActiveCount < 3 && (
        <TouchableOpacity onPress={handleGenerateMoreOccurrences} disabled={generatingMore}>
          <View
            style={{
              backgroundColor: Colors.category.amber.bg,
              borderRadius: BorderRadius.md,
              padding: Spacing.md,
              marginBottom: Spacing.lg,
            }}
          >
            <Text style={[Typography.body, { color: Colors.category.amber.text }]}>
              {generatingMore
                ? 'Generating more dates…'
                : `Only ${futureActiveCount} upcoming date${futureActiveCount === 1 ? '' : 's'} generated. Tap to generate more.`}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Upcoming weeks in this series: horizontal scroll, implemented with
          a horizontal FlatList so only the cards near the viewport are ever
          mounted/measured — the list stays cheap to render even as more
          weeks get generated, unlike a ScrollView which renders every child
          up front. */}
      {featuredEvent?.series_id && upcomingOccurrences.length > 0 && (
        <View style={{ marginBottom: Spacing.xl }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            UPCOMING WEEKS
          </Text>
          <FlatList
            data={upcomingOccurrences}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: Spacing.md }}
            renderItem={({ item }) => {
              const isActive = item.status === 'active';
              const target = item.target_volunteers || 0;
              return (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/occurrence/[id]', params: { id: item.id } })}
                  style={{ opacity: isActive ? 1 : 0.5 }}
                >
                  <Card padding="md" style={{ width: 130 }}>
                    <Text style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: Spacing.sm }]}>
                      {item.starts_at ? formatShortDate(item.starts_at) : '—'}
                    </Text>
                    <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                      {item.volunteers_count} / {target}
                    </Text>
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: isActive ? Colors.category.teal.bg : Colors.category.coral.bg,
                        paddingHorizontal: Spacing.sm,
                        paddingVertical: 2,
                        borderRadius: BorderRadius.pill,
                      }}
                    >
                      <Text
                        style={[
                          Typography.badge,
                          { color: isActive ? Colors.category.teal.text : Colors.category.coral.text },
                        ]}
                      >
                        {isActive ? 'Active' : 'Cancelled'}
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Charity Info Card */}
      <Card padding="lg" style={{ marginBottom: Spacing.xl }}>
        <View style={{ marginBottom: Spacing.md }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
            ORGANIZATION
          </Text>
          <Text
            style={[Typography.heroTitle, { color: Colors.textPrimary, marginBottom: Spacing.sm }]}
          >
            {charity.name}
          </Text>
          {charity.verified && (
            <Text style={[Typography.badge, { color: Colors.primary }]}>
              ✓ Verified
            </Text>
          )}
          {!charity.verified && (
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              Pending verification
            </Text>
          )}
        </View>

        {charity.description && (
          <View style={{ marginBottom: Spacing.md }}>
            <Text
              style={[Typography.body, { color: Colors.textSecondary, lineHeight: 20 }]}
            >
              {charity.description}
            </Text>
          </View>
        )}

        {charity.address && (
          <View>
            <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
              📍 {charity.address}
            </Text>
          </View>
        )}
      </Card>

      {/* Quick Stats - two cards with surfaceMuted background */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.xl }}>
        <View
          style={{
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.sm,
            padding: 16,
          }}
        >
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
            ACTIVE OPPORTUNITIES
          </Text>
          <Text style={[Typography.statNumber, { color: Colors.textPrimary }]}>
            {opportunities.filter((o) => o.status === 'active').length}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.sm,
            padding: 16,
          }}
        >
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
            TOTAL APPLICATIONS
          </Text>
          <Text style={[Typography.statNumber, { color: Colors.textPrimary }]}>
            {opportunities.reduce((sum, o) => sum + o._applicationCount, 0)}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.xl }}>
        <Button
          label="Post an Opportunity"
          onPress={() => setShowPostModal(true)}
          variant="primary"
        />
        <Button
          label="View Volunteer Directory"
          onPress={() => router.push('/volunteer-directory')}
          variant="ghost"
        />
      </View>

      {/* Recurring Series */}
      {series.length > 0 && (
        <View style={{ marginTop: Spacing.xl }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            RECURRING SERIES
          </Text>
          {series.map((s) => {
            const recurrenceLabel =
              s.recurrence_type === 'weekly' ? `Every ${DAY_NAMES[s.recurrence_day_of_week]}` : 'Every day';
            const timeRange = formatTimeRange(s.template_time, s.template_duration_minutes);
            const nextDateLabel = s.nextOccurrence?.starts_at
              ? formatOccurrenceDateHeading(s.nextOccurrence.starts_at)
              : null;

            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => router.push({ pathname: '/series/[id]', params: { id: s.id } })}
              >
                <Card padding="md" style={{ marginBottom: Layout.cardGap }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: Spacing.md }}>
                      <Text style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: Spacing.sm }]}>
                        {s.title}
                      </Text>
                      <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.xs }]}>
                        {recurrenceLabel} · {timeRange}
                      </Text>
                      <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                        {s.upcomingCount} upcoming date{s.upcomingCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setSeriesActionSheetItem(s);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MoreHorizontal size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {s.nextOccurrence && (
                    <View
                      style={{
                        marginTop: Spacing.md,
                        paddingTop: Spacing.md,
                        borderTopWidth: 1,
                        borderTopColor: Colors.border,
                      }}
                    >
                      <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                        Next: {nextDateLabel} · {s.nextOccurrence.volunteers_count} / {s.nextOccurrence.target_volunteers || 0} signed up
                      </Text>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Opportunities List: upcoming ones first so a past Friday never sits
          above (or gets read as "Active" ahead of) what's coming next. Past
          ones are kept below under their own heading, still with the same
          View/Delete actions, so the coordinator can still see who came. */}
      {opportunities.length > 0 ? (
        <>
          {(() => {
            const upcoming = opportunities
              .filter((o) => !isPastOpportunity(o))
              .sort((a, b) => {
                const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
                const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
                return aTime - bTime;
              });
            const past = opportunities
              .filter((o) => isPastOpportunity(o))
              .sort((a, b) => new Date(b.starts_at!).getTime() - new Date(a.starts_at!).getTime());

            return (
              <>
                {upcoming.length > 0 && (
                  <View style={{ marginTop: Spacing.xl }}>
                    <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
                      UPCOMING
                    </Text>
                    <FlatList
                      data={upcoming}
                      renderItem={renderOpportunityCard}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      contentContainerStyle={{ paddingBottom: Spacing.xl }}
                    />
                  </View>
                )}

                {past.length > 0 && (
                  <View style={{ marginTop: Spacing.md }}>
                    <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
                      PAST
                    </Text>
                    <FlatList
                      data={past}
                      renderItem={renderOpportunityCard}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      contentContainerStyle={{ paddingBottom: Spacing.xl }}
                    />
                  </View>
                )}
              </>
            );
          })()}
        </>
      ) : (
        renderEmptyState()
      )}

      {/* Opportunity Action Sheet */}
      {actionSheetItem && (
        <OpportunityActionSheet
          visible={!!actionSheetItem}
          title={actionSheetItem.title}
          showCancelOccurrence={actionSheetItem.status === 'active'}
          onDuplicate={() => handleDuplicateOpportunity(actionSheetItem)}
          onCancelOccurrence={() => handleCancelOccurrence(actionSheetItem)}
          onDismiss={() => setActionSheetItem(null)}
        />
      )}

      {/* Series Action Sheet */}
      {seriesActionSheetItem && (
        <SeriesActionSheet
          visible={!!seriesActionSheetItem}
          title={seriesActionSheetItem.title}
          onManageSeries={() => {
            const seriesId = seriesActionSheetItem.id;
            setSeriesActionSheetItem(null);
            router.push({ pathname: '/series/[id]', params: { id: seriesId } });
          }}
          onAddExceptionDate={() => {
            setExceptionDatePickerSeriesId(seriesActionSheetItem.id);
            setSeriesActionSheetItem(null);
          }}
          onDismiss={() => setSeriesActionSheetItem(null)}
        />
      )}

      {/* Exception Date Picker */}
      {exceptionDatePickerSeriesId && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            const seriesId = exceptionDatePickerSeriesId;
            setExceptionDatePickerSeriesId(null);
            if (selectedDate && seriesId) {
              handleAddExceptionDate(seriesId, selectedDate);
            }
          }}
        />
      )}

      {/* Post Opportunity Modal */}
      {charity && (
        <PostOpportunityModal
          visible={showPostModal}
          charityId={charity.id}
          charityName={charity.name}
          onClose={() => setShowPostModal(false)}
          onSuccess={() => {
            setShowPostModal(false);
            fetchCharityAndOpportunities();
          }}
        />
      )}
    </Screen>
  );
}

// Coordinator-only route. RLS in Postgres is the real boundary; this stops
// the screen rendering at all for a volunteer who reaches it by deep link.
export default withRoleGuard(CharityDashboardScreen, 'charity');
