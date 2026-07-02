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
  operating_areas?: string | null;
  how_it_works?: string | null;
  key_services?: string | null;
  volunteer_requirements?: string | null;
}

export default function EditProfileCharityScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [charity, setCharity] = useState<CharityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [mission, setMission] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [operatingAreas, setOperatingAreas] = useState('');
  const [howItWorks, setHowItWorks] = useState('');
  const [keyServices, setKeyServices] = useState('');
  const [volunteerRequirements, setVolunteerRequirements] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchCharity();
  }, []);

  const fetchCharity = async () => {
    if (!session?.user.id) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch charity owned by this user
      const { data, error: fetchError } = await supabase
        .from('charities')
        .select('id, name, avatar_url, mission, description, website, contact_email, contact_phone, operating_areas, how_it_works, key_services, volunteer_requirements')
        .eq('owner_id', session.user.id)
        .single();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Charity not found');
        return;
      }

      setCharity(data);
      setName(data.name || '');
      setMission(data.mission || '');
      setDescription(data.description || '');
      setWebsite(data.website || '');
      setContactEmail(data.contact_email || '');
      setContactPhone(data.contact_phone || '');
      setOperatingAreas(data.operating_areas || '');
      setHowItWorks(data.how_it_works || '');
      setKeyServices(data.key_services || '');
      setVolunteerRequirements(data.volunteer_requirements || '');
      setAvatarUrl(data.avatar_url);
    } catch (err: any) {
      console.error('Error fetching charity:', err);
      setError(err?.message || 'Failed to load charity profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!session?.user.id || !charity?.id) {
      setError('Unable to save: missing charity information');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your organisation name');
      return;
    }

    try {
      setSaving(true);
      setError(null);
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
          operating_areas: operatingAreas.trim() || null,
          how_it_works: howItWorks.trim() || null,
          key_services: keyServices.trim() || null,
          volunteer_requirements: volunteerRequirements.trim() || null,
        })
        .eq('id', charity.id)
        .eq('owner_id', session.user.id);

      if (updateError) throw updateError;

      // Mark profile as completed
      await supabase
        .from('profiles')
        .update({ profile_completed: true })
        .eq('id', session.user.id);

      await haptics.success();
      Alert.alert('✓ Saved', 'Your charity profile has been updated');
      router.back();
    } catch (err: any) {
      console.error('Error saving charity:', err);
      setError(err?.message || 'Failed to save profile');
      await haptics.warning();
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdated = async (newUrl: string) => {
    setAvatarUrl(newUrl);
    // Also update the charity's avatar_url in the database
    if (charity?.id && session?.user.id) {
      try {
        await supabase
          .from('charities')
          .update({ avatar_url: newUrl })
          .eq('id', charity.id)
          .eq('owner_id', session.user.id);
      } catch (err) {
        console.error('Error updating avatar in DB:', err);
      }
    }
  };

  const handleSignOut = async () => {
    await haptics.medium();
    await signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.pageBg }}>
        <Screen>
          <ThemedText type="h2" style={{ color: Colors.textSecondary }}>
            Loading...
          </ThemedText>
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.lg,
          gap: Spacing.xl,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: Spacing.lg,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
              ← Back
            </ThemedText>
          </TouchableOpacity>
          <ThemedText
            type="h3"
            style={{
              flex: 1,
              marginLeft: Spacing.md,
              color: Colors.textPrimary,
            }}
          >
            Edit Profile
          </ThemedText>
        </View>

        {/* Avatar Upload */}
        <Card padding="lg">
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

          {/* Operating Areas */}
          <Input
            label="Where you operate (optional)"
            placeholder="e.g., London, UK; Manchester, UK; Online"
            value={operatingAreas}
            onChangeText={setOperatingAreas}
            multiline
            numberOfLines={2}
          />

          {/* How It Works */}
          <Input
            label="How it works (optional)"
            placeholder="Describe your operational process and what volunteers will do"
            value={howItWorks}
            onChangeText={setHowItWorks}
            multiline
            numberOfLines={3}
          />

          {/* Key Services */}
          <Input
            label="Key services (optional)"
            placeholder="e.g., Food distribution, Community support, Mentoring, Training"
            value={keyServices}
            onChangeText={setKeyServices}
            multiline
            numberOfLines={2}
          />

          {/* Volunteer Requirements */}
          <Input
            label="Volunteer requirements (optional)"
            placeholder="Any training, experience, or skills needed? DBS check? Age restrictions?"
            value={volunteerRequirements}
            onChangeText={setVolunteerRequirements}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Error Message */}
        {error && (
          <View
            style={{
              backgroundColor: Colors.category.coral.text,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
              borderRadius: BorderRadius.md,
            }}
          >
            <ThemedText style={{ color: Colors.cardBg, fontSize: 12 }}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* Save Button */}
        <Button
          label={saving ? 'Saving...' : 'Save Profile'}
          onPress={handleSaveProfile}
          disabled={saving}
          variant="primary"
          size="lg"
        />

        {/* Sign Out Button */}
        <Button
          label="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          size="lg"
        />

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
