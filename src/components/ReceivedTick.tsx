import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Colors, BorderRadius } from '@/constants/design-tokens';

/**
 * Small one-shot "pop" animation shown when a pledge flips to 'received'.
 * Plays once per mount rather than a full confetti library — no confetti
 * dependency was already in the project, and this keeps the same "small
 * celebratory moment" without adding a new package for one animation.
 */
export function ReceivedTick() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 150 });
    scale.value = withSequence(
      withSpring(1.15, { damping: 6, stiffness: 180 }),
      withSpring(1, { damping: 8, stiffness: 200 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 28,
          height: 28,
          borderRadius: BorderRadius.pill,
          backgroundColor: Colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
    >
      <Check size={16} color={Colors.cardBg} strokeWidth={3} />
    </Animated.View>
  );
}
