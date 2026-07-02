import { useState, useEffect } from 'react';
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
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { useAuth } from '@/context/auth-context';
import { ApplicationStatus } from '@/types/status';

interface ApplicationModalProps {
  visible: boolean;
  opportunityId: string;
  opportunityTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalState = 'form' | 'loading' | 'success' | 'error';

export function ApplicationModal({
  visible,
  opportunityId,
  opportunityTitle,
  onClose,
  onSuccess,
}: ApplicationModalProps) {
  const { session } = useAuth();
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [state, setState] = useState<ModalState>('form');
  const [error, setError] = useState<string | null>(null);
  const [requiresAdditionalInfo, setRequiresAdditionalInfo] = useState(false);
  const [additionalInfoPrompt, setAdditionalInfoPrompt] = useState('');
  const [loadingOpportunity, setLoadingOpportunity] = useState(true);

  // Fetch opportunity details when modal opens
  useEffect(() => {
    if (visible) {
      fetchOpportunityDetails();
    }
  }, [visible, opportunityId]);

  const fetchOpportunityDetails = async () => {
    try {
      const { data, error: oppError } = await supabase
        .from('opportunities')
        .select('requires_additional_info, additional_info_prompt')
        .eq('id', opportunityId)
        .single();

      if (oppError) throw oppError;

      setRequiresAdditionalInfo(data?.requires_additional_info || false);
      setAdditionalInfoPrompt(data?.additional_info_prompt || '');
    } catch (err) {
      console.error('Error fetching opportunity details:', err);
    } finally {
      setLoadingOpportunity(false);
    }
  };

  // Reset form state when modal closes
  useEffect(() => {
    if (!visible) {
      setAdditionalInfo('');
      setPartySize(1);
      setState('form');
      setError(null);
      setLoadingOpportunity(true);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!session?.user.id) {
      setError('You must be logged in to offer to help');
      setState('error');
      return;
    }

    if (requiresAdditionalInfo && !additionalInfo.trim()) {
      setError('Please answer the additional information question');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);

    try {
      // Check if user has already applied to this opportunity
      const { data: existingApp, error: checkError } = await supabase
        .from('applications')
        .select('status, id')
        .eq('volunteer_id', session.user.id)
        .eq('opportunity_id', opportunityId);

      // If they already have an application, check if they can re-apply
      let existingAppId: string | null = null;
      if (existingApp && existingApp.length > 0) {
        const appStatus = existingApp[0].status;
        existingAppId = existingApp[0].id;

        // Only allow re-applying if they previously withdrew (cancelled status)
        // Block if: rejected, confirmed, approved, in_progress, or completed
        if (appStatus !== 'cancelled') {
          setError(`You've already applied to this opportunity (status: ${appStatus})`);
          setState('error');
          await haptics.warning();
          return;
        }
      }

      if (checkError) {
        throw checkError;
      }
      // Fetch opportunity details (signup_mode, max_volunteers) - already fetched, but fetch again for fresh data
      const { data: opportunityData, error: oppError } = await supabase
        .from('opportunities')
        .select('signup_mode, target_volunteers, max_volunteers')
        .eq('id', opportunityId)
        .single();

      if (oppError) {
        throw oppError;
      }

      const { signup_mode, target_volunteers, max_volunteers } = opportunityData || {};

      // Determine effective cap: use max_volunteers if set, otherwise use target_volunteers (no overbooking)
      const effectiveCap = max_volunteers !== null ? max_volunteers : target_volunteers;

      // Check volunteer cap
      if (effectiveCap !== null) {
        const { data: countData, error: countError } = await supabase
          .from('opportunity_volunteer_counts')
          .select('volunteers_count')
          .eq('id', opportunityId)
          .single();

        if (countError && countError.code !== 'PGRST116') {
          throw countError;
        }

        const currentCount = countData?.volunteers_count || 0;
        const newTotal = currentCount + partySize;

        if (newTotal > effectiveCap) {
          setError(
            `This event is at capacity. ${currentCount} volunteers have signed up (max: ${effectiveCap}).`
          );
          setState('error');
          return;
        }
      }

      // Determine status based on signup_mode
      const applicationStatus: ApplicationStatus = signup_mode === 'auto_confirm' ? 'confirmed' : 'pending';

      // If they're re-applying after withdrawal, update the cancelled application
      // Otherwise, insert a new application
      if (existingAppId) {
        // Re-applying after withdrawal - update the cancelled application
        const { error: updateError } = await supabase
          .from('applications')
          .update({
            additional_info: requiresAdditionalInfo ? additionalInfo.trim() : null,
            party_size: partySize,
            status: applicationStatus,
          })
          .eq('id', existingAppId);

        if (updateError) {
          throw updateError;
        }
      } else {
        // New application - insert into database
        // RLS policy ensures volunteer_id = auth.uid()
        const { error: insertError } = await supabase
          .from('applications')
          .insert({
            volunteer_id: session.user.id,
            opportunity_id: opportunityId,
            additional_info: requiresAdditionalInfo ? additionalInfo.trim() : null,
            party_size: partySize,
            status: applicationStatus,
          });

        if (insertError) {
          throw insertError;
        }
      }

      setState('success');
      await haptics.success();

      // Auto-close and navigate after 2 seconds
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error submitting application:', err);
      setError(err?.message || 'Failed to submit application');
      setState('error');
    }
  };

  const handleClose = () => {
    setAdditionalInfo('');
    setPartySize(1);
    setError(null);
    setState('form');
    onClose();
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
            Offer to Help
          </ThemedText>
          <TouchableOpacity onPress={handleClose} disabled={state === 'loading'}>
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
          {/* Form State */}
          {state === 'form' && (
            <>
              <View>
                <ThemedText style={{ color: Colors.textSecondary, marginBottom: Spacing.md }}>
                  Applying to:
                </ThemedText>
                <ThemedText
                  type="h3"
                  style={{
                    color: Colors.textPrimary,
                  }}
                >
                  {opportunityTitle}
                </ThemedText>
              </View>

              {/* Party Size Stepper */}
              <View
                style={{
                  backgroundColor: Colors.surfaceMuted,
                  padding: Spacing.lg,
                  borderRadius: BorderRadius.md,
                }}
              >
                <ThemedText
                  style={{
                    color: Colors.textPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                    marginBottom: Spacing.md,
                    textAlign: 'center',
                  }}
                >
                  How many of you are coming?
                </ThemedText>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: Spacing.lg,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setPartySize(Math.max(1, partySize - 1))}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: Colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ThemedText
                      style={{
                        color: Colors.cardBg,
                        fontSize: 20,
                        fontWeight: '700',
                      }}
                    >
                      −
                    </ThemedText>
                  </TouchableOpacity>

                  <ThemedText
                    style={{
                      color: Colors.textPrimary,
                      fontSize: 28,
                      fontWeight: '700',
                      minWidth: 40,
                      textAlign: 'center',
                    }}
                  >
                    {partySize}
                  </ThemedText>

                  <TouchableOpacity
                    onPress={() => setPartySize(Math.min(20, partySize + 1))}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: Colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ThemedText
                      style={{
                        color: Colors.cardBg,
                        fontSize: 20,
                        fontWeight: '700',
                      }}
                    >
                      +
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <ThemedText
                  style={{
                    color: Colors.textSecondary,
                    fontSize: 12,
                    marginTop: Spacing.md,
                    textAlign: 'center',
                  }}
                >
                  1–20 people
                </ThemedText>
              </View>

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
                    Tell them about yourself
                  </ThemedText>
                  {additionalInfoPrompt && (
                    <ThemedText
                      style={{
                        color: Colors.textSecondary,
                        fontSize: 13,
                        marginBottom: Spacing.md,
                        fontStyle: 'italic',
                      }}
                    >
                      {additionalInfoPrompt}
                    </ThemedText>
                  )}

                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: BorderRadius.md,
                      padding: Spacing.md,
                      minHeight: 160,
                      maxHeight: 240,
                      color: Colors.textPrimary,
                      fontSize: 14,
                      textAlignVertical: 'top',
                    }}
                    placeholder="Write your response..."
                    placeholderTextColor={Colors.border}
                    value={additionalInfo}
                    onChangeText={setAdditionalInfo}
                    multiline
                    editable={state === 'form'}
                  />
                </View>
              )}

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

