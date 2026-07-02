import { View, Text } from 'react-native';
import { Spacing, Colors } from '@/constants/design-tokens';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Warm, encouraging empty state with icon and copy
 * Replaces generic "no data" messages
 */
export function EmptyState({
  icon,
  title,
  description,
  children,
  testID,
}: EmptyStateProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xxl,
        gap: Spacing.lg,
      }}
      testID={testID}
    >
      {/* Icon */}
      <Text
        style={{
          fontSize: 64,
          lineHeight: 64,
        }}
      >
        {icon}
      </Text>

      {/* Title */}
      <Text
        style={{
          fontSize: 20,
          fontWeight: '600',
          color: Colors.textPrimary,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>

      {/* Description */}
      <Text
        style={{
          fontSize: 14,
          color: Colors.textSecondary,
          textAlign: 'center',
          maxWidth: 280,
          lineHeight: 20,
        }}
      >
        {description}
      </Text>

      {/* Optional action buttons */}
      {children && <View style={{ marginTop: Spacing.md }}>{children}</View>}
    </View>
  );
}
