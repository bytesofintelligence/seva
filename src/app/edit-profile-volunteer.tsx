import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AvatarUpload } from "@/components/AvatarUpload";
import { SevaIdModal } from "@/components/SevaIdModal";
import { ThemedText } from "@/components/themed-text";
import { Button, Card, Input, Screen } from "@/components/ui";
import { BorderRadius, Colors, Spacing } from "@/constants/design-tokens";
import { useAuth } from "@/context/auth-context";
import { haptics } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";

interface VolunteerProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  can_drive: boolean;
  can_drive_van: boolean;
  can_collect_and_deliver: boolean;
}

export default function EditProfileVolunteerScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [canDrive, setCanDrive] = useState(false);
  const [canDriveVan, setCanDriveVan] = useState(false);
  const [canCollectDeliver, setCanCollectDeliver] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showSevaId, setShowSevaId] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!session?.user.id) {
      return;
    }

    fetchProfile();
  }, [session?.user.id]);

  const fetchProfile = async () => {
    if (!session?.user.id) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, phone, avatar_url, bio, location, can_drive, can_drive_van, can_collect_and_deliver",
        )
        .eq("id", session.user.id)
        .single();

      if (fetchError) throw fetchError;

      setProfile(data);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setBio(data.bio || "");
      setLocation(data.location || "");
      setCanDrive(data.can_drive || false);
      setCanDriveVan(data.can_drive_van || false);
      setCanCollectDeliver(data.can_collect_and_deliver || false);
      setAvatarUrl(data.avatar_url);
    } catch (err: any) {
      console.error("Error fetching profile:", err);
      setError(err?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!session?.user.id || !fullName.trim()) {
      Alert.alert("Required", "Please enter your full name");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await haptics.medium();

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          can_drive: canDrive,
          can_drive_van: canDriveVan,
          can_collect_and_deliver: canCollectDeliver,
          profile_completed: true,
        })
        .eq("id", session.user.id);

      if (updateError) throw updateError;

      await haptics.success();
      Alert.alert("✓ Saved", "Your profile has been updated");
      router.back();
    } catch (err: any) {
      console.error("Error saving profile:", err);
      setError(err?.message || "Failed to save profile");
      await haptics.warning();
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdated = (newUrl: string) => {
    setAvatarUrl(newUrl);
  };

  const handleSignOut = async () => {
    await haptics.medium();
    await signOut();
    router.replace('/login');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone.\n\nAll your applications and signups will be automatically withdrawn.',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Delete My Account',
          onPress: confirmDeleteAccount,
          style: 'destructive',
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      await haptics.medium();

      if (!session?.user.id) {
        Alert.alert('Error', 'Unable to delete account');
        setIsDeleting(false);
        return;
      }

      // Call the RPC function to delete the account completely
      // This function withdraws all applications, deletes the profile, and deletes the auth user
      const { data, error: rpcError } = await supabase.rpc('delete_volunteer_account');

      if (rpcError) {
        throw rpcError;
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to delete account');
      }

      // Sign out and redirect
      await haptics.success();
      await signOut();
      router.replace('/login');

      Alert.alert('Account Deleted', 'Your account and all associated data have been permanently deleted.');
    } catch (err: any) {
      console.error('Error deleting account:', err);
      setIsDeleting(false);
      await haptics.warning();
      Alert.alert(
        'Error',
        err?.message || 'Failed to delete account. Please try again.'
      );
    }
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: Spacing.lg,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText
              style={{ color: Colors.primary, fontSize: 16 }}
            >
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
        <Card shadow="md" padding="lg">
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            fullName={fullName || "Volunteer"}
            userId={session?.user.id || ""}
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

          {/* Phone */}
          <Input
            label="Phone (optional)"
            placeholder="Your phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
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
            What can you help with?
          </ThemedText>

          <View style={{ gap: Spacing.md }}>
            {/* Can Drive Toggle */}
            <TouchableOpacity
              onPress={() => {
                setCanDrive(!canDrive);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
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
                  backgroundColor: canDrive
                    ? Colors.primary
                    : Colors.border,
                  justifyContent: "center",
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
              onPress={() => {
                setCanDriveVan(!canDriveVan);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
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
                  backgroundColor: canDriveVan
                    ? Colors.primary
                    : Colors.border,
                  justifyContent: "center",
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
              onPress={() => {
                setCanCollectDeliver(!canCollectDeliver);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
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
                  justifyContent: "center",
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

        {/* View SEVA ID Button */}
        <Button
          label="View SEVA ID"
          onPress={() => setShowSevaId(true)}
          variant="ghost"
          size="lg"
        />

        {/* Save Button */}
        <Button
          label={saving ? "Saving..." : "Save Profile"}
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

        {/* Delete Account Button - Small text link style */}
        <View style={{ marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: '#FFE5E5' }}>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={isDeleting}
            style={{ paddingVertical: Spacing.md }}
          >
            <ThemedText
              style={{
                textAlign: 'center',
                color: '#D85A30',
                fontSize: 13,
                fontWeight: '500',
              }}
            >
              {isDeleting ? 'Deleting account...' : 'Delete account'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* SEVA ID Modal */}
      <SevaIdModal
        visible={showSevaId}
        userId={session?.user.id || ""}
        fullName={fullName}
        avatarUrl={avatarUrl}
        onClose={() => setShowSevaId(false)}
      />
    </SafeAreaView>
  );
}
