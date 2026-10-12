import type { AuthError } from '@supabase/supabase-js';

/**
 * Password rules enforced in the UI for fast feedback. Supabase remains the
 * actual authority — configure the matching minimum length under
 * Authentication -> Providers -> Email in the dashboard.
 */
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

export function validatePassword(password: string): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one number' };
  }
  return { ok: true };
}

/**
 * The one-time code in a verification or reset email. Supabase's length is a
 * dashboard setting (6-10 digits), so accept the whole range rather than
 * hard-coding today's value.
 */
export const EMAIL_CODE_MAX_LENGTH = 10;
const EMAIL_CODE_PATTERN = /^[0-9]{6,10}$/;

/** Keeps only digits, so a pasted "123 456" or "123-456" still works. */
export function cleanEmailCode(input: string): string {
  return input.replace(/[^0-9]/g, '').slice(0, EMAIL_CODE_MAX_LENGTH);
}

export function isValidEmailCode(code: string): boolean {
  return EMAIL_CODE_PATTERN.test(code);
}

export const WRONG_EMAIL_CODE_MESSAGE =
  'That code is not correct or has expired. Check the latest email, or request a new one.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Distinct enough to branch on in a screen, without leaking internals. */
export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'weak_password'
  | 'same_password'
  | 'expired_link'
  | 'invalid_link'
  | 'no_session'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export interface FriendlyAuthError {
  kind: AuthErrorKind;
  message: string;
}

const MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: 'That email or password is not correct.',
  email_not_confirmed: 'Please verify your email address before signing in.',
  email_taken: 'An account already exists for this email. Try signing in instead.',
  weak_password: `Please choose a stronger password (at least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers).`,
  same_password: 'Your new password must be different from your current one.',
  expired_link: 'This link has expired. Request a new one and try again.',
  invalid_link: 'This link is no longer valid. Request a new one and try again.',
  no_session: 'Your session has ended. Please sign in again.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  network: 'Cannot reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/**
 * Map a Supabase auth failure onto a message that is safe to show a user.
 *
 * Raw Supabase/Postgres strings are deliberately never surfaced: they leak
 * schema names, policy names and account-existence signals. The original error
 * is still handed to `logAuthError` for the developer console.
 */
export function toFriendlyAuthError(error: unknown): FriendlyAuthError {
  const kind = classify(error);
  return { kind, message: MESSAGES[kind] };
}

function classify(error: unknown): AuthErrorKind {
  if (!error) return 'unknown';

  const authError = error as Partial<AuthError> & { message?: string; status?: number };
  const code = typeof authError.code === 'string' ? authError.code : '';
  const message = (authError.message ?? String(error)).toLowerCase();
  const status = authError.status;

  // Network problems arrive as plain TypeErrors from fetch, with no status.
  if (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('timeout') ||
    message.includes('abort')
  ) {
    return 'network';
  }

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'email_not_confirmed';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'invalid_credentials';
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return 'email_taken';
  }
  // Must precede weak_password: Supabase's "New password should be different
  // from the old password" also contains "password should be".
  if (code === 'same_password' || message.includes('different from the old password')) {
    return 'same_password';
  }
  if (code === 'weak_password' || message.includes('password should be') || message.includes('weak password')) {
    return 'weak_password';
  }
  if (code === 'otp_expired' || message.includes('expired')) {
    return 'expired_link';
  }
  if (
    code === 'validation_failed' ||
    code === 'bad_code_verifier' ||
    code === 'flow_state_not_found' ||
    code === 'flow_state_expired' ||
    message.includes('code verifier') ||
    message.includes('invalid token') ||
    message.includes('token has invalid') ||
    message.includes('otp') ||
    message.includes('invalid request')
  ) {
    return 'invalid_link';
  }
  if (code === 'session_not_found' || code === 'session_expired' || message.includes('auth session missing')) {
    return 'no_session';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'rate_limited';
  }

  return 'unknown';
}

/**
 * Developer-facing logging. Emits only the error's code/status/message —
 * never tokens, passwords, session objects or user records — and is silenced
 * in production builds so nothing sensitive reaches device logs or crash
 * reporters.
 */
export function logAuthError(context: string, error: unknown): void {
  if (!__DEV__) return;
  const authError = error as Partial<AuthError> & { message?: string; status?: number };
  console.warn(`[auth:${context}]`, {
    code: authError?.code,
    status: authError?.status,
    message: authError?.message,
  });
}
