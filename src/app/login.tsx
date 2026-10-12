import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Platform,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { Button, Input, PasswordInput, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';
import { isValidEmail, logAuthError, toFriendlyAuthError } from '@/lib/auth-errors';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  // /verify-email hands the address over when someone has confirmed elsewhere.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    // Second guard against a double-tap submitting twice; the button is also
    // disabled while loading.
    if (loading) return;

    if (!email || !password) {
      setError('Please fill in all fields');
      await haptics.warning();
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      await haptics.warning();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await haptics.medium();
      await signIn(email, password);
      await haptics.success();
      // Navigation is owned by the root layout guard, which also decides
      // between onboarding, charity setup and the tabs. Routing here as well
      // would race it.
    } catch (err) {
      logAuthError('login', err);
      const friendly = toFriendlyAuthError(err);

      // An unverified account can't get in; send them somewhere they can act.
      if (friendly.kind === 'email_not_confirmed') {
        await haptics.warning();
        router.push({ pathname: '/verify-email', params: { email: email.trim() } });
        return;
      }

      setError(friendly.message);
      await haptics.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      {/* Back Button */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
            ← Back
          </ThemedText>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.lg,
            paddingBottom: Spacing.xxl * 2,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {/* Hero Section */}
            <View
              style={{
                marginBottom: Spacing.xl,
                alignItems: 'center',
                paddingVertical: Spacing.md,
              }}
            >
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: Colors.primary,
                  marginBottom: Spacing.xl,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 40,
                  }}
                >
                  🌱
                </ThemedText>
              </View>

              <ThemedText
                style={{
                  fontSize: 32,
                  fontWeight: '700',
                  color: Colors.primary,
                  marginBottom: Spacing.sm,
                  textAlign: 'center',
                }}
              >
                Welcome to SEVA
              </ThemedText>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 15,
                  textAlign: 'center',
                  lineHeight: 22,
                  maxWidth: 280,
                }}
              >
                Make a meaningful impact by volunteering with charities that matter
              </ThemedText>
            </View>

              {/* Form Card */}
              <Card padding="md" style={{ marginBottom: Spacing.sm }}>
                <Input
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                />

                <PasswordInput
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />

                {error ? (
                  <View
                    style={{
                      backgroundColor: Colors.category.coral.text,
                      padding: Spacing.md,
                      borderRadius: 8,
                      marginTop: Spacing.md,
                    }}
                  >
                    <ThemedText style={{ color: Colors.cardBg, fontSize: 13 }}>
                      {error}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={{ height: Spacing.md + 26 + Spacing.md + 8 }} />
                )}
              </Card>

              {/* Forgot Password Link */}
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
                }
                disabled={loading}
                style={{ alignSelf: 'flex-end', marginBottom: Spacing.md }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ThemedText
                  style={{ color: Colors.primary, fontSize: 14, fontWeight: '600' }}
                >
                  Forgot password?
                </ThemedText>
              </TouchableOpacity>

              {/* Login Button */}
              <Button
                label={loading ? 'Logging in...' : 'Log In'}
                onPress={handleLogin}
                disabled={loading}
                variant="primary"
                size="lg"
                style={{ marginBottom: Spacing.md }}
              />

              {/* Sign Up Link */}
              <View style={{ alignItems: 'center', gap: Spacing.sm }}>
                <ThemedText style={{ color: Colors.textSecondary, fontSize: 14 }}>
                  Don't have an account?
                </ThemedText>
                <TouchableOpacity onPress={() => router.push('/signup')} disabled={loading}>
                  <ThemedText
                    style={{
                      color: Colors.primary,
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  >
                    Sign up here
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
