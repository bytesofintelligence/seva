import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/design-tokens";
import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";

interface AvatarDisplayProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  size?: "sm" | "md" | "lg";
}

export function AvatarDisplay({
  avatarUrl,
  fullName,
  size = "md",
}: AvatarDisplayProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(
    null,
  );

  const sizeMap = {
    sm: { width: 40, height: 40, fontSize: 12 },
    md: { width: 56, height: 56, fontSize: 14 },
    lg: { width: 80, height: 80, fontSize: 18 },
  };

  const dimensions = sizeMap[size];

  const getInitials = () => {
    if (!fullName) return "?";
    return fullName
      .split(" ")
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const showImage = Boolean(resolvedAvatarUrl) && !imageFailed;

  useEffect(() => {
    let isMounted = true;

    const resolveAvatar = async () => {
      setImageFailed(false);

      if (!avatarUrl) {
        setResolvedAvatarUrl(null);
        return;
      }

      if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
        setResolvedAvatarUrl(avatarUrl);
        return;
      }

      const { data } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarUrl, 60 * 60);

      if (isMounted) {
        setResolvedAvatarUrl(data?.signedUrl ?? null);
      }
    };

    resolveAvatar().catch((err) => {
      console.error("Error resolving avatar URL:", err);
      setResolvedAvatarUrl(null);
    });

    return () => {
      isMounted = false;
    };
  }, [avatarUrl]);

  return (
    <View
      style={{
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: dimensions.width / 2,
        backgroundColor: Colors.primaryTintBg,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: resolvedAvatarUrl || avatarUrl || undefined }}
          style={{ width: dimensions.width, height: dimensions.height }}
          contentFit="cover"
          transition={150}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ThemedText
          style={{
            fontSize: dimensions.fontSize,
            fontWeight: "600",
            color: Colors.primary,
          }}
        >
          {getInitials()}
        </ThemedText>
      )}
    </View>
  );
}
