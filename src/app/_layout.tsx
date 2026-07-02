import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { loadFonts } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { session, loading, role, roleLoading } = useAuth();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [routeReady, setRouteReady] = useState(false);

  const checkVolunteerOnboarding = async () => {
    try {
      if (!session?.user.id) {
        router.replace('/login');
        setRouteReady(true);
        return;
      }

      // Check if this is a brand new account (created in the last 60 seconds)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        // Error checking, go to onboarding to be safe
        router.replace('/onboarding-profile-volunteer');
        setRouteReady(true);
        return;
      }

      // If profile was just created (within 60 seconds), show onboarding
      if (profile?.created_at) {
        const createdTime = new Date(profile.created_at).getTime();
        const now = new Date().getTime();
        const isNewAccount = (now - createdTime) < 60000; // 60 seconds

        if (isNewAccount) {
          router.replace('/onboarding-profile-volunteer');
          setRouteReady(true);
          return;
        }
      }

      // Not a new account or already past onboarding window: go to home
      router.replace('/(tabs)');
      setRouteReady(true);
    } catch (err) {
      console.error('Error checking volunteer onboarding:', err);
      router.replace('/(tabs)');
      setRouteReady(true);
    }
  };

  const checkCharityOnboarding = async () => {
    try {
      if (!session?.user.id) {
        router.replace('/login');
        setRouteReady(true);
        return;
      }

      // Check if this is a brand new account (created in the last 60 seconds)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        // Error checking, go to onboarding to be safe
        router.replace('/onboarding-profile-charity');
        setRouteReady(true);
        return;
      }

      // If profile was just created (within 60 seconds), show onboarding
      if (profile?.created_at) {
        const createdTime = new Date(profile.created_at).getTime();
        const now = new Date().getTime();
        const isNewAccount = (now - createdTime) < 60000; // 60 seconds

        if (isNewAccount) {
          router.replace('/onboarding-profile-charity');
          setRouteReady(true);
          return;
        }
      }

      // Not a new account, check if they have a charity set up
      const { data: charities, error: charityError } = await supabase
        .from('charities')
        .select('id')
        .eq('owner_id', session.user.id)
        .limit(1);

      if (charityError) {
        // Error checking, go to charity dashboard
        router.replace('/(tabs)/charity-dashboard');
        setRouteReady(true);
        return;
      }

      // If no charities, send to setup
      if (!charities || charities.length === 0) {
        router.replace('/charity-setup');
        setRouteReady(true);
        return;
      }

      // Has charities: go to charity dashboard
      router.replace('/(tabs)/charity-dashboard');
      setRouteReady(true);
    } catch (err) {
      console.error('Error checking charity onboarding:', err);
      router.replace('/(tabs)');
      setRouteReady(true);
    }
  };

  useEffect(() => {
    const prepareFonts = async () => {
      try {
        await loadFonts();
      } catch (err) {
        console.error('Font loading error:', err);
      } finally {
        setFontsLoaded(true);
        await SplashScreen.hideAsync();
      }
    };

    prepareFonts();
  }, []);

  useEffect(() => {
    if (!loading && fontsLoaded && !roleLoading) {
      if (!session) {
        router.replace('/landing');
        setRouteReady(true);
      } else if (role === 'charity') {
        // Check if this is a new signup or if they need charity setup
        checkCharityOnboarding();
      } else if (role === 'volunteer') {
        // Check if this is a new signup
        checkVolunteerOnboarding();
      } else {
        // Unknown role: go to home (fallback)
        router.replace('/(tabs)');
        setRouteReady(true);
      }
    }
  }, [session, loading, fontsLoaded, roleLoading, role]);

  if (!fontsLoaded || loading || roleLoading || !routeReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootLayout />
    </AuthProvider>
  );
}
