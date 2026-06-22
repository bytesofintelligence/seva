import { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

interface Opportunity {
  id: string;
  title: string;
  location: string;
  description: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from('opportunities')
        .select('id, title, location, description')
        .order('created_at', { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }

      setOpportunities(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch opportunities');
      console.error('Error fetching opportunities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const renderOpportunity = ({ item }: { item: Opportunity }) => (
    <ThemedView style={styles.opportunityCard}>
      <ThemedText style={styles.title}>{item.title}</ThemedText>
      <ThemedText style={styles.location}>📍 {item.location}</ThemedText>
      <ThemedText style={styles.description}>{item.description}</ThemedText>
    </ThemedView>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyTitle}>No Opportunities Yet</ThemedText>
      <ThemedText style={styles.emptyMessage}>
        Check back later or contact us to add one.
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Opportunities</ThemedText>
          <TouchableOpacity style={styles.signoutButton} onPress={handleSignOut}>
            <ThemedText style={styles.signoutText}>Sign Out</ThemedText>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchOpportunities}
            >
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <ThemedText style={styles.loadingText}>
              Loading opportunities...
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={opportunities}
            renderItem={renderOpportunity}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmpty}
            scrollEnabled={true}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  signoutButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#ff3b30',
    borderRadius: Spacing.two,
  },
  signoutText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  listContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  opportunityCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  location: {
    fontSize: 14,
    marginBottom: Spacing.two,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#c62828',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignSelf: 'flex-start',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyMessage: {
    fontSize: 14,
    textAlign: 'center',
  },
});
