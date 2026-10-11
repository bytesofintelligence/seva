import { Modal, View, TouchableOpacity, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';

interface OpportunityActionSheetProps {
  visible: boolean;
  title: string;
  showCancelOccurrence: boolean;
  onDuplicate: () => void;
  onCancelOccurrence: () => void;
  onDismiss: () => void;
}

export function OpportunityActionSheet({
  visible,
  title,
  showCancelOccurrence,
  onDuplicate,
  onCancelOccurrence,
  onDismiss,
}: OpportunityActionSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onDismiss}
      >
        <Pressable
          style={{
            backgroundColor: Colors.cardBg,
            borderTopLeftRadius: BorderRadius.xxl,
            borderTopRightRadius: BorderRadius.xxl,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.xl,
          }}
        >
          <ThemedText
            style={{
              color: Colors.textSecondary,
              fontSize: 13,
              marginBottom: Spacing.md,
              textAlign: 'center',
            }}
            numberOfLines={1}
          >
            {title}
          </ThemedText>

          <TouchableOpacity
            onPress={onDuplicate}
            style={{
              paddingVertical: Spacing.lg,
              borderTopWidth: 1,
              borderTopColor: Colors.border,
            }}
          >
            <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center' }}>
              Duplicate
            </ThemedText>
          </TouchableOpacity>

          {showCancelOccurrence && (
            <TouchableOpacity
              onPress={onCancelOccurrence}
              style={{
                paddingVertical: Spacing.lg,
                borderTopWidth: 1,
                borderTopColor: Colors.border,
              }}
            >
              <ThemedText style={{ color: Colors.semantic.error, fontSize: 16, textAlign: 'center' }}>
                Cancel occurrence
              </ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onDismiss}
            style={{
              paddingVertical: Spacing.lg,
              marginTop: Spacing.md,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.lg,
            }}
          >
            <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center', fontWeight: '600' }}>
              Close
            </ThemedText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
