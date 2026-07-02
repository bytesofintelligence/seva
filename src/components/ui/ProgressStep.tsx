import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';

interface ProgressStepProps {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
}

/**
 * Progress indicator for multi-step forms
 * Shows user where they are in the flow
 */
export function ProgressStep({ currentStep, totalSteps, stepLabel }: ProgressStepProps) {
  return (
    <View style={{ marginBottom: Spacing.xl }}>
      {/* Progress Bar */}
      <View
        style={{
          height: 4,
          backgroundColor: Colors.surfaceMuted,
          borderRadius: BorderRadius.full,
          marginBottom: Spacing.md,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${(currentStep / totalSteps) * 100}%`,
            backgroundColor: Colors.primary,
            borderRadius: BorderRadius.full,
          }}
        />
      </View>

      {/* Step Label */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: Colors.primary,
          }}
        >
          Step {currentStep} of {totalSteps}
        </ThemedText>
        <ThemedText
          style={{
            fontSize: 13,
            color: Colors.textSecondary,
          }}
        >
          {stepLabel}
        </ThemedText>
      </View>
    </View>
  );
}
