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
import { withRoleGuard } from '@/components/auth/RoleGate';

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
  charity_reg_status?: string | null;
  charity_number?: string | null;
  charity_country?: string | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  facebook_url?: string | null;
  bank_account_name?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
}

function formatSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].filter(Boolean);
  return parts.join('-');
}

type CharityRegStatus = 'uk-registered' | 'international' | 'not-registered' | null;

function EditProfileCharityScreen() {
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
  const [charityRegStatus, setCharityRegStatus] = useState<CharityRegStatus>(null);
  const [charityNumber, setCharityNumber] = useState('');
  const [charityCountry, setCharityCountry] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

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
        .select('id, name, avatar_url, mission, description, website, contact_email, contact_phone, operating_areas, how_it_works, key_services, volunteer_requirements, charity_reg_status, charity_number, charity_country, instagram_handle, twitter_handle, facebook_url, bank_account_name, bank_sort_code, bank_account_number')
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
      setCharityRegStatus((data.charity_reg_status || null) as CharityRegStatus);
      setCharityNumber(data.charity_number || '');
      setCharityCountry(data.charity_country || '');
      setInstagramHandle(data.instagram_handle || '');
      setTwitterHandle(data.twitter_handle || '');
      setFacebookUrl(data.facebook_url || '');
      setBankAccountName(data.bank_account_name || '');
      setBankSortCode(data.bank_sort_code || '');
      setBankAccountNumber(data.bank_account_number || '');
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

    const bankFieldsTouched = bankAccountName.trim() || bankSortCode.trim() || bankAccountNumber.trim();
    if (bankFieldsTouched) {
      if (!bankAccountName.trim()) {
        Alert.alert('Bank details incomplete', 'Please enter the account name');
        return;
      }
      if (!/^\d{2}-\d{2}-\d{2}$/.test(bankSortCode)) {
        Alert.alert('Bank details incomplete', 'Sort code must be 6 digits (formatted as 00-00-00)');
        return;
      }
      if (!/^\d{8}$/.test(bankAccountNumber)) {
        Alert.alert('Bank details incomplete', 'Account number must be exactly 8 digits');
        return;
      }
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
          charity_reg_status: charityRegStatus || null,
          charity_number: (charityRegStatus && charityNumber.trim()) ? charityNumber.trim() : null,
          charity_country: (charityRegStatus === 'international' && charityCountry.trim()) ? charityCountry.trim() : null,
          instagram_handle: instagramHandle.trim() || null,
          twitter_handle: twitterHandle.trim() || null,
          facebook_url: facebookUrl.trim() || null,
          bank_account_name: bankAccountName.trim() || null,
          bank_sort_code: bankSortCode.trim() || null,
          bank_account_number: bankAccountNumber.trim() || null,
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

          {/* Charity Registration Status */}
          <View>
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontSize: 13,
                fontWeight: '500',
                marginBottom: Spacing.sm,
              }}
            >
              Are you a registered charity? (optional)
            </ThemedText>
            <View style={{ gap: Spacing.xs }}>
              {(['uk-registered', 'international', 'not-registered'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  onPress={() => setCharityRegStatus(status)}
                  style={{
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    borderRadius: BorderRadius.md,
                    backgroundColor:
                      charityRegStatus === status
                        ? Colors.primary
                        : Colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor:
                      charityRegStatus === status
                        ? Colors.primary
                        : Colors.border,
                  }}
                >
                  <ThemedText
                    style={{
                      color:
                        charityRegStatus === status
                          ? Colors.cardBg
                          : Colors.textPrimary,
                      fontWeight: charityRegStatus === status ? '600' : '500',
                      textAlign: 'center',
                      fontSize: 13,
                    }}
                  >
                    {status === 'uk-registered'
                      ? 'UK Registered'
                      : status === 'international'
                        ? 'International'
                        : 'Not Registered'}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Charity Number (conditionally shown) */}
          {charityRegStatus && (
            <Input
              label={
                charityRegStatus === 'uk-registered'
                  ? 'Charity Number (optional)'
                  : 'Charity Registration Number (optional)'
              }
              placeholder={
                charityRegStatus === 'uk-registered'
                  ? 'e.g., 1234567'
                  : 'e.g., ABC123456'
              }
              value={charityNumber}
              onChangeText={setCharityNumber}
            />
          )}

          {/* Country (conditionally shown for international) */}
          {charityRegStatus === 'international' && (
            <Input
              label="Country (optional)"
              placeholder="e.g., Canada, Australia"
              value={charityCountry}
              onChangeText={setCharityCountry}
            />
          )}

          {/* Social Media Section */}
          <View style={{ marginTop: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                fontWeight: '600',
                marginBottom: Spacing.md,
                textTransform: 'uppercase',
              }}
            >
              Social Media (optional)
            </ThemedText>

            {/* Instagram */}
            <Input
              label="Instagram Handle"
              placeholder="e.g., oxfam (without @)"
              value={instagramHandle}
              onChangeText={setInstagramHandle}
            />

            {/* Twitter */}
            <Input
              label="Twitter Handle"
              placeholder="e.g., oxfam (without @)"
              value={twitterHandle}
              onChangeText={setTwitterHandle}
            />

            {/* Facebook */}
            <Input
              label="Facebook URL"
              placeholder="e.g., https://facebook.com/oxfam"
              value={facebookUrl}
              onChangeText={setFacebookUrl}
              keyboardType="url"
            />
          </View>

          {/* Bank Details Section */}
          <View style={{ marginTop: Spacing.lg }}>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 11,
                fontWeight: '600',
                marginBottom: Spacing.md,
                textTransform: 'uppercase',
              }}
            >
              Bank details (for sponsorship transfers)
            </ThemedText>

            <Input
              label="Account name"
              placeholder="e.g., Jalaram Kitchen Ltd"
              value={bankAccountName}
              onChangeText={setBankAccountName}
            />

            <Input
              label="Sort code"
              placeholder="00-00-00"
              value={bankSortCode}
              onChangeText={(text) => setBankSortCode(formatSortCode(text))}
              keyboardType="number-pad"
              maxLength={8}
            />

            <Input
              label="Account number"
              placeholder="12345678"
              value={bankAccountNumber}
              onChangeText={(text) => setBankAccountNumber(text.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>
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

        {/* Change Password */}
        <Button
          label="Change Password"
          onPress={() => router.push('/change-password')}
          variant="ghost"
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

// Coordinator-only route. RLS in Postgres is the real boundary; this stops
// the screen rendering at all for a volunteer who reaches it by deep link.
export default withRoleGuard(EditProfileCharityScreen, 'charity');
