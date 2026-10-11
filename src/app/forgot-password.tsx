import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthMessage, AuthScreenShell } from '@/components/auth/AuthScreenShell';
import { Button, Input } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { isValidEmail, logAuthError, toFriendlyAuthError } from '@/lib/auth-errors';
import { Colors, Spacing } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState(params.email ?? '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  const handleSend = async () => {
    // Guards against a double-tap firing two reset emails.
    if (sending || cooldown > 0) return;

    const target = email.trim();
    if (!isValidEmail(target)) {
      setError('Please enter a valid email address');
      await haptics.warning();
      return;
    }

    setSending(true);
    setError('');
    try {
      await sendPasswordReset(target);
      await haptics.success();
      setSent(true);
      startCooldown();
    } catch (err) {
      logAuthError('send-password-reset', err);
      const friendly = toFriendlyAuthError(err);
      if (friendly.kind === 'network' || friendly.kind === 'rate_limited') {
        setError(friendly.message);
        if (friendly.kind === 'rate_limited') startCooldown();
      } else {
        // Any other failure is reported as success on purpose: telling the
        // user "no such account" would turn this screen into an email-address
        // oracle. Supabase behaves the same way for unknown addresses.
        setSent(true);
        startCooldown();
      }
      await haptics.warning();
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <AuthScreenShell
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, we've sent a link to reset your password. Open it on this device.`}
        onBack={() => router.replace('/login')}
        backLabel="← Back to log in"
      >
        <AuthMessage tone="success">
          Reset links are single-use and expire after a short time. If it
          doesn&apos;t arrive, check your spam folder.
        </AuthMessage>

        <View style={{ gap: Spacing.sm }}>
          <Button
            label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another link'}
            onPress={handleSend}
            disabled={sending || cooldown > 0}
            variant="ghost"
            size="lg"
          />
          <Button
            label="Back to log in"
            onPress={() => router.replace('/login')}
            variant="primary"
            size="lg"
          />
        </View>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Forgot password?"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
      onBack={() => router.back()}
    >
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <Input
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!sending}
      />

      <Button
        label={sending ? 'Sending…' : 'Send reset link'}
        onPress={handleSend}
        disabled={sending}
        variant="primary"
        size="lg"
        style={{ marginTop: Spacing.md }}
      />

      <ThemedText
        style={{
          color: Colors.textTertiary,
          fontSize: 12,
          lineHeight: 18,
          marginTop: Spacing.lg,
          textAlign: 'center',
        }}
      >
        Open the link on this device so SEVA can complete the reset.
      </ThemedText>
    </AuthScreenShell>
  );
}
