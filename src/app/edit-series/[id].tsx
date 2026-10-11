import { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen, Button, Input } from '@/components/ui';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { clearOtherFlagships } from '@/lib/flagship';
import { withRoleGuard } from '@/components/auth/RoleGate';

const OPPORTUNITY_TYPES = ['Delivery', 'On-site', 'Remote', 'Hybrid'];

interface SeriesTemplate {
  title: string;
  description: string | null;
  location: string;
  type: string | null;
  target_volunteers: number | null;
  max_volunteers: number | null;
  signup_mode: 'review' | 'auto_confirm';
  featured: boolean;
}

function EditSeriesTemplateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The nearest upcoming active occurrence, used as the target when the
  // coordinator picks "this week only" — since this screen isn't opened
  // from a specific occurrence row, we treat the next one as "this week".
  const [nearestOccurrenceId, setNearestOccurrenceId] = useState<string | null>(null);
  const [charityId, setCharityId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [volunteersNeeded, setVolunteersNeeded] = useState('');
  const [maxVolunteers, setMaxVolunteers] = useState('');
  const [featured, setFeatured] = useState(false);
  const [signupMode, setSignupMode] = useState<'review' | 'auto_confirm'>('review');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const { data: seriesData, error: seriesError } = await supabase
        .from('opportunity_series')
        .select('template, charity_id')
        .eq('id', id)
        .single();

      if (seriesError || !seriesData) {
        setError(seriesError?.message || 'Series not found');
        setLoading(false);
        return;
      }

      setCharityId(seriesData.charity_id);
      const template = seriesData.template as SeriesTemplate;
      setTitle(template.title || '');
      setDescription(template.description || '');
      setType(template.type ? template.type.charAt(0).toUpperCase() + template.type.slice(1) : null);
      setLocation(template.location || '');
      setVolunteersNeeded(template.target_volunteers ? String(template.target_volunteers) : '');
      setMaxVolunteers(template.max_volunteers ? String(template.max_volunteers) : '');
      setFeatured(!!template.featured);
      setSignupMode(template.signup_mode || 'review');

      const { data: nextOcc } = await supabase
        .from('opportunities')
        .select('id')
        .eq('series_id', id)
        .eq('status', 'active')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(1)
        .single();

      setNearestOccurrenceId(nextOcc?.id || null);
      setLoading(false);
    };

    load();
  }, [id]);

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
      signup_mode: signupMode,
      featured,
    };
  };

  const validate = () => {
    if (!title.trim()) return 'Title is required';
    if (!location.trim()) return 'Location is required';
    if (!type) return 'Opportunity type is required';
    const volunteersNeededNum = parseInt(volunteersNeeded, 10);
    if (!volunteersNeeded.trim() || isNaN(volunteersNeededNum) || volunteersNeededNum < 1) {
      return 'Volunteers needed must be at least 1';
    }
    return null;
  };

  const applyToThisWeekOnly = async (fields: ReturnType<typeof buildFields>) => {
    if (!nearestOccurrenceId) {
      Alert.alert('No upcoming occurrence', 'There is no upcoming active occurrence to update.');
      return;
    }
    const { error: updateError } = await supabase
      .from('opportunities')
      .update(fields)
      .eq('id', nearestOccurrenceId);

    if (updateError) throw updateError;
  };

  const applyToAllFutureActive = async (fields: ReturnType<typeof buildFields>) => {
    // Only rows that are still upcoming and active are touched — past
    // occurrences and already-cancelled ones are left as historical record.
    const { error: updateError } = await supabase
      .from('opportunities')
      .update(fields)
      .eq('series_id', id)
      .gt('starts_at', new Date().toISOString())
      .eq('status', 'active');

    if (updateError) throw updateError;
  };

  const handleSave = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    Alert.alert(
      'Apply changes to…',
      'Apply changes to this week only, or update all future active occurrences?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'This week only',
          onPress: () => saveWithScope('this_week'),
        },
        {
          text: 'All future occurrences',
          onPress: () => saveWithScope('all_future'),
        },
      ]
    );
  };

  const saveWithScope = async (scope: 'this_week' | 'all_future') => {
    setSaving(true);
    try {
      const fields = buildFields();

      if (fields.featured && charityId) {
        await clearOtherFlagships(charityId, { seriesId: Array.isArray(id) ? id[0] : id });
      }

      // Always update the series template itself so future generated
      // occurrences (via generate_series_occurrences) pick up the new values.
      const { error: seriesUpdateError } = await supabase
        .from('opportunity_series')
        .update({ title: fields.title, template: fields })
        .eq('id', id);

      if (seriesUpdateError) throw seriesUpdateError;

      if (scope === 'this_week') {
        await applyToThisWeekOnly(fields);
      } else {
        await applyToAllFutureActive(fields);
      }

      await haptics.success();
      router.back();
    } catch (err: any) {
      await haptics.warning();
      setError(err?.message || 'Failed to save series template');
    } finally {
      setSaving(false);
    }
  };

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
          Edit Series Template
        </ThemedText>
        <TouchableOpacity onPress={() => router.back()} disabled={saving}>
          <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>✕</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        <Input label="Opportunity Title *" value={title} onChangeText={setTitle} editable={!saving} />

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

        <Input label="Location *" value={location} onChangeText={setLocation} editable={!saving} />
        <Input label="Volunteers Needed *" value={volunteersNeeded} onChangeText={setVolunteersNeeded} keyboardType="number-pad" editable={!saving} />
        <Input label="Max Volunteers (Hard Cap) - Optional" value={maxVolunteers} onChangeText={setMaxVolunteers} keyboardType="number-pad" editable={!saving} />

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

      <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.surfaceMuted }}>
        {saving ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Button label="Save" onPress={handleSave} variant="primary" size="lg" />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// Coordinator-only route. RLS in Postgres is the real boundary; this stops
// the screen rendering at all for a volunteer who reaches it by deep link.
export default withRoleGuard(EditSeriesTemplateScreen, 'charity');
