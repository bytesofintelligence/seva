import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Screen, Card, Button, Tag } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { Spacing, Colors, BorderRadius, Typography, Layout } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { PostOpportunityModal } from '@/components/PostOpportunityModal';
import { FeaturedEventPanel } from '@/components/FeaturedEventPanel';

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
  _applicationCount?: number;
}

interface OpportunityWithCount extends Opportunity {
  _applicationCount: number;
}

interface FeaturedEventData {
  id: string;
  title: string;
  location: string;
  starts_at: string | null;
  target_volunteers: number | null;
  volunteers_count: number;
  signups_count: number;
}

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
};

const formatTagLabel = (type: string | null): string => {
  if (!type) return '';
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
};

export default function CharityDashboardScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [charity, setCharity] = useState<Charity | null>(null);
  const [featuredEvent, setFeaturedEvent] = useState<FeaturedEventData | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);

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

      // Fetch featured opportunities for this charity
      const { data: featuredData, error: featuredError } = await supabase
        .from('opportunities')
        .select('id, title, location, starts_at, target_volunteers, featured')
        .eq('charity_id', charityData.id)
        .eq('featured', true)
        .eq('status', 'active')
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

        const formattedDate = featOpp.starts_at
          ? new Date(featOpp.starts_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : 'TBA';

        const formattedTime = featOpp.starts_at
          ? new Date(featOpp.starts_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : '';

        setFeaturedEvent({
          id: featOpp.id,
          title: featOpp.title,
          location: featOpp.location,
          starts_at: featOpp.starts_at,
          target_volunteers: featOpp.target_volunteers || 0,
          volunteers_count: countData?.volunteers_count || 0,
          signups_count: countData?.signups_count || 0,
        });
      }

      // Fetch all opportunities for this charity
      const { data: oppsData, error: oppsError } = await supabase
        .from('opportunities')
        .select('id, title, status, type, location, created_at')
        .eq('charity_id', charityData.id)
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

  const renderOpportunityCard = ({ item }: { item: OpportunityWithCount }) => {
    const categoryColor = item.type
      ? typeToCategory[item.type.toLowerCase()] || "teal"
      : "teal";
    const statusColor = statusColorMap[item.status] || statusColorMap.active;

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
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Applications Count and Button */}
        <View
          style={{
            paddingTop: Spacing.md,
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
            {item._applicationCount}{' '}
            {item._applicationCount === 1 ? 'application' : 'applications'}
          </Text>

          <Button
            label="View"
            onPress={() => router.push(`/opportunity/${item.id}/applications`)}
            variant="ghost"
          />
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

      {/* Featured Event Panel */}
      {featuredEvent && (
        <FeaturedEventPanel
          eventName={featuredEvent.title}
          date={featuredEvent.starts_at ? new Date(featuredEvent.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBA'}
          time={featuredEvent.starts_at ? new Date(featuredEvent.starts_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
          location={featuredEvent.location}
          currentVolunteers={featuredEvent.volunteers_count}
          targetVolunteers={featuredEvent.target_volunteers || 0}
          signupCount={featuredEvent.signups_count}
        />
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

      {/* Opportunities List */}
      {opportunities.length > 0 ? (
        <View style={{ marginTop: Spacing.xl }}>
          <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            YOUR OPPORTUNITIES
          </Text>
          <FlatList
            data={opportunities}
            renderItem={renderOpportunityCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: Spacing.xl }}
          />
        </View>
      ) : (
        renderEmptyState()
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
