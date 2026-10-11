import * as Linking from 'expo-linking';

/**
 * The single redirect target for every Supabase auth email (signup
 * confirmation, resend, password recovery).
 *
 * `Linking.createURL` resolves against the `scheme` in app.json ("seva"), so
 * in a dev/production build this is `seva:///auth/callback`, and in Expo Go it
 * is `exp://<host>/--/auth/callback`. Both forms must be present in the
 * Supabase dashboard's Redirect URLs allow-list (see AUTH_SETUP.md).
 *
 * Keep this as the ONLY place the callback path is constructed so the app and
 * the dashboard allow-list can never drift apart.
 */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Which flow the user started, round-tripped through the email link as our own
 * `flow` query param.
 *
 * We do not rely on Supabase's `type` param: in PKCE mode the redirect carries
 * only `?code=`, with no indication of whether it came from a signup
 * confirmation or a password recovery. Getting that wrong would drop a user
 * holding a recovery session straight into the app, so we carry the intent
 * ourselves. Supabase preserves query params already present on `redirect_to`.
 */
export type AuthFlow = 'signup' | 'recovery';

export function getAuthRedirectUrl(flow: AuthFlow = 'signup'): string {
  return Linking.createURL(AUTH_CALLBACK_PATH, { queryParams: { flow } });
}

export type AuthLinkType =
  | 'signup'
  | 'recovery'
  | 'invite'
  | 'magiclink'
  | 'email_change'
  | 'email';

export interface ParsedAuthLink {
  /** Supabase PKCE authorization code (`?code=...`). */
  code?: string;
  /** Supabase one-time token hash (`?token_hash=...`), used with verifyOtp. */
  tokenHash?: string;
  /** Supabase's own link type, present on token_hash / implicit links. */
  type?: AuthLinkType;
  /** Our `flow` marker, the authoritative signal for what to do next. */
  flow?: AuthFlow;
  /** Implicit-flow tokens, delivered in the URL fragment. */
  accessToken?: string;
  refreshToken?: string;
  /** Supabase surfaces failures on the redirect itself rather than erroring. */
  errorCode?: string;
  errorDescription?: string;
  /** True when the URL carried nothing we can act on. */
  isEmpty: boolean;
}

function collectParams(source: string | undefined, into: Record<string, string>) {
  if (!source) return;
  for (const pair of source.replace(/^[?#]/, '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    if (key) into[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
}

/**
 * Parse a Supabase auth callback URL.
 *
 * Supabase can deliver the result three different ways depending on project
 * settings and email template, so we accept all of them rather than betting on
 * one: PKCE `?code=`, `?token_hash=&type=`, or implicit `#access_token=`.
 *
 * Never log the return value of this function — it holds live credentials.
 */
export function parseAuthLink(url: string): ParsedAuthLink {
  const params: Record<string, string> = {};

  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : url.slice(hashIndex + 1);

  const queryIndex = withoutHash.indexOf('?');
  const query = queryIndex === -1 ? undefined : withoutHash.slice(queryIndex + 1);

  collectParams(query, params);
  collectParams(fragment, params);

  const parsed: ParsedAuthLink = {
    code: params.code || undefined,
    tokenHash: params.token_hash || params.token || undefined,
    type: (params.type as AuthLinkType) || undefined,
    flow: params.flow === 'recovery' ? 'recovery' : params.flow === 'signup' ? 'signup' : undefined,
    accessToken: params.access_token || undefined,
    refreshToken: params.refresh_token || undefined,
    errorCode: params.error_code || params.error || undefined,
    errorDescription: params.error_description || undefined,
    isEmpty: false,
  };

  parsed.isEmpty = !(
    parsed.code ||
    parsed.tokenHash ||
    parsed.accessToken ||
    parsed.errorCode
  );

  return parsed;
}
