import { View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';

interface SkeletonProps {
  width?: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Skeleton loader for smooth loading states
 * Replaces spinners with pulsing placeholder boxes
 */
export function Skeleton({
  width = '100%',
  height,
  borderRadius = BorderRadius.md,
  style,
  testID,
}: SkeletonProps) {
  const opacity = useSharedValue(0.5);

  // Continuous pulsing animation
  opacity.value = withRepeat(
    withTiming(1, { duration: 1000 }),
    -1,
    true
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: Colors.surfaceMuted,
          borderRadius,
        },
        animatedStyle,
        style,
      ]}
      testID={testID}
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
  testID?: string;
}

/**
 * Skeleton card for list items
 * Shows multiple lines to mimic card content
 */
export function SkeletonCard({ lines = 3, testID }: SkeletonCardProps) {
  return (
    <View
      style={{
        gap: Spacing.md,
        marginBottom: Spacing.lg,
      }}
      testID={testID}
    >
      <Skeleton height={24} width="70%" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton
          key={i}
          height={16}
          width={i === lines - 2 ? '60%' : '100%'}
        />
      ))}
    </View>
  );
}
