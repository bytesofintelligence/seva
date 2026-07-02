import { View, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Layout } from '@/constants/design-tokens';

interface CardProps {
  children: React.ReactNode;
  padding?: 'md' | 'lg'; // 14px or 16px
  backgroundColor?: string;
  testID?: string;
}

/**
 * Card: white background, 1px hairline border, radius 18px, no shadows
 */
export function Card({
  children,
  padding = 'md',
  backgroundColor = Colors.cardBg,
  testID,
}: CardProps) {
  const paddingValue = padding === 'md' ? Layout.cardPadding : Layout.heroCardPadding; // 14px or 16px

  const cardStyle: ViewStyle = {
    backgroundColor,
    borderRadius: BorderRadius.xl, // 18px
    borderWidth: 1,
    borderColor: Colors.border, // #E7E5DD
    padding: paddingValue,
  };

  return (
    <View style={cardStyle} testID={testID}>
      {children}
    </View>
  );
}
