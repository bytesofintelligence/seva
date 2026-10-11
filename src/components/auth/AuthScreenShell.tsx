import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/design-tokens';

interface AuthScreenShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

/**
 * Shared frame for the auth screens so they match login/signup without each one
 * re-declaring the same SafeAreaView/KeyboardAvoidingView/ScrollView stack.
 * Presentation only — no auth logic lives here.
 */
export function AuthScreenShell({
  title,
  subtitle,
  children,
  onBack,
  backLabel = '← Back',
}: AuthScreenShellProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }}>
      <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 44 }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>{backLabel}</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: Spacing.xxl * 2,
            flexGrow: 1,
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: Spacing.xl }}>
            <ThemedText
              style={{
                fontSize: 26,
                fontWeight: '700',
                color: Colors.primary,
                marginBottom: Spacing.sm,
              }}
            >
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText
                style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 22 }}
              >
                {subtitle}
              </ThemedText>
            ) : null}
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface AuthMessageProps {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}

const toneStyles = {
  error: { bg: Colors.category.coral.bg, fg: Colors.semantic.error },
  success: { bg: Colors.category.teal.bg, fg: Colors.semantic.success },
  info: { bg: Colors.category.blue.bg, fg: Colors.semantic.info },
} as const;

/** Inline status banner used by every auth screen for error/success states. */
export function AuthMessage({ tone, children }: AuthMessageProps) {
  const { bg, fg } = toneStyles[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        padding: Spacing.md,
        borderRadius: 8,
        marginBottom: Spacing.md,
      }}
    >
      <ThemedText style={{ color: fg, fontSize: 13, lineHeight: 19 }}>{children}</ThemedText>
    </View>
  );
}
