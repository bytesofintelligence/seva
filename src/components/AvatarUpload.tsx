import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import { ThemedText } from "@/components/themed-text";
import { BorderRadius, Colors, Spacing } from "@/constants/design-tokens";
import { useAuth } from "@/context/auth-context";
import { haptics } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  fullName?: string | null;
  userId: string;
  onAvatarUpdated: (publicUrl: string) => void;
}

export function AvatarUpload({
  currentAvatarUrl,
  fullName,
  userId,
  onAvatarUpdated,
}: AvatarUploadProps) {
  const { markProfileUpdated } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "SEVA needs access to your photo library to upload a profile picture.",
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    try {
      setError(null);
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.uri) return;

      await uploadAvatar(asset.uri);
    } catch (err) {
      console.error("Error picking image:", err);
      setError("Failed to pick image");
      await haptics.warning();
    }
  };

  const uploadAvatar = async (imageUri: string) => {
    try {
      setUploading(true);
      setError(null);
      await haptics.medium();

      console.log("Avatar upload starting with userId:", userId);

      const imageFile = new File(imageUri);
      const extension = imageFile.extension.replace(/^\./, "") || "jpg";
      const uploadPath = `${userId}/avatar-${Date.now()}.${extension}`;

      console.log("Uploading to path:", uploadPath);

      // Upload to Supabase Storage
      // Path: avatars/{user_id}/{uniqueFileName}
      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(uploadPath, imageFile, {
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const avatarPath = uploadPath;

      // Save the storage path to profiles table
      console.log("Saving avatar path:", { userId, avatarPath });

      const { data: updateData, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarPath })
        .eq("id", userId)
        .select();

      console.log("Update response:", { updateData, updateError });

      if (updateError) {
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error(
          "No profile row found to update. Update may have been blocked by RLS.",
        );
      }

      await haptics.success();
      markProfileUpdated();
      onAvatarUpdated(avatarPath);
    } catch (err: any) {
      console.error("Error uploading avatar:", err);
      setError(err?.message || "Failed to upload avatar");
      await haptics.warning();
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ alignItems: "center", gap: Spacing.md }}>
      <TouchableOpacity
        onPress={pickImage}
        disabled={uploading}
        style={{
          position: "relative",
        }}
      >
        <AvatarDisplay
          avatarUrl={currentAvatarUrl}
          fullName={fullName}
          size="lg"
        />
        {uploading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.3)",
              borderRadius: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator color={Colors.cardBg} size="small" />
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={pickImage}
        disabled={uploading}
        style={{
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          backgroundColor: Colors.primaryTintBg,
          borderRadius: BorderRadius.md,
        }}
      >
        <ThemedText
          style={{
            color: Colors.primary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {uploading ? "Uploading..." : "Change photo"}
        </ThemedText>
      </TouchableOpacity>

      {error && (
        <ThemedText style={{ color: Colors.category.coral.text, fontSize: 12 }}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}
