import { Colors, Layout } from '@/constants/design-tokens';
import { ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  backgroundColor?: string;
  horizontalPadding?: number;
  padding?: 'md' | 'lg'; // adds matching vertical padding (12px or 16px)
  testID?: string;
}

const verticalPaddingValues: Record<'md' | 'lg', number> = {
  md: 12,
  lg: 16,
};

/**
 * Screen: pageBg background, screenPaddingHorizontal (20px), safe area wrapper
 */
export function Screen({
  children,
  scrollable = false,
  backgroundColor = Colors.pageBg,
  horizontalPadding = Layout.screenPaddingHorizontal,
  padding,
  testID,
}: ScreenProps) {
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
  };

  const innerStyle: ViewStyle = {
    paddingHorizontal: horizontalPadding,
    ...(padding ? { paddingVertical: verticalPaddingValues[padding] } : null),
  };

  if (scrollable) {
    return (
      <SafeAreaView style={containerStyle} testID={testID}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={innerStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[containerStyle, innerStyle]} testID={testID}>
      {children}
    </SafeAreaView>
  );
}
