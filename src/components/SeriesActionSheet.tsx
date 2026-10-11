import { Modal, View, TouchableOpacity, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';

interface SeriesActionSheetProps {
  visible: boolean;
  title: string;
  onManageSeries: () => void;
  onAddExceptionDate: () => void;
  onDismiss: () => void;
}

export function SeriesActionSheet({
  visible,
  title,
  onManageSeries,
  onAddExceptionDate,
  onDismiss,
}: SeriesActionSheetProps) {
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
            style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md, textAlign: 'center' }}
            numberOfLines={1}
          >
            {title}
          </ThemedText>

          <TouchableOpacity
            onPress={onManageSeries}
            style={{ paddingVertical: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border }}
          >
            <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center' }}>
              Manage series
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onAddExceptionDate}
            style={{ paddingVertical: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border }}
          >
            <ThemedText style={{ color: Colors.textPrimary, fontSize: 16, textAlign: 'center' }}>
              Add exception date
            </ThemedText>
          </TouchableOpacity>

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