          {/* Loading State */}
          {state === 'loading' && (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: Spacing.xxl,
                gap: Spacing.md,
              }}
            >
              <ActivityIndicator size="large" color={Colors.primary} />
              <ThemedText style={{ color: Colors.textSecondary }}>
                Submitting your offer...
              </ThemedText>
            </View>
          )}

          {/* Success State */}
          {state === 'success' && (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: Spacing.xxl,
                gap: Spacing.md,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: Colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 32,
                    color: Colors.cardBg,
                  }}
                >
                  ✓
                </ThemedText>
              </View>
              <ThemedText
                type="h2"
                style={{
                  textAlign: 'center',
                  color: Colors.textPrimary,
                }}
              >
                Thank you for offering!
              </ThemedText>
              <ThemedText
                style={{
                  textAlign: 'center',
                  color: Colors.textSecondary,
                  fontSize: 14,
                }}
              >
                The charity will review your offer soon.
              </ThemedText>
            </View>
          )}

          {/* Error State */}
          {state === 'error' && (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: Spacing.xl,
                gap: Spacing.md,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: Colors.category.coral.text,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 32,
                    color: Colors.cardBg,
                  }}
                >
                  !
                </ThemedText>
              </View>
              <ThemedText
                type="h2"
                style={{
                  textAlign: 'center',
                  color: Colors.textPrimary,
                }}
              >
                Something went wrong
              </ThemedText>
              <ThemedText
                style={{
                  textAlign: 'center',
                  color: Colors.textSecondary,
                  fontSize: 14,
                }}
              >
                {error || 'Failed to submit application'}
              </ThemedText>
            </View>
          )}
        </ScrollView>

        {/* Footer Buttons */}
        {state === 'form' && (
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
              label="Offer to Help"
              onPress={handleSubmit}
              variant="primary"
              size="lg"
            />
            <Button
              label="Cancel"
              onPress={handleClose}
              variant="ghost"
              size="lg"
            />
          </View>
        )}

        {state === 'error' && (
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
              label="Try Again"
              onPress={() => setState('form')}
              variant="primary"
              size="lg"
            />
            <Button
              label="Cancel"
              onPress={handleClose}
              variant="ghost"
              size="lg"
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
