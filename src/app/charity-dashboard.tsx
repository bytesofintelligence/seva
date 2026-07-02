import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Screen, Card, Button, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { PostOpportunityModal } from '@/components/PostOpportunityModal';

const typeToCategory: Record<string, "coral" | "blue" | "purple" | "teal"> = {
  delivery: "coral",
  "on-site": "blue",
  remote: "purple",
  flagship: "coral",
};

const formatTagLabel = (type: string | null): string => {
  if (!type) return '';
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
};

interface Charity {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  verified: boolean;
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

export default function CharityDashboardScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [charity, setCharity] = useState<Charity | null>(null);
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

      // Fetch opportunities for this charity
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

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const handlePostSuccess = () => {
    setShowPostModal(false);
    // Refetch opportunities
    fetchCharityAndOpportunities();
  };

  const renderOpportunityCard = ({ item }: { item: OpportunityWithCount }) => (
    <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.lg }}>
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
            <ThemedText
              type="h3"
              style={{
                marginBottom: Spacing.sm,
                color: Colors.textPrimary,
              }}
            >
              {item.title}
            </ThemedText>

            {item.type && (
              <View style={{ marginBottom: Spacing.sm }}>
                <Tag
                  label={formatTagLabel(item.type)}
                  color={typeToCategory[item.type.toLowerCase()] || "teal"}
                />
              </View>
            )}

            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 13,
              }}
            >
              📍 {item.location}
            </ThemedText>
          </View>

          {/* Status Badge */}
          <View
            style={{
              backgroundColor:
                item.status === 'active'
                  ? Colors.primary
                  : item.status === 'filled'
                    ? Colors.category.amber.text
                    : Colors.category.coral.text,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.xs,
              borderRadius: BorderRadius.full,
            }}
          >
            <ThemedText
              style={{
                color: Colors.cardBg,
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </ThemedText>
          </View>
        </View>
      </TouchableOpacity>

      {/* Applications Count and Button */}
      <View
        style={{
          paddingTop: Spacing.md,
          borderTopWidth: 1,
          borderTopColor: Colors.surfaceMuted,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <ThemedText
          style={{
            color: Colors.textSecondary,
            fontSize: 12,
          }}
        >
          {item._applicationCount}{' '}
          {item._applicationCount === 1 ? 'application' : 'applications'}
        </ThemedText>

        <Button
          label="View"
          onPress={() => router.push(`/opportunity/${item.id}/applications`)}
          variant="ghost"
          size="sm"
        />
      </View>
    </Card>
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
        No opportunities yet
      </ThemedText>
      <ThemedText
        style={{
          textAlign: 'center',
          color: Colors.textSecondary,
          marginBottom: Spacing.xl,
        }}
      >
        Post your first volunteer opportunity to connect with volunteers in your community.
      </ThemedText>
      <Button
        label="Post an Opportunity"
        onPress={() => setShowPostModal(true)}
        variant="primary"
        size="md"
      />
    </View>
  );

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <ThemedText style={{ marginTop: Spacing.md, color: Colors.textSecondary }}>
            Loading dashboard...
          </ThemedText>
        </View>
      </Screen>
    );
  }

  if (error || !charity) {
    return (
      <Screen padding="lg">
        <ThemedText
          type="h2"
          style={{
            marginBottom: Spacing.md,
            color: Colors.textPrimary,
          }}
        >
          Something went wrong
        </ThemedText>
        <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.xl }}>
          {error || 'Could not load your charity'}
        </ThemedText>
        <Button label="Try Again" onPress={fetchCharityAndOpportunities} />
      </Screen>
    );
  }

  return (
    <Screen scrollable padding="lg">
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.xl,
        }}
      >
        <ThemedText type="h1" style={{ color: Colors.textPrimary }}>
          Dashboard
        </ThemedText>
        <Button
          label="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          size="sm"
        />
      </View>

      {/* Charity Info Card */}
      <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.xl }}>
        <View style={{ marginBottom: Spacing.md }}>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.sm,
            }}
          >
            ORGANIZATION
          </ThemedText>
          <ThemedText
            type="h2"
            style={{
              color: Colors.textPrimary,
              marginBottom: Spacing.sm,
            }}
          >
            {charity.name}
          </ThemedText>
          {charity.verified && (
            <ThemedText style={{ color: Colors.primary, fontSize: 12, fontWeight: '600' }}>
              ✓ Verified
            </ThemedText>
          )}
          {!charity.verified && (
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              Pending verification
            </ThemedText>
          )}
        </View>

        {charity.description && (
          <View style={{ marginBottom: Spacing.md }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              {charity.description}
            </ThemedText>
          </View>
        )}

        {charity.address && (
          <View>
            <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
              📍 {charity.address}
            </ThemedText>
          </View>
        )}
      </Card>

      {/* Quick Stats */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.xl }}>
        <Card shadow="sm" padding="lg">
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.sm,
            }}
          >
            ACTIVE OPPORTUNITIES
          </ThemedText>
          <ThemedText
            type="h2"
            style={{
              color: Colors.textPrimary,
            }}
          >
            {opportunities.filter((o) => o.status === 'active').length}
          </ThemedText>
        </Card>

        <Card shadow="sm" padding="lg">
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.sm,
            }}
          >
            TOTAL APPLICATIONS
          </ThemedText>
          <ThemedText
            type="h2"
            style={{
              color: Colors.textPrimary,
            }}
          >
            {opportunities.reduce((sum, o) => sum + o._applicationCount, 0)}
          </ThemedText>
        </Card>
      </View>

      {/* Post Opportunity Button */}
      <Button
        label="Post an Opportunity"
        onPress={() => setShowPostModal(true)}
        variant="primary"
        size="lg"
        style={{ marginBottom: Spacing.xl }}
      />

      {/* Opportunities List */}
      {opportunities.length > 0 ? (
        <>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 12,
              marginBottom: Spacing.lg,
              fontWeight: '600',
            }}
          >
            YOUR OPPORTUNITIES
          </ThemedText>
          <FlatList
            data={opportunities}
            renderItem={renderOpportunityCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: Spacing.xxl }}
          />
        </>
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
          onSuccess={handlePostSuccess}
        />
      )}
    </Screen>
  );
}
