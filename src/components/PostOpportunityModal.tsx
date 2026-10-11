import { useState } from 'react';
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, ProgressStep } from '@/components/ui';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { clearOtherFlagships } from '@/lib/flagship';

interface PostOpportunityModalProps {
  visible: boolean;
  charityId: string;
  charityName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const OPPORTUNITY_TYPES = ['Delivery', 'On-site', 'Remote', 'Hybrid'];
const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Local calendar date, not `d.toISOString().slice(0, 10)` — the picker gives
// local midnight, and toISOString() converts to UTC first, which rolls back
// to the previous day in any timezone ahead of UTC (e.g. BST). That mismatch
// meant an exception date never matched the occurrence_date it was meant to
// cancel.
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PostOpportunityModal({
  visible,
  charityId,
  charityName,
  onClose,
  onSuccess,
}: PostOpportunityModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState<Date>(new Date());
  const [volunteersNeeded, setVolunteersNeeded] = useState('');
  const [featured, setFeatured] = useState(false);
  const [signupMode, setSignupMode] = useState<'review' | 'auto_confirm'>('review');
  const [maxVolunteers, setMaxVolunteers] = useState('');
  const [requiresAdditionalInfo, setRequiresAdditionalInfo] = useState(false);
  const [additionalInfoPrompt, setAdditionalInfoPrompt] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const TOTAL_STEPS = 3;

  // Recurring series fields
  const [repeatEvent, setRepeatEvent] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'daily'>('weekly');
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState(5); // Friday
  const [templateTime, setTemplateTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 30, 0, 0);
    return d;
  });
  const [templateDurationMinutes, setTemplateDurationMinutes] = useState('120');
  const [generateWeeksAhead, setGenerateWeeksAhead] = useState(12);
  const [showTemplateTimePicker, setShowTemplateTimePicker] = useState(false);
  const [exceptionDates, setExceptionDates] = useState<Date[]>([]);
  const [showExceptionDatePicker, setShowExceptionDatePicker] = useState(false);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        startsAt.getHours(),
        startsAt.getMinutes()
      );
      setStartsAt(newDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(
        startsAt.getFullYear(),
        startsAt.getMonth(),
        startsAt.getDate(),
        selectedTime.getHours(),
        selectedTime.getMinutes()
      );
      setStartsAt(newDate);
    }
  };

  const handleSubmitSingle = async (volunteersNeededNum: number, maxVolunteersNum: number | null) => {
    if (featured) {
      await clearOtherFlagships(charityId);
    }

    // Insert opportunity with charity_id linking to the charity
    // target_volunteers is the single source of truth for volunteer count
    const { error: insertError } = await supabase.from('opportunities').insert({
      charity_id: charityId,
      title: title.trim(),
      description: description.trim() || null,
      type: type!.toLowerCase(),
      location: location.trim(),
      starts_at: startsAt.toISOString(),
      status: 'active',
      featured,
      signup_mode: signupMode,
      target_volunteers: volunteersNeededNum,
      max_volunteers: maxVolunteersNum,
      requires_additional_info: requiresAdditionalInfo,
      additional_info_prompt: requiresAdditionalInfo ? additionalInfoPrompt.trim() || null : null,
    });

    if (insertError) {
      throw insertError;
    }
  };

  const handleSubmitSeries = async (volunteersNeededNum: number, maxVolunteersNum: number | null): Promise<string> => {
    const templateTimeString = `${String(templateTime.getHours()).padStart(2, '0')}:${String(
      templateTime.getMinutes()
    ).padStart(2, '0')}:00`;

    const template = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim(),
      type: type!.toLowerCase(),
      latitude: null,
      longitude: null,
      target_volunteers: volunteersNeededNum,
      max_volunteers: maxVolunteersNum,
      signup_mode: signupMode,
      featured,
    };

    const exceptionDateStrings = exceptionDates.map(toLocalDateString);

    if (featured) {
      await clearOtherFlagships(charityId);
    }

    const { data: series, error: seriesError } = await supabase
      .from('opportunity_series')
      .insert({
        charity_id: charityId,
        title: title.trim(),
        recurrence_type: recurrenceType,
        recurrence_day_of_week: recurrenceDayOfWeek,
        template_time: templateTimeString,
        template_duration_minutes: parseInt(templateDurationMinutes, 10),
        generate_weeks_ahead: generateWeeksAhead,
        exception_dates: exceptionDateStrings,
        template,
      })
      .select()
      .single();

    if (seriesError) throw seriesError;

    const today = new Date();
    const fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;

    const { data: insertedCount, error: rpcError } = await supabase.rpc('generate_series_occurrences', {
      p_series_id: series.id,
      p_from_date: fromDate,
      p_weeks: generateWeeksAhead,
    });

    if (rpcError) throw rpcError;

    // Cancel any generated occurrence that lands on an exception date so it
    // never appears to volunteers.
    if (exceptionDateStrings.length > 0) {
      const { error: cancelError } = await supabase
        .from('opportunities')
        .update({ status: 'cancelled' })
        .eq('series_id', series.id)
        .in('occurrence_date', exceptionDateStrings);

      if (cancelError) throw cancelError;
    }

    // Fetch the last generated occurrence date for the success message.
    const { data: lastOccurrence } = await supabase
      .from('opportunities')
      .select('occurrence_date')
      .eq('series_id', series.id)
      .order('occurrence_date', { ascending: false })
      .limit(1)
      .single();

    // Parse the DATE-only string at local midnight, not `new Date(dateOnlyString)`
    // (which reads as UTC midnight and can render as the previous day).
    const endDateLabel = lastOccurrence?.occurrence_date
      ? new Date(`${lastOccurrence.occurrence_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    const cadenceLabel = recurrenceType === 'weekly' ? `every ${DAY_NAMES[recurrenceDayOfWeek]}` : 'every day';

    return `${insertedCount ?? 0} occurrences created — ${cadenceLabel} through ${endDateLabel}. ${exceptionDateStrings.length} date${
      exceptionDateStrings.length === 1 ? '' : 's'
    } marked as exceptions.`;
  };

  const handleSubmit = async () => {
    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!location.trim()) {
      setError('Location is required');
      return;
    }

    if (!type) {
      setError('Opportunity type is required');
      return;
    }

    if (!volunteersNeeded.trim()) {
      setError('Volunteers needed is required');
      return;
    }

    const volunteersNeededNum = parseInt(volunteersNeeded, 10);
    if (isNaN(volunteersNeededNum) || volunteersNeededNum < 1) {
      setError('Volunteers needed must be at least 1');
      return;
    }

    // Parse optional max_volunteers
    const maxVolunteersNum = maxVolunteers.trim() ? parseInt(maxVolunteers, 10) : null;
    if (maxVolunteersNum !== null && (isNaN(maxVolunteersNum) || maxVolunteersNum < 1)) {
      setError('Max volunteers must be at least 1');
      return;
    }

    // Validate that max_volunteers >= target_volunteers
    if (maxVolunteersNum !== null && maxVolunteersNum < volunteersNeededNum) {
      setError(`Max volunteers (${maxVolunteersNum}) must be at least the target volunteers (${volunteersNeededNum})`);
      return;
    }

    if (repeatEvent) {
      if (generateWeeksAhead < 1 || generateWeeksAhead > 52) {
        setError('Weeks ahead must be between 1 and 52');
        return;
      }
      const durationNum = parseInt(templateDurationMinutes, 10);
      if (isNaN(durationNum) || durationNum < 1) {
        setError('Duration must be at least 1 minute');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      await haptics.medium();

      let successMessage: string | null = null;
      if (repeatEvent) {
        successMessage = await handleSubmitSeries(volunteersNeededNum, maxVolunteersNum);
      } else {
        await handleSubmitSingle(volunteersNeededNum, maxVolunteersNum);
      }

      await haptics.success();

      if (successMessage) {
        Alert.alert('Series Created', successMessage, [{ text: 'OK', onPress: onSuccess }]);
      } else {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error creating opportunity:', err);
      await haptics.warning();
      setError(err?.message || 'Failed to create opportunity');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setType(null);
    setLocation('');
    setStartsAt(new Date());
    setVolunteersNeeded('');
    setFeatured(false);
    setSignupMode('review');
    setMaxVolunteers('');
    setRequiresAdditionalInfo(false);
    setAdditionalInfoPrompt('');
    setError(null);
    setRepeatEvent(false);
    setRecurrenceType('weekly');
    setRecurrenceDayOfWeek(5);
    const defaultTime = new Date();
    defaultTime.setHours(18, 30, 0, 0);
    setTemplateTime(defaultTime);
    setTemplateDurationMinutes('120');
    setGenerateWeeksAhead(12);
    setExceptionDates([]);
    onClose();
  };

  const formatDate = () => {
    return startsAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = () => {
    return startsAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
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
          <ThemedText type="h3" style={{ color: Colors.textPrimary, flex: 1 }}>
            Post Opportunity
          </ThemedText>
          <TouchableOpacity onPress={handleClose} disabled={loading}>
            <ThemedText style={{ color: Colors.primary, fontSize: 16 }}>
              ✕
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={{
            padding: Spacing.lg,
            gap: Spacing.lg,
          }}
        >
          {loading ? (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: Spacing.xxl,
                gap: Spacing.md,
              }}
            >
              <ActivityIndicator size="large" color={Colors.primary} />
              <ThemedText style={{ color: Colors.textSecondary, fontWeight: '500' }}>
                Publishing your opportunity...
              </ThemedText>
              <ThemedText style={{ color: Colors.textSecondary, fontSize: 12 }}>
                This usually takes just a moment
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Progress Indicator */}
              <ProgressStep
                currentStep={currentStep}
                totalSteps={TOTAL_STEPS}
                stepLabel={currentStep === 1 ? 'Basics' : currentStep === 2 ? 'Details' : 'Confirm'}
              />

              <View>
                <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.md }}>
                  Posting for:
                </ThemedText>
                <ThemedText
                  type="h3"
                  style={{
                    color: Colors.textPrimary,
                  }}
                >
                  {charityName}
                </ThemedText>
              </View>

              {/* Title */}
              <Input
                label="Opportunity Title *"
                placeholder="e.g., Paint the Community Park"
                value={title}
                onChangeText={setTitle}
                editable={!loading}
              />

              {/* Description */}
              <View>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                  }}
                >
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
                  editable={!loading}
                />
              </View>

              {/* Type */}
              <View>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                  }}
                >
                  Type of Work *
                </ThemedText>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: Spacing.sm,
                    flexWrap: 'wrap',
                  }}
                >
                  {OPPORTUNITY_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t)}
                      disabled={loading}
                      style={{
                        paddingHorizontal: Spacing.md,
                        paddingVertical: Spacing.sm,
                        borderRadius: BorderRadius.full,
                        backgroundColor:
                          type === t
                            ? Colors.primary
                            : Colors.surfaceMuted,
                        borderWidth: type === t ? 0 : 1,
                        borderColor: Colors.border,
                      }}
                    >
                      <ThemedText
                        style={{
                          color:
                            type === t ? Colors.cardBg : Colors.textPrimary,
                          fontWeight: '600',
                          fontSize: 13,
                        }}
                      >
                        {t}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Location */}
              <Input
                label="Location *"
                placeholder="Where will the work take place?"
                value={location}
                onChangeText={setLocation}
                editable={!loading}
              />

              {/* Date (hidden when repeating; recurrence fields below replace it) */}
              {!repeatEvent && (
                <View>
                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 14,
                      fontWeight: '600',
                      marginBottom: Spacing.md,
                    }}
                  >
                    Date & Time
                  </ThemedText>
                  <View style={{ gap: Spacing.md }}>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(true)}
                      disabled={loading}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: BorderRadius.md,
                        padding: Spacing.md,
                        backgroundColor: Colors.cardBg,
                      }}
                    >
                      <ThemedText style={{ color: Colors.textPrimary }}>
                        {formatDate()}
                      </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowTimePicker(true)}
                      disabled={loading}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: BorderRadius.md,
                        padding: Spacing.md,
                        backgroundColor: Colors.cardBg,
                      }}
                    >
                      <ThemedText style={{ color: Colors.textPrimary }}>
                        {formatTime()}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Repeat this event toggle */}
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <ThemedText
                    style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600' }}
                  >
                    Repeat this event?
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => setRepeatEvent(!repeatEvent)}
                    disabled={loading}
                    style={{
                      paddingHorizontal: Spacing.lg,
                      paddingVertical: Spacing.sm,
                      borderRadius: BorderRadius.full,
                      backgroundColor: repeatEvent ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: repeatEvent ? 0 : 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: repeatEvent ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {repeatEvent ? 'On' : 'Off'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {repeatEvent && (
                <>
                  {/* Recurrence Type */}
                  <View>
                    <ThemedText
                      style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}
                    >
                      Repeats
                    </ThemedText>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      {(['weekly', 'daily'] as const).map((rt) => (
                        <TouchableOpacity
                          key={rt}
                          onPress={() => setRecurrenceType(rt)}
                          disabled={loading}
                          style={{
                            flex: 1,
                            paddingVertical: Spacing.md,
                            borderRadius: BorderRadius.md,
                            backgroundColor: recurrenceType === rt ? Colors.primary : Colors.surfaceMuted,
                            borderWidth: recurrenceType === rt ? 0 : 1,
                            borderColor: Colors.border,
                          }}
                        >
                          <ThemedText
                            style={{
                              color: recurrenceType === rt ? Colors.cardBg : Colors.textPrimary,
                              fontWeight: '600',
                              textAlign: 'center',
                            }}
                          >
                            {rt === 'weekly' ? 'Weekly' : 'Daily'}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Day of Week (weekly only) */}
                  {recurrenceType === 'weekly' && (
                    <View>
                      <ThemedText
                        style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}
                      >
                        Which Day?
                      </ThemedText>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' }}>
                        {DAYS_OF_WEEK.map((d) => (
                          <TouchableOpacity
                            key={d.value}
                            onPress={() => setRecurrenceDayOfWeek(d.value)}
                            disabled={loading}
                            style={{
                              paddingHorizontal: Spacing.md,
                              paddingVertical: Spacing.sm,
                              borderRadius: BorderRadius.full,
                              backgroundColor: recurrenceDayOfWeek === d.value ? Colors.primary : Colors.surfaceMuted,
                              borderWidth: recurrenceDayOfWeek === d.value ? 0 : 1,
                              borderColor: Colors.border,
                            }}
                          >
                            <ThemedText
                              style={{
                                color: recurrenceDayOfWeek === d.value ? Colors.cardBg : Colors.textPrimary,
                                fontWeight: '600',
                                fontSize: 13,
                              }}
                            >
                              {d.label}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Template Time */}
                  <View>
                    <ThemedText
                      style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}
                    >
                      Start Time
                    </ThemedText>
                    <TouchableOpacity
                      onPress={() => setShowTemplateTimePicker(true)}
                      disabled={loading}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: BorderRadius.md,
                        padding: Spacing.md,
                        backgroundColor: Colors.cardBg,
                      }}
                    >
                      <ThemedText style={{ color: Colors.textPrimary }}>
                        {templateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* Duration */}
                  <Input
                    label="Duration (minutes)"
                    placeholder="e.g., 120"
                    value={templateDurationMinutes}
                    onChangeText={setTemplateDurationMinutes}
                    keyboardType="number-pad"
                    editable={!loading}
                  />

                  {/* Generate Weeks Ahead Stepper */}
                  <View>
                    <ThemedText
                      style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}
                    >
                      Generate How Many Weeks Ahead?
                    </ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.lg }}>
                      <TouchableOpacity
                        onPress={() => setGenerateWeeksAhead(Math.max(1, generateWeeksAhead - 1))}
                        disabled={loading}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: BorderRadius.md,
                          backgroundColor: Colors.surfaceMuted,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ThemedText style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: '600' }}>−</ThemedText>
                      </TouchableOpacity>
                      <ThemedText style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: '600', minWidth: 32, textAlign: 'center' }}>
                        {generateWeeksAhead}
                      </ThemedText>
                      <TouchableOpacity
                        onPress={() => setGenerateWeeksAhead(Math.min(52, generateWeeksAhead + 1))}
                        disabled={loading}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: BorderRadius.md,
                          backgroundColor: Colors.surfaceMuted,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ThemedText style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: '600' }}>+</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Exception Dates */}
                  <View>
                    <ThemedText
                      style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: Spacing.md }}
                    >
                      Exception Dates (dates to skip)
                    </ThemedText>
                    {exceptionDates.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md }}>
                        {exceptionDates.map((d, idx) => (
                          <TouchableOpacity
                            key={`${d.toISOString()}-${idx}`}
                            onPress={() =>
                              setExceptionDates(exceptionDates.filter((_, i) => i !== idx))
                            }
                            disabled={loading}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: Spacing.xs,
                              paddingHorizontal: Spacing.md,
                              paddingVertical: Spacing.sm,
                              borderRadius: BorderRadius.full,
                              backgroundColor: Colors.surfaceMuted,
                            }}
                          >
                            <ThemedText style={{ color: Colors.textPrimary, fontSize: 13 }}>
                              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ✕
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => setShowExceptionDatePicker(true)}
                      disabled={loading}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: BorderRadius.md,
                        padding: Spacing.md,
                        backgroundColor: Colors.cardBg,
                      }}
                    >
                      <ThemedText style={{ color: Colors.textSecondary }}>+ Add exception date</ThemedText>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Volunteers Needed */}
              <Input
                label="Volunteers Needed *"
                placeholder="e.g., 10"
                value={volunteersNeeded}
                onChangeText={setVolunteersNeeded}
                keyboardType="number-pad"
                editable={!loading}
              />

              {/* Featured Event Toggle */}
              <View>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                  }}
                >
                  Mark as Flagship Event?
                </ThemedText>
                <ThemedText style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md }}>
                  Your flagship event is pinned to the top of the volunteer app and stays visible even once full. Only one event can be flagship — marking this one will un-flag whichever event currently holds that spot.
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => setFeatured(false)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: featured ? Colors.surfaceMuted : Colors.primary,
                      borderWidth: featured ? 1 : 0,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: featured ? Colors.textPrimary : Colors.cardBg,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      Regular
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setFeatured(true)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: featured ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: !featured ? 1 : 0,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: featured ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      ✨ Flagship
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Signup Mode Toggle */}
              <View>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                  }}
                >
                  How Should Signups Work?
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => setSignupMode('review')}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: signupMode === 'review' ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: signupMode === 'review' ? 0 : 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: signupMode === 'review' ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        fontSize: 13,
                        textAlign: 'center',
                      }}
                    >
                      You Review
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSignupMode('auto_confirm')}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: signupMode === 'auto_confirm' ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: signupMode === 'auto_confirm' ? 0 : 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: signupMode === 'auto_confirm' ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        fontSize: 13,
                        textAlign: 'center',
                      }}
                    >
                      Auto-Confirm
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Max Volunteers (Hard Cap) */}
              <Input
                label="Max Volunteers (Hard Cap) - Optional"
                placeholder="Leave blank for unlimited"
                value={maxVolunteers}
                onChangeText={setMaxVolunteers}
                keyboardType="number-pad"
                editable={!loading}
              />

              {/* Additional Information Toggle */}
              <View>
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                  }}
                >
                  Request Additional Information?
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => setRequiresAdditionalInfo(false)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: !requiresAdditionalInfo ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: !requiresAdditionalInfo ? 0 : 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: !requiresAdditionalInfo ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      No
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setRequiresAdditionalInfo(true)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.md,
                      borderRadius: BorderRadius.md,
                      backgroundColor: requiresAdditionalInfo ? Colors.primary : Colors.surfaceMuted,
                      borderWidth: requiresAdditionalInfo ? 0 : 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: requiresAdditionalInfo ? Colors.cardBg : Colors.textPrimary,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      Yes
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Additional Information Prompt */}
              {requiresAdditionalInfo && (
                <View>
                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 14,
                      fontWeight: '600',
                      marginBottom: Spacing.md,
                    }}
                  >
                    What would you like to know?
                  </ThemedText>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: BorderRadius.md,
                      padding: Spacing.md,
                      minHeight: 180,
                      maxHeight: 240,
                      color: Colors.textPrimary,
                      fontSize: 14,
                      textAlignVertical: 'top',
                    }}
                    placeholder="e.g., What volunteer experience do you have? Why are you interested in volunteering with us?"
                    placeholderTextColor={Colors.border}
                    value={additionalInfoPrompt}
                    onChangeText={setAdditionalInfoPrompt}
                    multiline
                    editable={!loading}
                  />
                </View>
              )}

              {/* Error Message */}
              {error && (
                <View
                  style={{
                    backgroundColor: Colors.category.coral.text,
                    padding: Spacing.md,
                    borderRadius: BorderRadius.md,
                  }}
                >
                  <ThemedText style={{ color: Colors.cardBg }}>
                    {error}
                  </ThemedText>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Footer Buttons */}
        {!loading && (
          <View
            style={{
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.lg,
              gap: Spacing.md,
              borderTopWidth: 1,
              borderTopColor: Colors.surfaceMuted,
            }}
          >
            <Button
              label="Post Opportunity"
              onPress={handleSubmit}
              variant="primary"
              size="lg"
            />
            <Button label="Cancel" onPress={handleClose} variant="ghost" size="lg" />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={startsAt}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={startsAt}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

      {/* Template Time Picker (series) */}
      {showTemplateTimePicker && (
        <DateTimePicker
          value={templateTime}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowTemplateTimePicker(false);
            if (selectedTime) {
              const d = new Date();
              d.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              setTemplateTime(d);
            }
          }}
        />
      )}

      {/* Exception Date Picker (series) */}
      {showExceptionDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowExceptionDatePicker(false);
            if (selectedDate) {
              setExceptionDates([...exceptionDates, selectedDate]);
            }
          }}
        />
      )}
    </Modal>
  );
}
