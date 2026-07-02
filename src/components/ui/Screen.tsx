import { Colors, Layout } from '@/constants/design-tokens';
import { ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  backgroundColor?: string;
  horizontalPadding?: number;
  testID?: string;
}

/**
 * Screen: pageBg background, screenPaddingHorizontal (20px), safe area wrapper
 */
export function Screen({
  children,
  scrollable = false,
  backgroundColor = Colors.pageBg,
  horizontalPadding = Layout.screenPaddingHorizontal,
  testID,
}: ScreenProps) {
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
  };

  const innerStyle: ViewStyle = {
    paddingHorizontal: horizontalPadding,
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
