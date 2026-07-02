import { Linking, Platform } from 'react-native';

// Open location in Google Maps
export const openGoogleMaps = (location: string) => {
  const encodedLocation = encodeURIComponent(location);
  const url = `https://maps.google.com/maps?q=${encodedLocation}`;
  Linking.openURL(url).catch(() => {
    console.error('Failed to open Google Maps');
  });
};

// Open location in Apple Maps (iOS) or fallback to Google Maps
export const openAppleMaps = (location: string) => {
  if (Platform.OS === 'ios') {
    const encodedLocation = encodeURIComponent(location);
    const url = `maps://maps.apple.com/?address=${encodedLocation}`;
    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps if Apple Maps not available
      openGoogleMaps(location);
    });
  } else {
    // On Android, use Google Maps
    openGoogleMaps(location);
  }
};

// Generate Google Maps Static API URL (requires API key)
// You'll need to set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your .env
export const getStaticMapUrl = (
  location: string,
  width: number = 400,
  height: number = 200,
): string => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return ''; // Return empty if no API key configured
  }

  const encodedLocation = encodeURIComponent(location);
  return `https://maps.googleapis.com/maps/api/staticmap?center=${encodedLocation}&zoom=14&size=${width}x${height}&markers=color:red%7C${encodedLocation}&key=${apiKey}`;
};
