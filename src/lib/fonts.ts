import * as Font from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

export async function loadFonts() {
  try {
    await Font.loadAsync({
      'Inter-Regular': Inter_400Regular,
      'Inter-Medium': Inter_500Medium,
      'Inter-SemiBold': Inter_600SemiBold,
    });
  } catch (err) {
    console.error('Failed to load fonts:', err);
    throw err;
  }
}
