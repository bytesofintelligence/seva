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

interface VolunteerProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  can_drive: boolean;
  can_drive_van: boolean;
  can_collect_and_deliver: boolean;
  profile_completed: boolean;
}

export default function OnboardingProfileVolunteerScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [canDrive, setCanDrive] = useState(false);
  const [canDriveVan, setCanDriveVan] = useState(false);
  const [canCollectDeliver, setCanCollectDeliver] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!session?.user.id) return;

    try {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setProfile(data);
        setFullName(data.full_name || '');
        setBio(data.bio || '');
        setLocation(data.location || '');
        setCanDrive(data.can_drive || false);
        setCanDriveVan(data.can_drive_van || false);
        setCanCollectDeliver(data.can_collect_and_deliver || false);
        setAvatarUrl(data.avatar_url);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await haptics.light();
    // Navigate to main app without saving
    // The profile already exists from the trigger, so this is valid
    router.replace('/(tabs)');
  };

  const handleSaveAndContinue = async () => {
    if (!session?.user.id || !fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name');
      return;
    }

    try {
      setSaving(true);
      await haptics.medium();

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          can_drive: canDrive,
          can_drive_van: canDriveVan,
          can_collect_and_deliver: canCollectDeliver,
          profile_completed: true, // Mark onboarding as complete
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      await haptics.success();
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Error saving profile:', err);
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
            Welcome! 🌱
          </ThemedText>
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Let's set up your volunteer profile. You can skip any step and fill it in later.
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
            Your photo (optional)
          </ThemedText>
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            fullName={fullName || 'Volunteer'}
            userId={session?.user.id || ''}
            onAvatarUpdated={handleAvatarUpdated}
          />
        </Card>

        {/* Form Fields */}
        <View style={{ gap: Spacing.lg }}>
          {/* Full Name */}
          <Input
            label="Full name"
            placeholder="Your name"
            value={fullName}
            onChangeText={setFullName}
          />

          {/* Bio */}
          <Input
            label="Bio (optional)"
            placeholder="Tell charities about yourself"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
          />

          {/* Location */}
          <Input
            label="Location (optional)"
            placeholder="e.g., Harrow, London"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        {/* Driving Capabilities */}
        <Card shadow="sm" padding="lg">
          <ThemedText
            type="h3"
            style={{
              marginBottom: Spacing.lg,
              color: Colors.textPrimary,
            }}
          >
            What can you help with? (optional)
          </ThemedText>

          <View style={{ gap: Spacing.md }}>
            {/* Can Drive Toggle */}
            <TouchableOpacity
              onPress={() => setCanDrive(!canDrive)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: Spacing.sm,
              }}
            >
              <ThemedText style={{ color: Colors.textPrimary }}>
                I can drive
              </ThemedText>
              <View
                style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: canDrive ? Colors.primary : Colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: Colors.cardBg,
                    marginLeft: canDrive ? 24 : 0,
                  }}
                />
              </View>
            </TouchableOpacity>

            {/* Can Drive Van Toggle */}
            <TouchableOpacity
              onPress={() => setCanDriveVan(!canDriveVan)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: Spacing.sm,
              }}
            >
              <ThemedText style={{ color: Colors.textPrimary }}>
                I can drive a van
              </ThemedText>
              <View
                style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: canDriveVan ? Colors.primary : Colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: Colors.cardBg,
                    marginLeft: canDriveVan ? 24 : 0,
                  }}
                />
              </View>
            </TouchableOpacity>

            {/* Can Collect & Deliver Toggle */}
            <TouchableOpacity
              onPress={() => setCanCollectDeliver(!canCollectDeliver)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: Spacing.sm,
              }}
            >
              <ThemedText style={{ color: Colors.textPrimary, flex: 1 }}>
                I'm willing to collect items and deliver to the charity
              </ThemedText>
              <View
                style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: canCollectDeliver
                    ? Colors.primary
                    : Colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: Colors.cardBg,
                    marginLeft: canCollectDeliver ? 24 : 0,
                  }}
                />
              </View>
            </TouchableOpacity>
          </View>
        </Card>

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
