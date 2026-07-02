import { View, TouchableOpacity, Image, Platform } from 'react-native';
import { ThemedText } from './themed-text';
import { Card } from './ui';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { openGoogleMaps, openAppleMaps, getStaticMapUrl } from '@/lib/maps';

interface LocationCardProps {
  location: string;
}

export const LocationCard = ({ location }: LocationCardProps) => {
  const mapUrl = getStaticMapUrl(location, 400, 200);

  return (
    <View style={{ gap: Spacing.md }}>
      <Card shadow="sm" padding="lg">
        <ThemedText
          style={{
            color: Colors.textSecondary,
            fontSize: 12,
            marginBottom: Spacing.sm,
            fontWeight: '600',
          }}
        >
          WHERE
        </ThemedText>
        <ThemedText
          style={{
            color: Colors.textPrimary,
            fontSize: 16,
            fontWeight: '600',
          }}
        >
          📍 {location}
        </ThemedText>
      </Card>

      {/* Static Map (if API key configured) */}
      {mapUrl && (
        <TouchableOpacity onPress={() => openGoogleMaps(location)}>
          <Card shadow="sm" padding="sm" style={{ overflow: 'hidden' }}>
            <Image
              source={{ uri: mapUrl }}
              style={{
                width: '100%',
                height: 200,
                borderRadius: BorderRadius.md,
              }}
            />
            <View
              style={{
                padding: Spacing.md,
                backgroundColor: Colors.primaryTintBg,
              }}
            >
              <ThemedText
                style={{
                  color: Colors.primary,
                  fontSize: 12,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                Tap to view full map
              </ThemedText>
            </View>
          </Card>
        </TouchableOpacity>
      )}

      {/* Buttons to open in maps */}
      <View
        style={{
          flexDirection: 'row',
          gap: Spacing.md,
        }}
      >
        <TouchableOpacity
          onPress={() => openGoogleMaps(location)}
          style={{
            flex: 1,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.md,
            backgroundColor: Colors.primaryTintBg,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
          }}
        >
          <ThemedText
            style={{
              color: Colors.primary,
              fontWeight: '600',
              fontSize: 13,
            }}
          >
            Google Maps
          </ThemedText>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            onPress={() => openAppleMaps(location)}
            style={{
              flex: 1,
              paddingVertical: Spacing.md,
              paddingHorizontal: Spacing.md,
              backgroundColor: Colors.border,
              borderRadius: BorderRadius.md,
              alignItems: 'center',
            }}
          >
            <ThemedText
              style={{
                color: Colors.textPrimary,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              Apple Maps
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
