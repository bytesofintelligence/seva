import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Input } from './Input';
import { ThemedText } from '../themed-text';
import { Colors } from '@/constants/design-tokens';
import type { TextInputProps } from 'react-native';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label?: string;
  placeholder?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  testID?: string;
}

export function PasswordInput({
  label,
  placeholder = '••••••••',
  error,
  size = 'md',
  testID,
  ...rest
}: PasswordInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <Input
      label={label}
      placeholder={placeholder}
      error={error}
      testID={testID}
      secureTextEntry={!isPasswordVisible}
      icon={
        <TouchableOpacity
          onPress={() => setIsPasswordVisible(!isPasswordVisible)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ThemedText
            style={{
              fontSize: 20,
              color: Colors.primary,
            }}
          >
            {isPasswordVisible ? '👁️' : '👁️‍🗨️'}
          </ThemedText>
        </TouchableOpacity>
      }
      {...rest}
    />
  );
}
