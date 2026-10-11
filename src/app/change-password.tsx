import { useState } from 'react';
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
 * Change password for an already signed-in user.
 *
 * The current password is checked by Supabase, not by us: changePassword()
 * re-authenticates through signInWithPassword before calling updateUser. There
 * is no local comparison and no password stored anywhere in the app.
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (saving) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      await haptics.warning();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      await haptics.warning();
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current one');
      await haptics.warning();
      return;
    }
    const check = validatePassword(newPassword);
    if (!check.ok) {
      setError(check.message!);
      await haptics.warning();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await changePassword(currentPassword, newPassword);
      await haptics.success();
      setDone(true);
    } catch (err) {
      logAuthError('change-password', err);
      const friendly = toFriendlyAuthError(err);
      // A failed re-auth comes back as invalid_credentials; say which field is
      // wrong rather than the generic "email or password" wording.
      setError(
        friendly.kind === 'invalid_credentials'
          ? 'Your current password is not correct.'
          : friendly.message,
      );
      await haptics.warning();
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <AuthScreenShell title="Password changed" subtitle="Your new password is now active.">
        <AuthMessage tone="success">
          You&apos;ll need your new password the next time you sign in.
        </AuthMessage>
        <Button label="Done" onPress={() => router.back()} variant="primary" size="lg" />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Change password"
      subtitle="Enter your current password, then choose a new one."
      onBack={() => router.back()}
    >
      {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}

      <PasswordInput
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        editable={!saving}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />

      <PasswordInput
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
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
        Forgotten your current password? Sign out and use &quot;Forgot
        password?&quot; on the log in screen.
      </ThemedText>
    </AuthScreenShell>
  );
}
