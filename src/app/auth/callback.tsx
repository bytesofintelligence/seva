import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { AuthMessage, AuthScreenShell } from '@/components/auth/AuthScreenShell';
import { Button } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { resolveAuthLink } from '@/lib/auth-links';
import { logAuthError, toFriendlyAuthError } from '@/lib/auth-errors';
import { Colors, Spacing } from '@/constants/design-tokens';

type CallbackState =
  | { status: 'waiting' }
  | { status: 'processing' }
  | { status: 'verified' }
  | { status: 'error'; message: string; canResend: boolean };

const INVALID_LINK_MESSAGE = 'This link is no longer valid. Request a new one and try again.';

/** How long to wait for a link payload before saying so instead of spinning. */
const EMPTY_LINK_GRACE_MS = 4000;

/**
 * Deep-link landing route for every Supabase auth email.
 *
 * Reached as `seva:///auth/callback?...` both when the app is launched cold by
 * the link and when it is already running. It accepts all three shapes
 * Supabase can deliver — PKCE `code`, `token_hash`, and implicit fragment
 * tokens — so a change of project settings or email template can't silently
 * break verification.
 *
 * The link is read from the route's own search params (see resolveAuthLink).
 * `Linking.useURL()` is not enough on Android: it reports the URL that
 * *launched* the app, so when the app was already open and this screen mounts
 * in response to the link, it yields nothing and the screen would wait forever.
 *
 * The root layout deliberately does not redirect away from this route; see
 * AUTH_FLOW_ROUTES in src/app/_layout.tsx.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const routeParams = useLocalSearchParams();
  const { beginPasswordRecovery, refreshUser } = useAuth();
  const [state, setState] = useState<CallbackState>({ status: 'waiting' });
  const handledKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { code, tokenHash, accessToken, refreshToken, errorCode, errorDescription, flow, type } =
    resolveAuthLink(url, routeParams);

  // Identifies this particular link. These are one-time credentials: each must
  // be consumed exactly once, and a re-render must not start a second exchange
  // (it would fail and show a spurious "invalid link").
  const linkKey = code ?? tokenHash ?? accessToken ?? errorCode ?? '';

  useEffect(() => {
    if (!linkKey) {
      // Opened with nothing to act on — or the payload is still arriving. Give
      // it a moment, then say so rather than leaving a spinner up forever.
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        setState((current) =>
          current.status === 'waiting'
            ? { status: 'error', message: INVALID_LINK_MESSAGE, canResend: true }
            : current,
        );
      }, EMPTY_LINK_GRACE_MS);
      return () => clearTimeout(timer);
    }

    if (handledKeyRef.current === linkKey) return;
    handledKeyRef.current = linkKey;

    // Whether to keep going is decided by "is the screen still mounted", not
    // by this effect's cleanup: the exchange must be allowed to finish and
    // report even if the effect happens to re-run while it is in flight.
    const isLive = () => mountedRef.current;

    let isRecovery = flow === 'recovery' || type === 'recovery';

    const fail = (error: unknown, context: string) => {
      logAuthError(context, error);
      if (!isLive()) return;
      const friendly = toFriendlyAuthError(error);
      const canResend = friendly.kind === 'expired_link' || friendly.kind === 'invalid_link';

      // The usual cause of an invalid link here is PKCE: the link only works in
      // the app install that requested it. Point at the way forward for each
      // flow instead of a bare "invalid".
      let message = friendly.message;
      if (friendly.kind === 'invalid_link') {
        message = isRecovery
          ? 'This reset link could not be used. Open it on the same phone you requested it from, or request a new one.'
          : "We couldn't sign you in from this link. If you have just confirmed your email, go back and log in with your password. Otherwise request a new link.";
      }

      setState({ status: 'error', message, canResend });
    };

    const run = async () => {
      setState({ status: 'processing' });

      // Supabase reports failures by redirecting *with* an error, not by
      // failing the request, so this must be checked before anything else.
      if (errorCode) {
        const expired =
          errorCode === 'otp_expired' ||
          (errorDescription ?? '').toLowerCase().includes('expired');
        logAuthError('callback-link-error', {
          code: errorCode,
          message: errorDescription,
        });
        if (isLive()) {
          setState({
            status: 'error',
            message: expired
              ? 'This link has expired. Request a new one and try again.'
              : INVALID_LINK_MESSAGE,
            canResend: true,
          });
        }
        return;
      }

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: isRecovery ? 'recovery' : 'email',
          });
          if (error) return fail(error, 'callback-verify-otp');
        } else if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return fail(error, 'callback-exchange-code');
          // supabase-js remembers on-device which flow issued this code. Trust
          // that as well as our own `flow` marker, so a recovery link can never
          // be treated as a plain sign-in if the marker is lost in a redirect.
          // (Returned at runtime; missing from the published AuthTokenResponse type.)
          const redirectType = (data as { redirectType?: string | null } | null)?.redirectType;
          if (redirectType === 'recovery') isRecovery = true;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) return fail(error, 'callback-set-session');
        } else {
          if (isLive()) {
            setState({ status: 'error', message: INVALID_LINK_MESSAGE, canResend: true });
          }
          return;
        }
      } catch (err) {
        return fail(err, 'callback');
      }

      if (!isLive()) return;

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
      if (isLive()) setState({ status: 'verified' });
    };

    run();
  }, [
    linkKey,
    code,
    tokenHash,
    accessToken,
    refreshToken,
    errorCode,
    errorDescription,
    flow,
    type,
    beginPasswordRecovery,
    refreshUser,
    router,
  ]);

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
