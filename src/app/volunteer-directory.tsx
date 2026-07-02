import { useState, useEffect, useCallback } from 'react';
import { View, FlatList, TouchableOpacity, Text, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, ArrowLeft, CheckCircle2 } from 'lucide-react-native';

import { Screen, Card, Button } from '@/components/ui';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { Spacing, Colors, BorderRadius, Typography, Layout } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface VolunteerProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  volunteer_id: string;
  bio: string | null;
  location: string | null;
  can_drive: boolean;
  can_drive_van: boolean;
  can_collect_and_deliver: boolean;
}

export default function VolunteerDirectoryScreen() {
  const router = useRouter();
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [filteredVolunteers, setFilteredVolunteers] = useState<VolunteerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchVolunteers();
    }, [])
  );

  const fetchVolunteers = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, volunteer_id, bio, location, can_drive, can_drive_van, can_collect_and_deliver')
        .eq('role', 'volunteer')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setVolunteers(data || []);
      setFilteredVolunteers(data || []);
    } catch (err) {
      console.error('Error fetching volunteers:', err);
      setError('Failed to load volunteers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredVolunteers(volunteers);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = volunteers.filter((v) => {
        const matchesId = v.volunteer_id?.toLowerCase().includes(query);
        const matchesName = v.full_name?.toLowerCase().includes(query);
        const matchesLocation = v.location?.toLowerCase().includes(query);
        return matchesId || matchesName || matchesLocation;
      });
      setFilteredVolunteers(filtered);
    }
  }, [searchQuery, volunteers]);

  const renderVolunteerCard = ({ item }: { item: VolunteerProfile }) => (
    <TouchableOpacity
      onPress={() => router.push(`/volunteer/${item.id}`)}
      activeOpacity={0.7}
    >
      <Card padding="md" style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
          {/* Avatar */}
          <AvatarDisplay
            avatarUrl={item.avatar_url}
            fullName={item.full_name}
            size="md"
          />

          {/* Info */}
          <View style={{ flex: 1 }}>
            {/* Name + ID */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs }}>
              <Text style={[Typography.cardTitle, { color: Colors.textPrimary, flex: 1 }]}>
                {item.full_name || 'Unnamed'}
              </Text>
              <CheckCircle2 size={16} color={Colors.primary} strokeWidth={2} />
            </View>

            {/* Volunteer ID */}
            <Text style={[Typography.meta, { color: Colors.textTertiary, marginBottom: Spacing.sm, fontFamily: 'Courier New' }]}>
              ID: {item.volunteer_id}
            </Text>

            {/* Bio */}
            {item.bio && (
              <Text
                style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}
                numberOfLines={2}
              >
                {item.bio}
              </Text>
            )}

            {/* Location */}
            {item.location && (
              <Text style={[Typography.meta, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                📍 {item.location}
              </Text>
            )}

            {/* Skills */}
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
              {item.can_drive && (
                <View
                  style={{
                    backgroundColor: Colors.category.blue.bg,
                    paddingHorizontal: Spacing.sm,
                    paddingVertical: 2,
                    borderRadius: BorderRadius.sm,
                  }}
                >
                  <Text style={[Typography.badge, { color: Colors.category.blue.text }]}>
                    Drives
                  </Text>
                </View>
              )}
              {item.can_drive_van && (
                <View
                  style={{
                    backgroundColor: Colors.category.blue.bg,
                    paddingHorizontal: Spacing.sm,
                    paddingVertical: 2,
                    borderRadius: BorderRadius.sm,
                  }}
                >
                  <Text style={[Typography.badge, { color: Colors.category.blue.text }]}>
                    Van Driver
                  </Text>
                </View>
              )}
              {item.can_collect_and_deliver && (
                <View
                  style={{
                    backgroundColor: Colors.category.coral.bg,
                    paddingHorizontal: Spacing.sm,
                    paddingVertical: 2,
                    borderRadius: BorderRadius.sm,
                  }}
                >
                  <Text style={[Typography.badge, { color: Colors.category.coral.text }]}>
                    Collects & Delivers
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xl * 2,
      }}
    >
      <Text style={[Typography.screenTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
        No volunteers found
      </Text>
      <Text
        style={{
          textAlign: 'center',
          ...Typography.body,
          color: Colors.textSecondary,
        }}
      >
        {searchQuery ? 'Try adjusting your search' : 'Volunteers will appear here'}
      </Text>
    </View>
  );

  return (
    <Screen scrollable={false} padding="lg">
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: Spacing.lg,
          gap: Spacing.md,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[Typography.screenTitle, { color: Colors.textPrimary }]}>
          Volunteer Directory
        </Text>
      </View>

      {/* Search Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: Colors.surfaceMuted,
          borderRadius: BorderRadius.md,
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.lg,
          height: 44,
        }}
      >
        <Search size={18} color={Colors.textTertiary} strokeWidth={1.5} />
        <TextInput
          placeholder="Search by ID, name, or location"
          placeholderTextColor={Colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            flex: 1,
            marginLeft: Spacing.sm,
            ...Typography.body,
            color: Colors.textPrimary,
          }}
        />
      </View>

      {/* Content */}
      {error && (
        <Card padding="md" style={{ marginBottom: Spacing.lg }}>
          <Text style={{ color: Colors.category.coral.text, marginBottom: Spacing.md }}>
            {error}
          </Text>
          <Button label="Retry" onPress={fetchVolunteers} variant="primary" />
        </Card>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredVolunteers}
          renderItem={renderVolunteerCard}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
          ListEmptyComponent={renderEmptyState()}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Spacing.xl,
          }}
        />
      )}
    </Screen>
  );
}
