import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AuthMessage, AuthScreenShell } from '@/components/auth/AuthScreenShell';
import { Button, PasswordInput } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import {
  PASSWORD_MIN_LENGTH,
  logAuthError,
  toFriendlyAuthError,
  validatePassword,
} from '@/lib/auth-errors';
import { Colors, Spacing } from '@/constants/design-tokens';
import { haptics } from '@/lib/haptics';

/**
 * Reached only from a password-recovery deep link, via /auth/callback.
 *
 * The recovery link has already established a real Supabase session by the
 * time we get here — that session is what authorises updateUser({ password }).
 * Nothing about the password is held in the app database; Supabase Auth owns
 * it end to end.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, updatePassword, signOut, endPasswordRecovery } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // No recovery session: the link was never opened, or it has already been
  // consumed. There is nothing to reset from here.
  if (!session && !done) {
    return (
      <AuthScreenShell
        title="Reset link needed"
        subtitle="This reset session is no longer active."
      >
        <AuthMessage tone="error">
          Password reset links can only be used once and expire after a short
          time. Request a new one to continue.
        </AuthMessage>
        <View style={{ gap: Spacing.sm }}>
          <Button
            label="Request a new link"
            onPress={() => router.replace('/forgot-password')}
            variant="primary"
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

  const handleSave = async () => {
    if (saving) return;

    if (!password || !confirmPassword) {
      setError('Please fill in both fields');
      await haptics.warning();
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      await haptics.warning();
      return;
    }
    const check = validatePassword(password);
    if (!check.ok) {
      setError(check.message!);
      await haptics.warning();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updatePassword(password);
      await haptics.success();
      endPasswordRecovery();
      setDone(true);
      // Sign the recovery session out so the new password has to be used at
      // least once. If the link was opened by someone who shouldn't have it,
      // this stops them walking straight into the account.
      await signOut();
    } catch (err) {
      logAuthError('reset-password', err);
      setError(toFriendlyAuthError(err).message);
      await haptics.warning();
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <AuthScreenShell title="Password updated" subtitle="Your new password is ready to use.">
        <AuthMessage tone="success">
          For your security we&apos;ve signed you out. Log in with your new
          password to continue.
        </AuthMessage>
        <Button
          label="Go to log in"
          onPress={() => router.replace('/login')}
          variant="primary"
          size="lg"
        />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Set a new password"
      subtitle="Choose a new password for your SEVA account."
    >
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <PasswordInput
        label="New password"
        value={password}
        onChangeText={setPassword}
        editable={!saving}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        helperText={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers`}
      />

      <PasswordInput
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!saving}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <Button
        label={saving ? 'Updating…' : 'Update password'}
        onPress={handleSave}
        disabled={saving}
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
        Your password is handled entirely by Supabase Auth. SEVA never stores it.
      </ThemedText>
    </AuthScreenShell>
  );
}
