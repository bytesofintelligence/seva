import { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, Button, Input, Card } from '@/components/ui';
import { AvatarUpload } from '@/components/AvatarUpload';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { useAuth } from '@/context/auth-context';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

interface CharityProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  mission: string | null;
  description: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export default function OnboardingProfileCharityScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [charity, setCharity] = useState<CharityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [mission, setMission] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchCharity();
  }, []);

  const fetchCharity = async () => {
    if (!session?.user.id) return;

    try {
      setLoading(true);
      const { data } = await supabase
        .from('charities')
        .select('*')
        .eq('owner_id', session.user.id)
        .single();

      if (data) {
        setCharity(data);
        setName(data.name || '');
        setMission(data.mission || '');
        setDescription(data.description || '');
        setWebsite(data.website || '');
        setContactEmail(data.contact_email || '');
        setContactPhone(data.contact_phone || '');
        setAvatarUrl(data.avatar_url);
      }
    } catch (err) {
      console.error('Error fetching charity:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await haptics.light();
    // Navigate to main app without saving
    // The charity row already exists from signup, so this is valid
    router.replace('/(tabs)');
  };

  const handleSaveAndContinue = async () => {
    if (!charity?.id) {
      Alert.alert('Error', 'Charity information not found');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your organisation name');
      return;
    }

    try {
      setSaving(true);
      await haptics.medium();

      const { error: updateError } = await supabase
        .from('charities')
        .update({
          name: name.trim(),
          mission: mission.trim() || null,
          description: description.trim() || null,
          website: website.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
        })
        .eq('id', charity.id)
        .eq('owner_id', session?.user.id);

      if (updateError) throw updateError;

      // Mark profile as completed in profiles table
      await supabase
        .from('profiles')
        .update({ profile_completed: true })
        .eq('id', session?.user.id);

      await haptics.success();
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Error saving charity:', err);
      await haptics.warning();
      Alert.alert('Error', err?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdated = (newUrl: string) => {
    setAvatarUrl(newUrl);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
        <Screen padding="lg">
          <ThemedText type="h2" style={{ color: Colors.textSecondary }}>
            Loading...
          </ThemedText>
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.lg,
          gap: Spacing.xl,
        }}
      >
        {/* Header */}
        <View>
          <ThemedText
            type="h1"
            style={{
              marginBottom: Spacing.sm,
              color: Colors.textPrimary,
            }}
          >
            Welcome! 🏢
          </ThemedText>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Let's set up your charity profile. You can skip any step and fill it in later.
          </ThemedText>
        </View>

        {/* Progress indicator */}
        <View
          style={{
            flexDirection: 'row',
            gap: Spacing.sm,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flex: 1,
              height: 4,
              backgroundColor: Colors.primary,
              borderRadius: 2,
            }}
          />
          <View
            style={{
              flex: 1,
              height: 4,
              backgroundColor: Colors.border,
              borderRadius: 2,
            }}
          />
        </View>

        {/* Avatar Upload */}
        <Card shadow="md" padding="lg">
          <ThemedText
            type="h3"
            style={{
              marginBottom: Spacing.lg,
              textAlign: 'center',
              color: Colors.textPrimary,
            }}
          >
            Your logo (optional)
          </ThemedText>
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            fullName={name || 'Charity'}
            userId={session?.user.id || ''}
            onAvatarUpdated={handleAvatarUpdated}
          />
        </Card>

        {/* Form Fields */}
        <View style={{ gap: Spacing.lg }}>
          {/* Organisation Name */}
          <Input
            label="Organisation name"
            placeholder="Your charity or organisation"
            value={name}
            onChangeText={setName}
          />

          {/* Mission */}
          <Input
            label="Mission (optional)"
            placeholder="What's your mission?"
            value={mission}
            onChangeText={setMission}
            multiline
            numberOfLines={2}
          />

          {/* Description */}
          <Input
            label="Description (optional)"
            placeholder="Tell volunteers what you do"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          {/* Website */}
          <Input
            label="Website (optional)"
            placeholder="https://yourorganisation.org"
            value={website}
            onChangeText={setWebsite}
            keyboardType="url"
          />

          {/* Contact Email */}
          <Input
            label="Contact email (optional)"
            placeholder="contact@yourorganisation.org"
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
          />

          {/* Contact Phone */}
          <Input
            label="Contact phone (optional)"
            placeholder="Your phone number"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Action Buttons */}
        <View style={{ gap: Spacing.md }}>
          <Button
            label={saving ? 'Saving...' : 'Save and Continue'}
            onPress={handleSaveAndContinue}
            disabled={saving}
            variant="primary"
            size="lg"
          />
          <Button
            label="Skip for now"
            onPress={handleSkip}
            variant="ghost"
            size="lg"
          />
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
