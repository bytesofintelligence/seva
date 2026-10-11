import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';

import { Button, Input } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { SPONSORSHIP_CATEGORIES } from '@/constants/sponsorship-categories';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { computePledgeAmount } from '@/lib/sponsorship-math';

interface SponsorshipItem {
  id: string;
  title: string;
  description: string | null;
  quantity_needed: number;
  unit_label: string;
  total_cost: number;
  period_start: string;
  period_end: string;
  category: string;
}

interface SponsorshipItemModalProps {
  visible: boolean;
  charityId: string;
  item?: SponsorshipItem | null; // present when editing
  duplicateFrom?: SponsorshipItem | null; // present when duplicating into a new period
  onClose: () => void;
  onSuccess: () => void;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SponsorshipItemModal({
  visible,
  charityId,
  item,
  duplicateFrom,
  onClose,
  onSuccess,
}: SponsorshipItemModalProps) {
  const isEditing = Boolean(item);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quantityNeeded, setQuantityNeeded] = useState('');
  const [unitLabel, setUnitLabel] = useState('items');
  const [totalCost, setTotalCost] = useState('');
  const [periodStart, setPeriodStart] = useState<Date>(startOfWeek(new Date()));
  const [periodEnd, setPeriodEnd] = useState<Date>(endOfWeek(new Date()));
  const [category, setCategory] = useState<string>('food');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && item) {
      setTitle(item.title);
      setDescription(item.description || '');
      setQuantityNeeded(String(item.quantity_needed));
      setUnitLabel(item.unit_label);
      setTotalCost(item.total_cost.toFixed(2));
      setPeriodStart(new Date(item.period_start));
      setPeriodEnd(new Date(item.period_end));
      setCategory(item.category);
    } else if (visible && duplicateFrom) {
      setTitle(duplicateFrom.title);
      setDescription(duplicateFrom.description || '');
      setQuantityNeeded(String(duplicateFrom.quantity_needed));
      setUnitLabel(duplicateFrom.unit_label);
      setTotalCost(duplicateFrom.total_cost.toFixed(2));
      const nextStart = startOfWeek(new Date(new Date(duplicateFrom.period_end).getTime() + 86400000));
      setPeriodStart(nextStart);
      setPeriodEnd(endOfWeek(nextStart));
      setCategory(duplicateFrom.category);
    } else if (visible) {
      setTitle('');
      setDescription('');
      setQuantityNeeded('');
      setUnitLabel('items');
      setTotalCost('');
      setPeriodStart(startOfWeek(new Date()));
      setPeriodEnd(endOfWeek(new Date()));
      setCategory('food');
    }
    setError(null);
  }, [visible, item, duplicateFrom]);

  const quantityNum = parseInt(quantityNeeded, 10);
  const costNum = parseFloat(totalCost);
  const hasValidPreviewInputs =
    !isNaN(quantityNum) && quantityNum > 0 && !isNaN(costNum) && costNum > 0;

  const previewLine = (() => {
    if (!hasValidPreviewInputs) return null;
    const exampleQty = Math.min(quantityNum, Math.max(1, Math.round(quantityNum * 0.4)));
    const exampleCost = computePledgeAmount(exampleQty, costNum, quantityNum);
    const unit = unitLabel.trim() || 'items';
    return `Sponsoring ${exampleQty} of ${quantityNum} ${unit} would cost £${exampleCost.toFixed(2)}`;
  })();

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (isNaN(quantityNum) || quantityNum <= 0) {
      setError('Quantity needed must be greater than 0');
      return;
    }
    if (!unitLabel.trim()) {
      setError('Unit label is required');
      return;
    }
    if (isNaN(costNum) || costNum <= 0) {
      setError('Total cost must be greater than 0');
      return;
    }
    if (periodEnd < periodStart) {
      setError('Period end must be on or after period start');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await haptics.medium();

      const payload = {
        charity_id: charityId,
        title: title.trim(),
        description: description.trim() || null,
        quantity_needed: quantityNum,
        unit_label: unitLabel.trim(),
        total_cost: Math.round(costNum * 100) / 100,
        period_start: toDateString(periodStart),
        period_end: toDateString(periodEnd),
        category,
      };

      const { error: dbError } = isEditing
        ? await supabase.from('sponsorship_items').update(payload).eq('id', item!.id)
        : await supabase.from('sponsorship_items').insert(payload);

      if (dbError) throw dbError;

      await haptics.success();
      onSuccess();
    } catch (err: any) {
      console.error('Error saving sponsorship item:', err);
      await haptics.warning();
      setError(err?.message || 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: Colors.cardBg }}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
          }}
        >
          <Text style={[Typography.screenTitle, { color: Colors.textPrimary, flex: 1 }]}>
            {isEditing ? 'Edit item' : duplicateFrom ? 'Duplicate item' : 'New item'}
          </Text>
          <TouchableOpacity onPress={onClose} disabled={loading}>
            <X size={22} color={Colors.textTertiary} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          {loading ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[Typography.body, { color: Colors.textSecondary }]}>Saving...</Text>
            </View>
          ) : (
            <>
              <Input
                label="Title *"
                placeholder="e.g., Samosas"
                value={title}
                onChangeText={setTitle}
              />

              <Input
                label="Description (optional)"
                placeholder="Any extra detail donors should know"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
              />

              <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Quantity needed *"
                    placeholder="50"
                    value={quantityNeeded}
                    onChangeText={setQuantityNeeded}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Unit label *"
                    placeholder="samosas"
                    value={unitLabel}
                    onChangeText={setUnitLabel}
                  />
                </View>
              </View>

              <Input
                label="Total cost (£) *"
                placeholder="30.00"
                value={totalCost}
                onChangeText={setTotalCost}
                keyboardType="decimal-pad"
              />

              {previewLine && (
                <View
                  style={{
                    backgroundColor: Colors.primaryTintBg,
                    borderRadius: BorderRadius.md,
                    padding: Spacing.md,
                  }}
                >
                  <Text style={[Typography.body, { color: Colors.primary, fontWeight: '500' }]}>
                    {previewLine}
                  </Text>
                </View>
              )}

              {/* Period */}
              <View>
                <Text
                  style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: '500', marginBottom: Spacing.sm }}
                >
                  Period
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                  <TouchableOpacity
                    onPress={() => setShowStartPicker(true)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: BorderRadius.md,
                      padding: Spacing.md,
                      backgroundColor: Colors.surfaceMuted,
                    }}
                  >
                    <Text style={[Typography.body, { color: Colors.textPrimary }]}>
                      {formatShort(periodStart)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowEndPicker(true)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: BorderRadius.md,
                      padding: Spacing.md,
                      backgroundColor: Colors.surfaceMuted,
                    }}
                  >
                    <Text style={[Typography.body, { color: Colors.textPrimary }]}>
                      {formatShort(periodEnd)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Category */}
              <View>
                <Text
                  style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: '500', marginBottom: Spacing.sm }}
                >
                  Category
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {SPONSORSHIP_CATEGORIES.map((c) => {
                    const selected = category === c.key;
                    const pair = Colors.category[c.color];
                    return (
                      <TouchableOpacity
                        key={c.key}
                        onPress={() => setCategory(c.key)}
                        style={{
                          paddingHorizontal: Spacing.md,
                          paddingVertical: Spacing.sm,
                          borderRadius: BorderRadius.pill,
                          backgroundColor: selected ? pair.bg : Colors.surfaceMuted,
                          borderWidth: selected ? 1 : 0,
                          borderColor: pair.text,
                        }}
                      >
                        <Text
                          style={[
                            Typography.chip,
                            { color: selected ? pair.text : Colors.textSecondary, fontWeight: selected ? '500' : '400' },
                          ]}
                        >
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {error && (
                <View
                  style={{
                    backgroundColor: Colors.category.coral.bg,
                    padding: Spacing.md,
                    borderRadius: BorderRadius.md,
                  }}
                >
                  <Text style={{ color: Colors.category.coral.text, fontSize: 13 }}>{error}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {!loading && (
          <View
            style={{
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.lg,
              gap: Spacing.md,
              borderTopWidth: 1,
              borderTopColor: Colors.border,
            }}
          >
            <Button label={isEditing ? 'Save changes' : 'Create item'} onPress={handleSubmit} variant="primary" size="lg" />
            <Button label="Cancel" onPress={onClose} variant="ghost" size="lg" />
          </View>
        )}
      </KeyboardAvoidingView>

      {showStartPicker && (
        <DateTimePicker
          value={periodStart}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowStartPicker(false);
            if (selected) setPeriodStart(selected);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={periodEnd}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowEndPicker(false);
            if (selected) setPeriodEnd(selected);
          }}
        />
      )}
    </Modal>
  );
}
