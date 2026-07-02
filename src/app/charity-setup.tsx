import { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Button, Input, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

export default function CharitySetupScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgNameError, setOrgNameError] = useState('');

  const handleSetup = async () => {
    // Validation
    if (!orgName.trim()) {
      setOrgNameError('Organization name is required');
      return;
    }

    if (orgName.trim().length < 2) {
      setOrgNameError('Organization name must be at least 2 characters');
      return;
    }

    if (!session?.user.id) {
      setError('You must be logged in to create a charity');
      return;
    }

    setLoading(true);
    setError(null);
    setOrgNameError('');

    try {
      // Insert charity with owner_id set to the current user's profile ID
      const { error: insertError, data } = await supabase
        .from('charities')
        .insert({
          owner_id: session.user.id,
          name: orgName.trim(),
          description: description.trim() || null,
          address: address.trim() || null,
        })
        .select();

      if (insertError) {
        throw insertError;
      }

      if (!data || data.length === 0) {
        throw new Error('Failed to create charity');
      }

      // Navigate to charity dashboard
      router.replace('/charity-dashboard');
    } catch (err: any) {
      console.error('Error creating charity:', err);
      const errorMsg = err?.message || 'Failed to create charity';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scrollable padding="lg">
      {/* Header */}
      <View style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="h1" style={{ marginBottom: Spacing.md, color: Colors.textPrimary }}>
          Welcome to SEVA
        </ThemedText>
        <ThemedText
          style={{
            color: Colors.textSecondary,
            fontSize: 16,
            lineHeight: 24,
          }}
        >
          Let's set up your organization so volunteers can find and apply for your opportunities.
        </ThemedText>
      </View>

      {/* Info Card */}
      <Card shadow="md" padding="lg" style={{ marginBottom: Spacing.xl }}>
        <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.md }}>
          You're registered as a charity. Please complete your organization profile.
        </ThemedText>
        <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
          You can edit these details later from your dashboard.
        </ThemedText>
      </Card>

      {/* Form */}
      <View style={{ gap: Spacing.lg, marginBottom: Spacing.xl }}>
        <Input
          label="Organization Name *"
          placeholder="e.g., Green City Foundation"
          value={orgName}
          onChangeText={(text) => {
            setOrgName(text);
            if (text.trim().length >= 2) {
              setOrgNameError('');
            }
          }}
          error={orgNameError}
          editable={!loading}
        />

        <Input
          label="Description"
          placeholder="What does your organization do? (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          editable={!loading}
        />

        <Input
          label="Address"
          placeholder="Your organization's address (optional)"
          value={address}
          onChangeText={setAddress}
          editable={!loading}
        />
      </View>

      {/* Error Message */}
      {error && (
        <Card
          shadow="md"
          padding="lg"
          backgroundColor={Colors.category.coral.text}
          style={{ marginBottom: Spacing.lg }}
        >
          <ThemedText style={{ color: Colors.cardBg }}>
            {error}
          </ThemedText>
        </Card>
      )}

      {/* Submit Button */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.xl }}>
        <Button
          label={loading ? 'Setting up...' : 'Create Organization'}
          onPress={handleSetup}
          disabled={loading}
          variant="primary"
          size="lg"
        />

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: Spacing.md }}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}
      </View>

      {/* Helper Text */}
      <ThemedText
        style={{
          textAlign: 'center',
          color: Colors.textSecondary,
          fontSize: 12,
        }}
      >
        This creates your organization profile on SEVA. You'll be able to post opportunities and manage volunteer applications after this.
      </ThemedText>
    </Screen>
  );
}
