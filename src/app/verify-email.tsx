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
  const { user, emailVerified, resendVerification, refreshUser, signOut, verifyEmailCode } =
    useAuth();

  // Prefer the session's address; fall back to what signup/login handed over,
  // and only fall back to a typed value when we have neither.
  const knownEmail = user?.email ?? params.email ?? '';
  const [typedEmail, setTypedEmail] = useState('');
  const email = knownEmail || typedEmail;
  const setEmail = setTypedEmail;
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
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

  const handleVerifyCode = async () => {
    if (verifyingCode) return;

    const target = email.trim();
    if (!isValidEmail(target)) {
      setNotice('');
      setError('Please enter a valid email address');
      await haptics.warning();
      return;
    }
    if (!isValidEmailCode(code)) {
      setNotice('');
      setError('Enter the code from your verification email');
      await haptics.warning();
      return;
    }

    setVerifyingCode(true);
    setError('');
    setNotice('');
    try {
      // Success signs the user in with a confirmed email; the effect above and
      // the root layout take it from there.
      await verifyEmailCode(target, code, 'signup');
      await haptics.success();
    } catch (err) {
      logAuthError('verify-email-code', err);
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

  const handleCheck = async () => {
    if (checking) return;

    // With "Confirm email" on there is no session until the address is
    // confirmed, so there is nothing here to refresh. If they confirmed by
    // opening the link somewhere else, logging in is the next step -- and if
    // they have not, the login screen sends them straight back here.
    if (!user) {
      router.replace({ pathname: '/login', params: { email: email.trim() } });
      return;
    }

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

  const busy = sending || checking || verifyingCode;

  return (
    <AuthScreenShell
      title="Check your email"
      subtitle={
        knownEmail
          ? `We sent a verification email to ${knownEmail}. Tap the link on this phone, or enter the code from the email below.`
          : 'We sent you a verification email. Tap the link on this phone, or enter the code from the email below.'
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

      <Input
        label="Verification code"
        placeholder="Code from the email"
        value={code}
        onChangeText={(text) => setCode(cleanEmailCode(text))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={EMAIL_CODE_MAX_LENGTH}
        editable={!busy}
      />

      <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
        <Button
          label={verifyingCode ? 'Confirming…' : 'Confirm with code'}
          onPress={handleVerifyCode}
          disabled={busy}
          variant="primary"
          size="lg"
        />
        <Button
          label={checking ? 'Checking…' : "I've used the link — continue"}
          onPress={handleCheck}
          disabled={busy}
          variant="ghost"
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
        Can&apos;t find it? Check your spam folder. Links and codes expire, so
        request a fresh email if it&apos;s been a while.
      </ThemedText>
    </AuthScreenShell>
  );
}
