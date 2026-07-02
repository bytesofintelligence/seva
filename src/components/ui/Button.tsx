import { Pressable, Text, ViewStyle, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  testID?: string;
}

/**
 * Primary button: teal fill, white label, pressed state scales to 0.98
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  testID,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, {
      damping: 10,
      mass: 1,
      stiffness: 100,
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 10,
      mass: 1,
      stiffness: 100,
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const baseButtonStyle: ViewStyle = {
    borderRadius: BorderRadius.lg, // 14px
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.6 : 1,
  };

  // Size styles
  const sizeStyles: Record<typeof size, { paddingVertical: number; paddingHorizontal: number; fontSize?: number }> = {
    sm: { paddingVertical: 8, paddingHorizontal: Spacing.md },
    md: { paddingVertical: 12, paddingHorizontal: Spacing.lg },
    lg: { paddingVertical: 15, paddingHorizontal: Spacing.xl },
    xl: { paddingVertical: 18, paddingHorizontal: Spacing.xl, fontSize: 18 },
  };

  // Variant styles - explicitly type as Record of variant options
  type VariantType = 'primary' | 'ghost' | 'danger';
  const { fontSize, ...sizeStyle } = sizeStyles[size];
  const variantStyles: Record<VariantType, { button: ViewStyle; text: TextStyle }> = {
    primary: {
      button: {
        backgroundColor: Colors.primary,
        ...sizeStyle,
      },
      text: {
        color: Colors.cardBg,
        ...Typography.button,
        ...(fontSize && { fontSize }),
      },
    },
    ghost: {
      button: {
        backgroundColor: 'transparent',
        ...sizeStyle,
      },
      text: {
        color: Colors.primary,
        ...Typography.button,
        ...(fontSize && { fontSize }),
      },
    },
    danger: {
      button: {
        backgroundColor: '#DC3545',
        ...sizeStyle,
      },
      text: {
        color: Colors.cardBg,
        ...Typography.button,
        ...(fontSize && { fontSize }),
      },
    },
  };

  // Ensure variant is valid
  const validVariant: VariantType = (variant === 'primary' || variant === 'ghost' || variant === 'danger') ? variant : 'primary';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        testID={testID}
        style={[
          baseButtonStyle,
          variantStyles[validVariant].button,
        ]}
      >
        <Text style={variantStyles[validVariant].text}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
