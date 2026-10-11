import { useCallback, useEffect, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { loadFonts } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { logAuthError } from '@/lib/auth-errors';

SplashScreen.preventAutoHideAsync();

/**
 * Routes reachable without a session. Everything else is behind the guard
 * below, so a deep link straight to e.g. /volunteer-directory bounces a
 * signed-out user to the landing screen rather than rendering the screen.
 */
const PUBLIC_SEGMENTS = new Set([
  'landing',
  'login',
  'signup',
  'forgot-password',
  'verify-email',
  'reset-password',
  'auth', // /auth/callback
]);

/**
 * Routes that are part of completing an auth flow. The guard never redirects
 * away from these — a password-recovery or verification deep link must be
 * allowed to finish even though the session state looks unusual mid-flow.
 */
const AUTH_FLOW_SEGMENTS = new Set(['auth', 'reset-password', 'verify-email']);

function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, loading, emailVerified, passwordRecovery, role, roleLoading } = useAuth();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // The onboarding lookup hits the network; run it once per signed-in user
  // rather than on every auth event (token refresh fires this effect too).
  const onboardingCheckedForRef = useRef<string | null>(null);

  const routeSignedInUser = useCallback(
    async (userId: string, userRole: 'volunteer' | 'charity') => {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', userId)
          .single();

        const onboardingRoute =
          userRole === 'charity' ? '/onboarding-profile-charity' : '/onboarding-profile-volunteer';

        if (profileError) {
          // Can't tell whether they've onboarded: send them through it rather
          // than into a half-configured app.
          router.replace(onboardingRoute);
          return;
        }

        if (profile?.created_at) {
          const isNewAccount = Date.now() - new Date(profile.created_at).getTime() < 60000;
          if (isNewAccount) {
            router.replace(onboardingRoute);
            return;
          }
        }

        if (userRole === 'charity') {
          const { data: charities, error: charityError } = await supabase
            .from('charities')
            .select('id')
            .eq('owner_id', userId)
            .limit(1);

          if (!charityError && (!charities || charities.length === 0)) {
            router.replace('/charity-setup');
            return;
          }

          router.replace('/(tabs)/charity-dashboard');
          return;
        }

        router.replace('/(tabs)');
      } catch (err) {
        logAuthError('onboarding-route', err);
        router.replace('/(tabs)');
      }
    },
    [router],
  );

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
    if (loading || !fontsLoaded) return;

    const current = segments[0] ?? '';
    const inAuthFlow = AUTH_FLOW_SEGMENTS.has(current);
    const isPublic = PUBLIC_SEGMENTS.has(current);

    // 1. A recovery session may only be spent on setting a new password.
    if (passwordRecovery) {
      if (current !== 'reset-password') router.replace('/reset-password');
      return;
    }

    // 2. Signed out — /auth/callback is exempt so a cold-started deep link can
    //    still establish its session.
    if (!session) {
      onboardingCheckedForRef.current = null;
      if (!isPublic) router.replace('/landing');
      return;
    }

    // 3. Signed in but unverified. With "Confirm email" on, Supabase does not
    //    issue a session at all in this state, so this is a second line of
    //    defence rather than the only one — and the database gate added in
    //    migration 025 is the third.
    if (!emailVerified) {
      if (!inAuthFlow) router.replace('/verify-email');
      return;
    }

    // 4. Signed in and verified. Wait for the role before deciding where to
    //    land, so a charity coordinator isn't flashed the volunteer tabs.
    if (roleLoading || !role) return;

    const userId = session.user.id;
    const alreadyRouted = onboardingCheckedForRef.current === userId;

    if (!alreadyRouted || isPublic) {
      onboardingCheckedForRef.current = userId;
      routeSignedInUser(userId, role);
    }
  }, [
    session,
    loading,
    fontsLoaded,
    emailVerified,
    passwordRecovery,
    role,
    roleLoading,
    segments,
    router,
    routeSignedInUser,
  ]);

  // The Stack must stay mounted while auth resolves — navigating before the
  // navigator exists is what made the previous spinner-only render fragile.
  // The overlay covers it instead.
  const showOverlay = !fontsLoaded || loading;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
      {showOverlay ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      ) : null}
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
