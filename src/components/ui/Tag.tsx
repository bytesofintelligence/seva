import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Colors, BorderRadius, Typography } from '@/constants/design-tokens';

type TagColor = 'teal' | 'coral' | 'blue' | 'purple' | 'amber';

interface TagProps {
  label: string;
  color?: TagColor;
  testID?: string;
}

/**
 * Tag: rounded pill (999px), 4px 10px padding, 11px/500 label
 * Category colors: teal/coral/blue/purple/amber pairs
 */
export function Tag({ label, color = 'teal', testID }: TagProps) {
  const colorMap: Record<TagColor, { bg: string; text: string }> = {
    teal: Colors.category.teal,
    coral: Colors.category.coral,
    blue: Colors.category.blue,
    purple: Colors.category.purple,
    amber: Colors.category.amber,
  };

  const { bg, text } = colorMap[color];

  const tagStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: BorderRadius.pill, // 999px
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  };

  const textStyle: TextStyle = {
    color: text,
    ...Typography.badge, // 11px / 500
  };

  return (
    <View style={tagStyle} testID={testID}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}
