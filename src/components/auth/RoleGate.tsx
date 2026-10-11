import { ComponentType, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { useAuth, UserRole } from '@/context/auth-context';
import { Colors, Spacing } from '@/constants/design-tokens';

/**
 * Route-level role guard for coordinator-only screens.
 *
 * This exists so a coordinator screen cannot be reached by deep link or by a
 * stale navigation stack just because its entry point button was hidden. It is
 * *not* the security boundary: every privileged read and write is enforced in
 * Postgres by RLS keyed on `charities.owner_id = auth.uid()`, so a volunteer
 * who bypassed this component would still get nothing back from the database.
 * Its job is to stop the app rendering a screen it cannot populate, and to
 * make the intent explicit at each route.
 */
export function withRoleGuard<P extends object>(
  Component: ComponentType<P>,
  allowed: UserRole,
): ComponentType<P> {
  function RoleGuarded(props: P) {
    const router = useRouter();
    const { session, role, roleLoading, loading } = useAuth();

    const resolved = !loading && !roleLoading && Boolean(session);
    const permitted = role === allowed;

    useEffect(() => {
      // The root layout handles the signed-out case; this only handles a
      // signed-in user on the wrong side of the app.
      if (resolved && !permitted && role !== null) {
        router.replace(role === 'charity' ? '/(tabs)/charity-dashboard' : '/(tabs)');
      }
    }, [resolved, permitted, role, router]);

    if (!resolved || (!permitted && role !== null)) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: Colors.pageBg,
          }}
        >
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (!permitted) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: Colors.pageBg,
            padding: Spacing.xl,
            gap: Spacing.md,
          }}
        >
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center' }}>
            This area is for charity coordinators.
          </ThemedText>
          <Button label="Back to SEVA" onPress={() => router.replace('/(tabs)')} variant="primary" />
        </View>
      );
    }

    return <Component {...props} />;
  }

  RoleGuarded.displayName = `withRoleGuard(${Component.displayName ?? Component.name ?? 'Screen'})`;
  return RoleGuarded;
}
