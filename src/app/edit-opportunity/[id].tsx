import { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Screen, Button, Input } from '@/components/ui';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { clearOtherFlagships } from '@/lib/flagship';
import { withRoleGuard } from '@/components/auth/RoleGate';

const OPPORTUNITY_TYPES = ['Delivery', 'On-site', 'Remote', 'Hybrid'];

function EditOpportunityScreen() {
  const router = useRouter();
  const { id, duplicatedFrom } = useLocalSearchParams<{ id: string; duplicatedFrom?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [volunteersNeeded, setVolunteersNeeded] = useState('');
  const [maxVolunteers, setMaxVolunteers] = useState('');
  const [featured, setFeatured] = useState(false);
  const [signupMode, setSignupMode] = useState<'review' | 'auto_confirm'>('review');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [charityId, setCharityId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message || 'Opportunity not found');
        setLoading(false);
        return;
      }

      setTitle(data.title || '');
      setDescription(data.description || '');
      setType(data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : null);
      setLocation(data.location || '');
      setStartsAt(data.starts_at ? new Date(data.starts_at) : null);
      setVolunteersNeeded(data.target_volunteers ? String(data.target_volunteers) : '');
      setMaxVolunteers(data.max_volunteers ? String(data.max_volunteers) : '');
      setFeatured(!!data.featured);
      setSignupMode(data.signup_mode || 'review');
      setCharityId(data.charity_id);
      setLoading(false);
    };

    load();
  }, [id]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const base = startsAt || new Date();
      setStartsAt(
        new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          base.getHours(),
          base.getMinutes()
        )
      );
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const base = startsAt || new Date();
      setStartsAt(
        new Date(
          base.getFullYear(),
          base.getMonth(),
          base.getDate(),
          selectedTime.getHours(),
          selectedTime.getMinutes()
        )
      );
    }
  };

  const buildFields = () => {
    const volunteersNeededNum = parseInt(volunteersNeeded, 10);
    const maxVolunteersNum = maxVolunteers.trim() ? parseInt(maxVolunteers, 10) : null;

    return {
      title: title.trim(),
      description: description.trim() || null,
      type: type ? type.toLowerCase() : null,
      location: location.trim(),
      target_volunteers: isNaN(volunteersNeededNum) ? null : volunteersNeededNum,
      max_volunteers: maxVolunteersNum,
      featured,
      signup_mode: signupMode,
      starts_at: startsAt ? startsAt.toISOString() : null,
    };
  };

  const validateCommon = () => {
    if (!title.trim()) return 'Title is required';
    if (!location.trim()) return 'Location is required';
    if (!type) return 'Opportunity type is required';
    const volunteersNeededNum = parseInt(volunteersNeeded, 10);
    if (!volunteersNeeded.trim() || isNaN(volunteersNeededNum) || volunteersNeededNum < 1) {
      return 'Volunteers needed must be at least 1';
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const validationError = validateCommon();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (featured && charityId) {
        await clearOtherFlagships(charityId, { opportunityId: id });
      }

      const { error: updateError } = await supabase
        .from('opportunities')
        .update({ ...buildFields(), status: 'draft' })
        .eq('id', id);

      if (updateError) throw updateError;

      await haptics.success();
      router.back();
    } catch (err: any) {
      await haptics.warning();
      setError(err?.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    const validationError = validateCommon();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!startsAt) {
      setError('Pick a date and time before publishing');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (featured && charityId) {
        await clearOtherFlagships(charityId, { opportunityId: id });
      }

      const { error: updateError } = await supabase
        .from('opportunities')
        .update({ ...buildFields(), status: 'active' })
        .eq('id', id);

      if (updateError) throw updateError;

      await haptics.success();
      router.back();
    } catch (err: any) {
      await haptics.warning();
      setError(err?.message || 'Failed to publish opportunity');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = () =>
    startsAt
      ? startsAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'Pick a date';

  const formatTime = () =>
    startsAt ? startsAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Pick a time';

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
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
          borderBottomColor: Colors.surfaceMuted,
        }}
      >
        <ThemedText type="title" style={{ color: Colors.textPrimary, flex: 1 }}>
          Edit Opportunity
        </ThemedText>
        <TouchableOpacity onPress={() => router.back()} disabled={saving}>
          <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>✕</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        {!!duplicatedFrom && (
          <View
            style={{
              backgroundColor: Colors.category.amber.bg,
              padding: Spacing.md,
              borderRadius: BorderRadius.md,
            }}
          >
            <ThemedText style={{ color: Colors.category.amber.text, fontSize: 13 }}>
              Duplicated from {duplicatedFrom} — set a date and publish when ready.
            </ThemedText>
          </View>
        )}

        <Input label="Opportunity Title *" placeholder="e.g., Paint the Community Park" value={title} onChangeText={setTitle} editable={!saving} />

        <View>
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}>
            Description
          </ThemedText>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: BorderRadius.md,
              padding: Spacing.md,
              minHeight: 120,
              maxHeight: 180,
              color: Colors.textPrimary,
              fontSize: 14,
              textAlignVertical: 'top',
            }}
            placeholder="Describe the volunteer opportunity..."
            placeholderTextColor={Colors.border}
            value={description}
            onChangeText={setDescription}
            multiline
            editable={!saving}
          />
        </View>

        <View>
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}>
            Type of Work *
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
            {OPPORTUNITY_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                disabled={saving}
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.sm,
                  borderRadius: BorderRadius.full,
                  backgroundColor: type === t ? Colors.primary : Colors.surfaceMuted,
                  borderWidth: type === t ? 0 : 1,
                  borderColor: Colors.border,
                }}
              >
                <ThemedText style={{ color: type === t ? Colors.cardBg : Colors.textPrimary, fontWeight: '600', fontSize: 13 }}>
                  {t}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input label="Location *" placeholder="Where will the work take place?" value={location} onChangeText={setLocation} editable={!saving} />

        <View>
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}>
            Date & Time
          </ThemedText>
          <View style={{ gap: Spacing.md }}>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              disabled={saving}
              style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, backgroundColor: Colors.cardBg }}
            >
              <ThemedText style={{ color: startsAt ? Colors.textPrimary : Colors.textTertiary }}>{formatDate()}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              disabled={saving}
              style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, backgroundColor: Colors.cardBg }}
            >
              <ThemedText style={{ color: startsAt ? Colors.textPrimary : Colors.textTertiary }}>{formatTime()}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <Input label="Volunteers Needed *" placeholder="e.g., 10" value={volunteersNeeded} onChangeText={setVolunteersNeeded} keyboardType="number-pad" editable={!saving} />

        <Input label="Max Volunteers (Hard Cap) - Optional" placeholder="Leave blank for unlimited" value={maxVolunteers} onChangeText={setMaxVolunteers} keyboardType="number-pad" editable={!saving} />

        <View>
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}>
            Mark as Flagship Event?
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md }}>
            Your flagship event is pinned to the top of the volunteer app and stays visible even once full. Only one event can be flagship — marking this one will un-flag whichever event currently holds that spot.
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TouchableOpacity
              onPress={() => setFeatured(false)}
              disabled={saving}
              style={{ flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: featured ? Colors.surfaceMuted : Colors.primary, borderWidth: featured ? 1 : 0, borderColor: Colors.border }}
            >
              <ThemedText style={{ color: featured ? Colors.textPrimary : Colors.cardBg, fontWeight: '600', textAlign: 'center' }}>Regular</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFeatured(true)}
              disabled={saving}
              style={{ flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: featured ? Colors.primary : Colors.surfaceMuted, borderWidth: !featured ? 1 : 0, borderColor: Colors.border }}
            >
              <ThemedText style={{ color: featured ? Colors.cardBg : Colors.textPrimary, fontWeight: '600', textAlign: 'center' }}>✨ Flagship</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View>
          <ThemedText style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}>
            How Should Signups Work?
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TouchableOpacity
              onPress={() => setSignupMode('review')}
              disabled={saving}
              style={{ flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: signupMode === 'review' ? Colors.primary : Colors.surfaceMuted, borderWidth: signupMode === 'review' ? 0 : 1, borderColor: Colors.border }}
            >
              <ThemedText style={{ color: signupMode === 'review' ? Colors.cardBg : Colors.textPrimary, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>You Review</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSignupMode('auto_confirm')}
              disabled={saving}
              style={{ flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: signupMode === 'auto_confirm' ? Colors.primary : Colors.surfaceMuted, borderWidth: signupMode === 'auto_confirm' ? 0 : 1, borderColor: Colors.border }}
            >
              <ThemedText style={{ color: signupMode === 'auto_confirm' ? Colors.cardBg : Colors.textPrimary, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>Auto-Confirm</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View style={{ backgroundColor: Colors.category.coral.text, padding: Spacing.md, borderRadius: BorderRadius.md }}>
            <ThemedText style={{ color: Colors.cardBg }}>{error}</ThemedText>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceMuted }}>
        {saving ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <>
            <Button label="Publish" onPress={handlePublish} variant="primary" size="lg" />
            <Button label="Save as Draft" onPress={handleSaveDraft} variant="ghost" size="lg" />
          </>
        )}
      </View>

      {showDatePicker && <DateTimePicker value={startsAt || new Date()} mode="date" display="default" onChange={handleDateChange} />}
      {showTimePicker && <DateTimePicker value={startsAt || new Date()} mode="time" display="default" onChange={handleTimeChange} />}
    </KeyboardAvoidingView>
  );
}

// Coordinator-only route. RLS in Postgres is the real boundary; this stops
// the screen rendering at all for a volunteer who reaches it by deep link.
export default withRoleGuard(EditOpportunityScreen, 'charity');
