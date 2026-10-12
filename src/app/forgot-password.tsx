import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthMessage, AuthScreenShell } from '@/components/auth/AuthScreenShell';
import { Button, Input } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import {
  EMAIL_CODE_MAX_LENGTH,
  WRONG_EMAIL_CODE_MESSAGE,
  cleanEmailCode,
  isValidEmail,
  isValidEmailCode,
  logAuthError,
  toFriendlyAuthError,
} from '@/lib/auth-errors';
import { Colors, Spacing } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset, verifyEmailCode, beginPasswordRecovery } = useAuth();

  const [email, setEmail] = useState(params.email ?? '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
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

  // The code route, for when the email is read on another device. It ends in
  // the same place as the link: a recovery session pinned to /reset-password.
  const handleVerifyCode = async () => {
    if (verifyingCode) return;

    if (!isValidEmailCode(code)) {
      setError('Enter the code from your reset email');
      await haptics.warning();
      return;
    }

    setVerifyingCode(true);
    setError('');
    try {
      await verifyEmailCode(email.trim(), code, 'recovery');
      await haptics.success();
      // Same order as /auth/callback: pin first, then navigate, so the
      // recovery session can't be used as a general login.
      beginPasswordRecovery();
      router.replace('/reset-password');
    } catch (err) {
      logAuthError('verify-reset-code', err);
      const friendly = toFriendlyAuthError(err);
      setError(
        friendly.kind === 'network' || friendly.kind === 'rate_limited'
          ? friendly.message
          : WRONG_EMAIL_CODE_MESSAGE,
      );
      await haptics.warning();
    } finally {
      setVerifyingCode(false);
    }
  };

  if (sent) {
    return (
      <AuthScreenShell
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, we've sent a reset email. Tap the link on this phone, or enter the code from the email below.`}
        onBack={() => router.replace('/login')}
        backLabel="← Back to log in"
      >
        {error ? (
          <AuthMessage tone="error">{error}</AuthMessage>
        ) : (
          <AuthMessage tone="success">
            Reset links and codes are single-use and expire after a short time.
            If the email doesn&apos;t arrive, check your spam folder.
          </AuthMessage>
        )}

        <Input
          label="Reset code"
          placeholder="Code from the email"
          value={code}
          onChangeText={(text) => setCode(cleanEmailCode(text))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={EMAIL_CODE_MAX_LENGTH}
          editable={!verifyingCode}
        />

        <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
          <Button
            label={verifyingCode ? 'Checking…' : 'Continue with code'}
            onPress={handleVerifyCode}
            disabled={verifyingCode}
            variant="primary"
            size="lg"
          />
          <Button
            label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another email'}
            onPress={handleSend}
            disabled={sending || verifyingCode || cooldown > 0}
            variant="ghost"
            size="lg"
          />
          <Button
            label="Back to log in"
            onPress={() => router.replace('/login')}
            disabled={verifyingCode}
            variant="ghost"
            size="lg"
          />
        </View>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Forgot password?"
      subtitle="Enter the email you signed up with and we'll send you a link and a code to set a new password."
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
        label={sending ? 'Sending…' : 'Send reset email'}
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
        The link works on this phone. Reading the email somewhere else? Use
        the code instead.
      </ThemedText>
    </AuthScreenShell>
  );
}
