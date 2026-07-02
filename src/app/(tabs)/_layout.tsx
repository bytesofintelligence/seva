import { Stack } from 'expo-router';
import { View, ActivityIndicator, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth-context';
import { Colors } from '@/constants/theme';
import CustomTabBar from '@/components/custom-tab-bar';
import { VOLUNTEER_TABS } from '@/components/volunteer-tabs';
import { CHARITY_TABS } from '@/components/charity-tabs';

export default function TabsLayout() {
  const { role, roleLoading } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const insets = useSafeAreaInsets();

  // Show loading while fetching role
  if (roleLoading || !role) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const tabs = role === 'charity' ? CHARITY_TABS : VOLUNTEER_TABS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack screenOptions={{ headerShown: false }} />
      <CustomTabBar tabs={tabs} bottomInset={insets.bottom} />
    </View>
  );
}
