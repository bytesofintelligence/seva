import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Platform,
  View,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { Button, Input, PasswordInput, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';

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

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      await haptics.warning();
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      await haptics.warning();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await haptics.medium();
      await signUp(email, password, {
        data: { role, full_name: fullName },
      });
      await haptics.success();
      // Don't navigate here - let the _layout handle it
      // The _layout will detect the new account and route to onboarding
      // Just show a success message
      Alert.alert('✓ Account Created', 'Setting up your profile...', [
        {
          text: 'OK',
          onPress: () => {
            // Let the auth context changes trigger the _layout navigation
          }
        }
      ]);
    } catch (err: any) {
      const errorMsg = err?.message || 'Signup failed';
      if (errorMsg.includes('Failed to fetch')) {
        setError('Network error: Cannot reach Supabase');
      } else {
        setError(errorMsg);
      }
      await haptics.warning();
      console.error('Signup error:', err);
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
        <View
          style={{
            flex: 1,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            justifyContent: 'space-between',
          }}
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
              <Input
                label="Full Name"
                placeholder="Jane Doe"
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
              />

              <PasswordInput
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />

              {error && (
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
