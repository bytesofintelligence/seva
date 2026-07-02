import React, { ReactNode } from 'react';
import { TextInput, View, Text, ViewStyle, TextInputProps } from 'react-native';
import { Search } from 'lucide-react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/design-tokens';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: boolean | ReactNode; // true for search icon, or custom element
  isSearchBar?: boolean; // If true, render as search bar style (for browse page)
  testID?: string;
}

/**
 * Input: Supports both search bars and form inputs
 * - Form inputs: have labels, error states, gaps
 * - Search bars: surfaceMuted fill, 12px radius, no border
 */
export function Input({
  label,
  placeholder = 'Search',
  error,
  icon = false,
  isSearchBar = false,
  testID,
  ...rest
}: InputProps) {
  // Search bar mode: minimal, integrated icon
  if (isSearchBar) {
    const containerStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surfaceMuted,
      borderRadius: BorderRadius.md, // 12px
      paddingHorizontal: 12,
      paddingVertical: 9,
    };

    const inputStyle: ViewStyle = {
      flex: 1,
      color: Colors.textPrimary,
      fontSize: 14,
      marginLeft: 8,
    };

    return (
      <View style={containerStyle}>
        {icon === true && (
          <Search size={20} color={Colors.textTertiary} strokeWidth={1.5} />
        )}
        <TextInput
          style={inputStyle}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          testID={testID}
          {...rest}
        />
      </View>
    );
  }

  // Form input mode: label, error handling, gaps
  const containerStyle: ViewStyle = {
    marginBottom: Spacing.lg,
  };

  const labelStyle = {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500' as const,
    marginBottom: Spacing.sm,
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceMuted,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: error ? 1 : 0,
    borderColor: error ? Colors.category.coral.text : 'transparent',
  };

  const inputStyle: ViewStyle = {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    paddingVertical: Spacing.sm,
  };

  const errorStyle = {
    color: Colors.category.coral.text,
    fontSize: 12,
    marginTop: Spacing.xs,
  };

  return (
    <View style={containerStyle}>
      {label && <Text style={labelStyle}>{label}</Text>}

      <View style={inputContainerStyle}>
        <TextInput
          style={inputStyle}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          testID={testID}
          {...rest}
        />
        {icon && icon !== true && (
          <View style={{ marginLeft: Spacing.sm }}>{icon}</View>
        )}
      </View>

      {error && <Text style={errorStyle}>{error}</Text>}
    </View>
  );
}
