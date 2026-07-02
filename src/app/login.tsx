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
import { Colors, Spacing } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      await haptics.warning();
      return;
    }

    setLoading(true);
    setError('');
    try {
      await haptics.medium();
      await signIn(email, password);
      await haptics.success();
      router.replace('/(tabs)');
    } catch (err: any) {
      const errorMsg = err?.message || 'Login failed';
      if (errorMsg.includes('Failed to fetch')) {
        setError('Network error: Cannot reach Supabase');
      } else {
        setError(errorMsg);
      }
      await haptics.warning();
      console.error('Login error:', err);
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
            flexGrow: 1,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.lg,
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ marginBottom: Spacing.xxl, alignItems: 'center' }}>
            <ThemedText
              type="h1"
              style={{
                marginBottom: Spacing.md,
                color: Colors.primary,
              }}
            >
              Welcome Back
            </ThemedText>
            <ThemedText
              style={{
                color: Colors.textSecondary,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              Log in to your SEVA account
            </ThemedText>
          </View>

          {/* Form Card */}
          <Card padding="lg" style={{ marginBottom: Spacing.xl }}>
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

            {error && (
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
            )}
          </Card>

          {/* Login Button */}
          <Button
            label={loading ? 'Logging in...' : 'Log In'}
            onPress={handleLogin}
            disabled={loading}
            variant="primary"
            size="lg"
            style={{ marginBottom: Spacing.lg }}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
