import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Platform,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { Button, Input, PasswordInput, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';
import {
  PASSWORD_MIN_LENGTH,
  isValidEmail,
  logAuthError,
  toFriendlyAuthError,
  validatePassword,
} from '@/lib/auth-errors';

type UserRole = 'volunteer' | 'charity';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    // Second guard against a double-tap creating two signup requests.
    if (loading) return;

    if (!role) {
      setError('Please select your role');
      await haptics.warning();
      return;
    }

    if (!fullName.trim()) {
      setError('Please enter your full name');
      await haptics.warning();
      return;
    }

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      await haptics.warning();
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      await haptics.warning();
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      await haptics.warning();
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      setError(passwordCheck.message!);
      await haptics.warning();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await haptics.medium();
      const { needsVerification } = await signUp(email, password, {
        data: { role, full_name: fullName.trim() },
      });
      await haptics.success();

      if (needsVerification) {
        // Supabase withheld the session pending email confirmation — this is
        // the expected path with "Confirm email" on. Nothing in the app marks
        // the account verified; only opening the emailed link can.
        router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
        return;
      }

      // "Confirm email" is disabled on the project, so a session was issued
      // immediately. Let the root layout route onward to onboarding.
    } catch (err) {
      logAuthError('signup', err);
      const friendly = toFriendlyAuthError(err);
      setError(friendly.message);
      await haptics.warning();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            paddingBottom: Spacing.xxl * 2,
            minHeight: '100%',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back Button */}
          <View>
            <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: Spacing.sm }}>
              <ThemedText style={{ color: Colors.primary, fontSize: 14 }}>
                ← Back
              </ThemedText>
            </TouchableOpacity>

            {/* Header */}
            <View style={{ marginBottom: Spacing.md, alignItems: 'center' }}>
              <ThemedText
                type="h1"
                style={{
                  marginBottom: Spacing.xs,
                  color: Colors.primary,
                  fontSize: 28,
                }}
              >
                Join SEVA
              </ThemedText>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                Start making an impact
              </ThemedText>
            </View>

            {/* Role Selection */}
            <Card padding="md" style={{ marginBottom: Spacing.sm }}>
              <ThemedText
                style={{
                  color: Colors.textSecondary,
                  fontSize: 11,
                  marginBottom: Spacing.sm,
                }}
              >
                WHO ARE YOU?
              </ThemedText>

              <View style={{ gap: Spacing.xs }}>
                <TouchableOpacity
                  onPress={() => {
                    setRole('volunteer');
                    haptics.light();
                  }}
                  style={{
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    borderRadius: BorderRadius.md,
                    backgroundColor:
                      role === 'volunteer'
                        ? Colors.primary
                        : Colors.surfaceMuted,
                  }}
                >
                  <ThemedText
                    style={{
                      color:
                        role === 'volunteer'
                          ? Colors.cardBg
                          : Colors.textPrimary,
                      fontWeight: '600',
                      textAlign: 'center',
                      fontSize: 13,
                    }}
                  >
                    🌱 I want to volunteer
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setRole('charity');
                    haptics.light();
                  }}
                  style={{
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    borderRadius: BorderRadius.md,
                    backgroundColor:
                      role === 'charity'
                        ? Colors.primary
                        : Colors.surfaceMuted,
                  }}
                >
                  <ThemedText
                    style={{
                      color:
                        role === 'charity'
                          ? Colors.cardBg
                          : Colors.textPrimary,
                      fontWeight: '600',
                      textAlign: 'center',
                      fontSize: 13,
                    }}
                  >
                    🏢 I represent a charity
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </Card>

            {/* Form Card */}
            <Card shadow="md" padding="md" style={{ marginBottom: Spacing.md }}>
              {role === 'charity' && (
                <ThemedText
                  style={{
                    color: Colors.textSecondary,
                    fontSize: 12,
                    marginBottom: Spacing.md,
                    fontStyle: 'italic',
                  }}
                >
                  Please enter your details as the coordinator managing this charity account.
                </ThemedText>
              )}

              <Input
                label={role === 'charity' ? 'Your Full Name' : 'Full Name'}
                placeholder={role === 'charity' ? 'John Smith' : 'Jane Doe'}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!loading}
              />

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
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                helperText={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`}
              />

              <PasswordInput
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />

              {error ? (
                <View
                  style={{
                    backgroundColor: Colors.category.coral.text,
                    padding: Spacing.sm,
                    borderRadius: 8,
                    marginTop: Spacing.sm,
                  }}
                >
                  <ThemedText style={{ color: Colors.cardBg, fontSize: 12 }}>
                    {error}
                  </ThemedText>
                </View>
              ) : (
                <View style={{ height: Spacing.sm + 18 + Spacing.sm + Spacing.sm }} />
              )}
            </Card>
          </View>

          {/* Bottom section: Sign up button and login link */}
          <View style={{ gap: Spacing.sm }}>
            <Button
              label={loading ? 'Creating...' : 'Sign Up'}
              onPress={handleSignup}
              disabled={loading}
              variant="primary"
              size="lg"
            />

            <TouchableOpacity
              onPress={() => router.push('/login')}
              disabled={loading}
              style={{ alignItems: 'center' }}
            >
              <ThemedText style={{ color: Colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                Have an account?{' '}
                <ThemedText
                  style={{
                    color: Colors.primary,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  Log in
                </ThemedText>
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
