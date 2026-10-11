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

/**
 * "Check your email" state shown after signup, and whenever a signed-in
 * session turns out to be unverified.
 *
 * Verification status is never stored here — it is read back from Supabase via
 * refreshUser(), and the root layout is what actually keeps unverified users
 * out of the app.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { user, emailVerified, resendVerification, refreshUser, signOut } = useAuth();

  // Prefer the session's address; fall back to what signup/login handed over,
  // and only fall back to a typed value when we have neither.
  const knownEmail = user?.email ?? params.email ?? '';
  const [typedEmail, setTypedEmail] = useState('');
  const email = knownEmail || typedEmail;
  const setEmail = setTypedEmail;
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Once Supabase reports the address confirmed, the root guard will let this
  // user through; get out of the way.
  useEffect(() => {
    if (emailVerified) router.replace('/(tabs)');
  }, [emailVerified, router]);

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

  const handleResend = async () => {
    if (sending || cooldown > 0) return;

    const target = email.trim();
    if (!isValidEmail(target)) {
      setNotice('');
      setError('Please enter a valid email address');
      await haptics.warning();
      return;
    }

    setSending(true);
    setError('');
    setNotice('');
    try {
      await resendVerification(target);
      await haptics.success();
      // Deliberately identical wording whether or not the address exists —
      // a differing response would let anyone probe for registered emails.
      setNotice(`If ${target} needs verifying, a new link is on its way. It expires shortly, so use it soon.`);
      startCooldown();
    } catch (err) {
      logAuthError('resend-verification', err);
      const friendly = toFriendlyAuthError(err);
      // Rate limiting is the one case worth showing plainly, so the user waits
      // instead of hammering the button.
      setError(friendly.message);
      await haptics.warning();
      if (friendly.kind === 'rate_limited') startCooldown();
    } finally {
      setSending(false);
    }
  };

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const verified = await refreshUser();
      if (verified) {
        await haptics.success();
        router.replace('/(tabs)');
      } else {
        await haptics.warning();
        setError('Not verified yet. Open the link in your email, then try again.');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleBackToLogin = async () => {
    // If a half-finished unverified session exists, clear it so the login
    // screen isn't fighting the route guard.
    if (user) await signOut();
    router.replace('/login');
  };

  const busy = sending || checking;

  return (
    <AuthScreenShell
      title="Check your email"
      subtitle={
        knownEmail
          ? `We sent a verification link to ${knownEmail}. Open it on this device to finish setting up your account.`
          : 'We sent you a verification link. Open it on this device to finish setting up your account.'
      }
    >
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
      {notice ? <AuthMessage tone="success">{notice}</AuthMessage> : null}

      {!knownEmail ? (
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
      ) : null}

      <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
        <Button
          label={checking ? 'Checking…' : "I've verified — continue"}
          onPress={handleCheck}
          disabled={busy}
          variant="primary"
          size="lg"
        />
        <Button
          label={
            sending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Resend verification email'
          }
          onPress={handleResend}
          disabled={busy || cooldown > 0}
          variant="ghost"
          size="lg"
        />
        <Button
          label="Back to log in"
          onPress={handleBackToLogin}
          disabled={busy}
          variant="ghost"
          size="lg"
        />
      </View>

      <ThemedText
        style={{
          color: Colors.textTertiary,
          fontSize: 12,
          lineHeight: 18,
          marginTop: Spacing.lg,
          textAlign: 'center',
        }}
      >
        Can&apos;t find it? Check your spam folder. Links expire, so request a
        fresh one if it&apos;s been a while.
      </ThemedText>
    </AuthScreenShell>
  );
}
