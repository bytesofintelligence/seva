import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { AuthMessage, AuthScreenShell } from '@/components/auth/AuthScreenShell';
import { Button } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { parseAuthLink } from '@/lib/auth-links';
import { logAuthError, toFriendlyAuthError } from '@/lib/auth-errors';
import { Colors, Spacing } from '@/constants/design-tokens';

type CallbackState =
  | { status: 'waiting' }
  | { status: 'processing' }
  | { status: 'verified' }
  | { status: 'error'; message: string; canResend: boolean };

/**
 * Deep-link landing route for every Supabase auth email.
 *
 * Reached as `seva:///auth/callback?...` both when the app is launched cold by
 * the link (expo-router routes here from the initial URL) and when it is
 * already running (`Linking.useURL` re-fires). It accepts all three shapes
 * Supabase can deliver — PKCE `code`, `token_hash`, and implicit fragment
 * tokens — so a change of project settings or email template can't silently
 * break verification.
 *
 * The root layout deliberately does not redirect away from this route; see
 * AUTH_FLOW_ROUTES in src/app/_layout.tsx.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const { beginPasswordRecovery, refreshUser } = useAuth();
  const [state, setState] = useState<CallbackState>({ status: 'waiting' });
  const handledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;
    // A single link must only ever be consumed once: these are one-time tokens
    // and a second exchange would fail and show a spurious "invalid link".
    if (handledUrlRef.current === url) return;
    handledUrlRef.current = url;

    let cancelled = false;

    const fail = (error: unknown, context: string) => {
      logAuthError(context, error);
      if (cancelled) return;
      const friendly = toFriendlyAuthError(error);
      setState({
        status: 'error',
        message: friendly.message,
        canResend: friendly.kind === 'expired_link' || friendly.kind === 'invalid_link',
      });
    };

    const run = async () => {
      setState({ status: 'processing' });
      const link = parseAuthLink(url);

      if (link.isEmpty) {
        // Someone opened seva://auth/callback with no auth payload.
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'This link is no longer valid. Request a new one and try again.',
            canResend: true,
          });
        }
        return;
      }

      // Supabase reports failures by redirecting *with* an error, not by
      // failing the request, so this must be checked before anything else.
      if (link.errorCode) {
        const expired =
          link.errorCode === 'otp_expired' ||
          (link.errorDescription ?? '').toLowerCase().includes('expired');
        logAuthError('callback-link-error', {
          code: link.errorCode,
          message: link.errorDescription,
        });
        if (!cancelled) {
          setState({
            status: 'error',
            message: expired
              ? 'This link has expired. Request a new one and try again.'
              : 'This link is no longer valid. Request a new one and try again.',
            canResend: true,
          });
        }
        return;
      }

      const isRecovery = link.flow === 'recovery' || link.type === 'recovery';

      try {
        if (link.tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: link.tokenHash,
            type: isRecovery ? 'recovery' : 'email',
          });
          if (error) return fail(error, 'callback-verify-otp');
        } else if (link.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(link.code);
          if (error) return fail(error, 'callback-exchange-code');
        } else if (link.accessToken && link.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: link.accessToken,
            refresh_token: link.refreshToken,
          });
          if (error) return fail(error, 'callback-set-session');
        } else {
          if (!cancelled) {
            setState({
              status: 'error',
              message: 'This link is no longer valid. Request a new one and try again.',
              canResend: true,
            });
          }
          return;
        }
      } catch (err) {
        return fail(err, 'callback');
      }

      if (cancelled) return;

      if (isRecovery) {
        // Pin the session to the reset screen before anything can navigate:
        // a recovery session must not be usable as a general login.
        beginPasswordRecovery();
        router.replace('/reset-password');
        return;
      }

      // Pull the freshly-confirmed user so email_confirmed_at is populated in
      // the session the rest of the app reads.
      await refreshUser();
      if (!cancelled) setState({ status: 'verified' });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [url, beginPasswordRecovery, refreshUser, router]);

  if (state.status === 'waiting' || state.status === 'processing') {
    return (
      <AuthScreenShell title="Confirming…" subtitle="Just a moment while we verify your link.">
        <View style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </AuthScreenShell>
    );
  }

  if (state.status === 'verified') {
    return (
      <AuthScreenShell title="Email verified" subtitle="Your email address is confirmed.">
        <AuthMessage tone="success">
          You&apos;re all set. Welcome to SEVA.
        </AuthMessage>
        <Button
          label="Continue to SEVA"
          onPress={() => router.replace('/(tabs)')}
          variant="primary"
          size="lg"
        />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell title="Link problem" subtitle="We couldn't complete that request.">
      <AuthMessage tone="error">{state.message}</AuthMessage>

      {state.canResend ? (
        <ThemedText
          style={{
            color: Colors.textSecondary,
            fontSize: 13,
            marginBottom: Spacing.md,
            lineHeight: 19,
          }}
        >
          Verification and reset links are single-use and expire after a short
          time. Request a fresh one below.
        </ThemedText>
      ) : null}

      <View style={{ gap: Spacing.sm }}>
        <Button
          label="Resend verification email"
          onPress={() => router.replace('/verify-email')}
          variant="primary"
          size="lg"
        />
        <Button
          label="Reset my password"
          onPress={() => router.replace('/forgot-password')}
          variant="ghost"
          size="lg"
        />
        <Button
          label="Back to log in"
          onPress={() => router.replace('/login')}
          variant="ghost"
          size="lg"
        />
      </View>
    </AuthScreenShell>
  );
}
