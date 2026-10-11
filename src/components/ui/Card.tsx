import { View, ViewStyle, StyleProp } from 'react-native';
import { Colors, BorderRadius, Layout } from '@/constants/design-tokens';

interface CardProps {
  children: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg';
  backgroundColor?: string;
  shadow?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const paddingValues: Record<'sm' | 'md' | 'lg', number> = {
  sm: 8,
  md: Layout.cardPadding,
  lg: Layout.heroCardPadding,
};

const shadowStyles: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: {
    shadowColor: '#2C2C2A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#2C2C2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#2C2C2A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
};

/**
 * Card: white background, 1px hairline border, radius 18px, optional shadow
 */
export function Card({
  children,
  padding = 'md',
  backgroundColor = Colors.cardBg,
  shadow,
  style,
  testID,
}: CardProps) {
  const paddingValue = paddingValues[padding];

  const cardStyle: ViewStyle = {
    backgroundColor,
    borderRadius: BorderRadius.xl, // 18px
    borderWidth: 1,
    borderColor: Colors.border, // #E7E5DD
    padding: paddingValue,
    ...(shadow ? shadowStyles[shadow] : null),
  };

  return (
    <View style={[cardStyle, style]} testID={testID}>
      {children}
    </View>
  );
}
