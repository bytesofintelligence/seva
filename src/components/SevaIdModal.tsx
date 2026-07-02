import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import { X, CheckCircle2 } from 'lucide-react-native';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';

interface SevaIdModalProps {
  visible: boolean;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  onClose: () => void;
}

interface AssociatedCharity {
  name: string;
}

export function SevaIdModal({
  visible,
  userId,
  fullName,
  avatarUrl,
  onClose,
}: SevaIdModalProps) {
  const [charities, setCharities] = useState<AssociatedCharity[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [volunteerId, setVolunteerId] = useState<string>('SEVA-00000');

  useEffect(() => {
    if (visible) {
      fetchAssociatedCharities();
      resolveAvatarUrl();
      fetchVolunteerId();
    }
  }, [visible, userId, avatarUrl]);

  const fetchVolunteerId = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('volunteer_id')
        .eq('id', userId)
        .single();

      if (data?.volunteer_id) {
        setVolunteerId(data.volunteer_id);
      }
    } catch (err) {
      console.error('Error fetching volunteer ID:', err);
    }
  };

  const resolveAvatarUrl = async () => {
    setImageFailed(false);

    if (!avatarUrl) {
      setResolvedAvatarUrl(null);
      return;
    }

    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      setResolvedAvatarUrl(avatarUrl);
      return;
    }

    try {
      const { data } = await supabase.storage
        .from('avatars')
        .createSignedUrl(avatarUrl, 60 * 60);

      setResolvedAvatarUrl(data?.signedUrl ?? null);
    } catch (err) {
      console.error('Error resolving avatar URL:', err);
      setResolvedAvatarUrl(null);
    }
  };

  const fetchAssociatedCharities = async () => {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('applications')
        .select('opportunities(charities(name))')
        .eq('volunteer_id', userId)
        .in('status', ['confirmed', 'approved', 'in_progress', 'completed']);

      if (data) {
        const charitySet = new Set<string>();
        data.forEach((app: any) => {
          if (app.opportunities?.charities?.name) {
            charitySet.add(app.opportunities.charities.name);
          }
        });

        setCharities(
          Array.from(charitySet).map((name) => ({ name }))
        );
      }
    } catch (err) {
      console.error('Error fetching charities:', err);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.lg,
          }}
        >
          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 40,
              right: 20,
              zIndex: 10,
              backgroundColor: Colors.cardBg,
              borderRadius: BorderRadius.full,
              padding: Spacing.sm,
            }}
          >
            <X size={24} color={Colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          {/* ID Card */}
          <View
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: Colors.cardBg,
              borderRadius: BorderRadius.xxl,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {/* Header Background */}
            <View
              style={{
                backgroundColor: Colors.primary,
                height: 100,
              }}
            />

            {/* Main Content */}
            <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg }}>
              {/* Avatar */}
              <View
                style={{
                  alignItems: 'center',
                  marginTop: -60,
                  marginBottom: Spacing.lg,
                }}
              >
                <View
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: BorderRadius.full,
                    borderWidth: 4,
                    borderColor: Colors.cardBg,
                    backgroundColor: Colors.surfaceMuted,
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  {resolvedAvatarUrl && !imageFailed ? (
                    <Image
                      source={{ uri: resolvedAvatarUrl }}
                      style={{ width: 140, height: 140 }}
                      contentFit="cover"
                      transition={150}
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 48,
                        fontWeight: '600',
                        color: Colors.textSecondary,
                      }}
                    >
                      {fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>

              {/* Name */}
              <Text
                style={{
                  ...Typography.heroTitle,
                  color: Colors.textPrimary,
                  textAlign: 'center',
                  marginBottom: Spacing.sm,
                }}
              >
                {fullName}
              </Text>

              {/* Verified Badge */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: Spacing.lg,
                  gap: Spacing.sm,
                }}
              >
                <CheckCircle2
                  size={20}
                  color={Colors.primary}
                  strokeWidth={2}
                  fill={Colors.primary}
                />
                <Text
                  style={{
                    ...Typography.cardTitle,
                    color: Colors.primary,
                    fontWeight: '600',
                  }}
                >
                  Verified Volunteer
                </Text>
              </View>

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: Colors.border,
                  marginBottom: Spacing.lg,
                }}
              />

              {/* Volunteer ID */}
              <View style={{ marginBottom: Spacing.lg }}>
                <Text
                  style={{
                    ...Typography.meta,
                    color: Colors.textTertiary,
                    marginBottom: Spacing.xs,
                  }}
                >
                  VOLUNTEER ID
                </Text>
                <Text
                  style={{
                    ...Typography.cardTitle,
                    color: Colors.textPrimary,
                    fontFamily: 'Courier New',
                    letterSpacing: 2,
                  }}
                >
                  {volunteerId}
                </Text>
              </View>

              {/* Charities Section */}
              <View>
                <Text
                  style={{
                    ...Typography.meta,
                    color: Colors.textTertiary,
                    marginBottom: Spacing.sm,
                  }}
                >
                  {charities.length === 1 ? 'CHARITY' : 'CHARITIES'}
                </Text>
                {loading ? (
                  <Text style={{ ...Typography.body, color: Colors.textSecondary }}>
                    Loading...
                  </Text>
                ) : charities.length > 0 ? (
                  <View style={{ gap: Spacing.sm }}>
                    {charities.map((charity, idx) => (
                      <View
                        key={idx}
                        style={{
                          backgroundColor: Colors.primaryTintBg,
                          paddingHorizontal: Spacing.md,
                          paddingVertical: Spacing.sm,
                          borderRadius: BorderRadius.md,
                        }}
                      >
                        <Text
                          style={{
                            ...Typography.body,
                            color: Colors.primary,
                            fontWeight: '500',
                          }}
                        >
                          {charity.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ ...Typography.body, color: Colors.textSecondary }}>
                    No confirmed opportunities yet
                  </Text>
                )}
              </View>

              {/* Footer */}
              <View
                style={{
                  marginTop: Spacing.lg,
                  paddingTop: Spacing.lg,
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    ...Typography.meta,
                    color: Colors.textTertiary,
                  }}
                >
                  This ID verifies volunteer status
                </Text>
                <Text
                  style={{
                    ...Typography.meta,
                    color: Colors.textTertiary,
                    marginTop: Spacing.xs,
                  }}
                >
                  Valid throughout SEVA network
                </Text>
              </View>
            </View>
          </View>

          {/* Instructions */}
          <View style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
            <Text
              style={{
                ...Typography.body,
                color: Colors.cardBg,
                textAlign: 'center',
              }}
            >
              Show this card to verify your volunteer status
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
