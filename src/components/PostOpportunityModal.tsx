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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, ProgressStep } from '@/components/ui';
import { Spacing, Colors, BorderRadius } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';

interface PostOpportunityModalProps {
  visible: boolean;
  charityId: string;
  charityName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const OPPORTUNITY_TYPES = ['Delivery', 'On-site', 'Remote', 'Hybrid'];

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

    setLoading(true);
    setError(null);

    try {
      await haptics.medium();

      // Parse optional max_volunteers
      const maxVolunteersNum = maxVolunteers.trim() ? parseInt(maxVolunteers, 10) : null;
      if (maxVolunteersNum !== null && (isNaN(maxVolunteersNum) || maxVolunteersNum < 1)) {
        setError('Max volunteers must be at least 1');
        return;
      }

      // Insert opportunity with charity_id linking to the charity
      // target_volunteers is the single source of truth for volunteer count
      const { error: insertError } = await supabase.from('opportunities').insert({
        charity_id: charityId,
        title: title.trim(),
        description: description.trim() || null,
        type: type.toLowerCase(),
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

      await haptics.success();
      onSuccess();
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

              {/* Date */}
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
    </Modal>
  );
}
