import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { X, Copy, Check, Minus, Plus } from 'lucide-react-native';

import { Button, Input } from '@/components/ui';
import { Spacing, Colors, BorderRadius, Typography } from '@/constants/design-tokens';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { useAuth } from '@/context/auth-context';
import { computePledgeAmount } from '@/lib/sponsorship-math';

export interface PledgeableItem {
  id: string;
  charity_id: string;
  charity_name: string;
  title: string;
  unit_label: string;
  quantity_needed: number;
  total_cost: number;
  quantity_remaining: number;
}

interface PledgeModalProps {
  visible: boolean;
  item: PledgeableItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

type QuantityChoice = 'quarter' | 'half' | 'remaining' | 'custom';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function PledgeModal({ visible, item, onClose, onSuccess }: PledgeModalProps) {
  const { session } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [quantityChoice, setQuantityChoice] = useState<QuantityChoice>('quarter');
  const [customQuantity, setCustomQuantity] = useState(1);
  const [giftAid, setGiftAid] = useState(false);
  const [giftAidFullName, setGiftAidFullName] = useState('');
  const [giftAidAddress, setGiftAidAddress] = useState('');
  const [giftAidPostcode, setGiftAidPostcode] = useState('');
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingWarning, setRemainingWarning] = useState<number | null>(null);
  const [pledge, setPledge] = useState<{ id: string; reference: string; quantity: number; amount: number } | null>(null);
  const [bankDetails, setBankDetails] = useState<{
    bank_account_name: string | null;
    bank_sort_code: string | null;
    bank_account_number: string | null;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bankUnavailable, setBankUnavailable] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setStep(1);
      setQuantityChoice('quarter');
      setCustomQuantity(Math.max(1, Math.min(item.quantity_remaining, Math.round(item.quantity_needed * 0.25)) || 1));
      setGiftAid(false);
      setGiftAidAddress('');
      setGiftAidPostcode('');
      setDeclarationChecked(false);
      setError(null);
      setRemainingWarning(null);
      setPledge(null);
      setBankDetails(null);
      setBankUnavailable(false);

      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session?.user.id)
        .single()
        .then(({ data }) => setGiftAidFullName(data?.full_name || ''));
    }
  }, [visible, item, session?.user.id]);

  const quantity = useMemo(() => {
    if (!item) return 0;
    const quarter = clamp(Math.round(item.quantity_needed * 0.25) || 1, 1, item.quantity_remaining);
    const half = clamp(Math.round(item.quantity_needed * 0.5) || 1, 1, item.quantity_remaining);
    switch (quantityChoice) {
      case 'quarter':
        return quarter;
      case 'half':
        return half;
      case 'remaining':
        return item.quantity_remaining;
      case 'custom':
        return clamp(customQuantity, 1, item.quantity_remaining);
      default:
        return quarter;
    }
  }, [item, quantityChoice, customQuantity]);

  const amount = item ? computePledgeAmount(quantity, item.total_cost, item.quantity_needed) : 0;

  const handleCopy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedField(label);
    await haptics.selection();
    setTimeout(() => setCopiedField((cur) => (cur === label ? null : cur)), 1500);
  };

  const handleContinueFromAmount = () => {
    if (!item || quantity < 1 || quantity > item.quantity_remaining) {
      setError('Please choose a valid quantity');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleCreatePledge = async () => {
    if (!item || !session?.user.id) return;

    if (giftAid) {
      if (!giftAidFullName.trim() || !giftAidAddress.trim() || !giftAidPostcode.trim()) {
        setError('Please fill in your name, address, and postcode for Gift Aid');
        return;
      }
      if (!declarationChecked) {
        setError('Please confirm the Gift Aid declaration');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setRemainingWarning(null);

    try {
      // Block here (step C) rather than earlier, per spec — checked via a
      // boolean-only RPC so we never query the raw bank columns directly
      // (see SECURITY.md: the general charities policy would leak them).
      const { data: acceptsSponsorship, error: acceptsError } = await supabase.rpc(
        'charity_accepts_sponsorship',
        { p_charity_id: item.charity_id }
      );
      if (acceptsError) throw acceptsError;
      if (!acceptsSponsorship) {
        setBankUnavailable(true);
        setLoading(false);
        setStep(3);
        return;
      }

      // Friendly first check — the real guarantee is the DB-side
      // enforce_pledge_capacity_trigger, which locks the item row and is
      // race-safe; this just avoids a round trip to the server error for
      // the common case where nothing has changed.
      const { data: progress, error: progressError } = await supabase
        .from('sponsorship_item_progress')
        .select('quantity_remaining')
        .eq('item_id', item.id)
        .single();
      if (progressError) throw progressError;

      const actualRemaining = progress?.quantity_remaining ?? 0;
      if (quantity > actualRemaining) {
        setRemainingWarning(actualRemaining);
        setLoading(false);
        return;
      }

      const finalAmount = computePledgeAmount(quantity, item.total_cost, item.quantity_needed);

      const { data: inserted, error: insertError } = await supabase
        .from('pledges')
        .insert({
          item_id: item.id,
          volunteer_id: session.user.id,
          quantity,
          amount: finalAmount,
          gift_aid: giftAid,
          gift_aid_full_name: giftAid ? giftAidFullName.trim() : null,
          gift_aid_address: giftAid ? giftAidAddress.trim() : null,
          gift_aid_postcode: giftAid ? giftAidPostcode.trim() : null,
        })
        .select('id, reference, quantity, amount')
        .single();

      if (insertError) {
        // The DB trigger is the real source of truth — if someone else's
        // pledge landed between our friendly check above and this insert,
        // it rejects here instead of allowing an over-pledge.
        if (insertError.message?.includes('left (requested')) {
          const { data: freshProgress } = await supabase
            .from('sponsorship_item_progress')
            .select('quantity_remaining')
            .eq('item_id', item.id)
            .single();
          setRemainingWarning(freshProgress?.quantity_remaining ?? 0);
          setLoading(false);
          return;
        }
        throw insertError;
      }

      const { data: bank, error: bankError } = await supabase.rpc('get_bank_details', {
        p_charity_id: item.charity_id,
      });
      if (bankError) throw bankError;

      setPledge(inserted);
      setBankDetails(Array.isArray(bank) ? bank[0] : bank);
      await haptics.success();
      setStep(3);
    } catch (err: any) {
      console.error('Error creating pledge:', err);
      await haptics.warning();
      setError(err?.message || 'Failed to create pledge');
    } finally {
      setLoading(false);
    }
  };

  const adjustToAvailable = () => {
    if (remainingWarning === null) return;
    setQuantityChoice('custom');
    setCustomQuantity(Math.max(1, remainingWarning));
    setRemainingWarning(null);
    setStep(1);
  };

  const handleConfirmTransfer = () => {
    if (!pledge) return;
    Alert.alert(
      "I've made the transfer",
      'This tells the charity to check for your transfer using the reference code.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await haptics.medium();
              const { error: updateError } = await supabase
                .from('pledges')
                .update({ status: 'transfer_claimed' })
                .eq('id', pledge.id);
              if (updateError) throw updateError;
              await haptics.success();
              onSuccess();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to update pledge');
            }
          },
        },
      ]
    );
  };

  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
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
            borderBottomColor: Colors.border,
          }}
        >
          <Text style={[Typography.screenTitle, { color: Colors.textPrimary, flex: 1 }]}>
            {step === 1 ? 'Choose amount' : step === 2 ? 'Gift Aid' : 'Transfer details'}
          </Text>
          <TouchableOpacity onPress={onClose} disabled={loading}>
            <X size={22} color={Colors.textTertiary} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[Typography.body, { color: Colors.textSecondary }]}>Just a moment...</Text>
            </View>
          )}

          {!loading && step === 1 && (
            <>
              <View
                style={{
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                }}
              >
                <Text style={[Typography.cardTitle, { color: Colors.textPrimary }]}>{item.title}</Text>
                <Text style={[Typography.meta, { color: Colors.textSecondary, marginTop: 2 }]}>
                  {item.charity_name} • {item.quantity_remaining} {item.unit_label} still needed
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {(
                  [
                    { key: 'quarter', label: '25%' },
                    { key: 'half', label: '50%' },
                    { key: 'remaining', label: 'Remaining' },
                    { key: 'custom', label: 'Custom' },
                  ] as { key: QuantityChoice; label: string }[]
                ).map((opt) => {
                  const selected = quantityChoice === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setQuantityChoice(opt.key)}
                      style={{
                        paddingHorizontal: Spacing.md,
                        paddingVertical: Spacing.sm,
                        borderRadius: BorderRadius.pill,
                        backgroundColor: selected ? Colors.primary : Colors.surfaceMuted,
                      }}
                    >
                      <Text
                        style={[
                          Typography.chip,
                          { color: selected ? Colors.cardBg : Colors.textSecondary, fontWeight: selected ? '500' : '400' },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {quantityChoice === 'custom' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg }}>
                  <TouchableOpacity
                    onPress={() => setCustomQuantity((q) => clamp(q - 1, 1, item.quantity_remaining))}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: BorderRadius.pill,
                      backgroundColor: Colors.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Minus size={18} color={Colors.textPrimary} strokeWidth={1.5} />
                  </TouchableOpacity>
                  <Text style={[Typography.ringNumber, { color: Colors.textPrimary, minWidth: 60, textAlign: 'center' }]}>
                    {customQuantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCustomQuantity((q) => clamp(q + 1, 1, item.quantity_remaining))}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: BorderRadius.pill,
                      backgroundColor: Colors.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={18} color={Colors.textPrimary} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
              )}

              <View
                style={{
                  backgroundColor: Colors.primaryTintBg,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                  alignItems: 'center',
                }}
              >
                <Text style={[Typography.body, { color: Colors.primary, fontWeight: '500' }]}>
                  {quantity} {item.unit_label} • £{amount.toFixed(2)}
                </Text>
              </View>

              {error && (
                <Text style={{ color: Colors.category.coral.text, fontSize: 13 }}>{error}</Text>
              )}
            </>
          )}

          {!loading && step === 2 && (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                }}
              >
                <Text style={[Typography.body, { color: Colors.textPrimary, flex: 1, marginRight: Spacing.md }]}>
                  I am a UK taxpayer and want to add Gift Aid
                </Text>
                <Switch
                  value={giftAid}
                  onValueChange={setGiftAid}
                  trackColor={{ true: Colors.primary, false: Colors.border }}
                />
              </View>

              <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                Gift Aid lets the charity claim an extra 25p per £1 from HMRC at no cost to you. You
                must have paid at least as much UK Income/Capital Gains Tax this year as all
                charities will reclaim on your donations.
              </Text>

              {giftAid && (
                <>
                  <Input
                    label="Full name"
                    value={giftAidFullName}
                    onChangeText={setGiftAidFullName}
                  />
                  <Input
                    label="Home address"
                    value={giftAidAddress}
                    onChangeText={setGiftAidAddress}
                    multiline
                    numberOfLines={2}
                  />
                  <Input
                    label="Postcode"
                    value={giftAidPostcode}
                    onChangeText={setGiftAidPostcode}
                    autoCapitalize="characters"
                  />

                  <TouchableOpacity
                    onPress={() => setDeclarationChecked((c) => !c)}
                    style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: BorderRadius.sm,
                        borderWidth: 1,
                        borderColor: declarationChecked ? Colors.primary : Colors.border,
                        backgroundColor: declarationChecked ? Colors.primary : Colors.cardBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                      }}
                    >
                      {declarationChecked && <Check size={14} color={Colors.cardBg} strokeWidth={2.5} />}
                    </View>
                    <Text style={[Typography.meta, { color: Colors.textSecondary, flex: 1 }]}>
                      I confirm I want the charity to treat this donation, and any donations I make in
                      the future or have made in the past 4 years, as Gift Aid donations. I understand
                      that if I pay less Income Tax/Capital Gains Tax in the current tax year than the
                      amount of Gift Aid claimed on all my donations, it is my responsibility to pay
                      any difference.
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {error && (
                <Text style={{ color: Colors.category.coral.text, fontSize: 13 }}>{error}</Text>
              )}
            </>
          )}

          {!loading && step === 3 && bankUnavailable && (
            <View
              style={{
                backgroundColor: Colors.category.amber.bg,
                borderRadius: BorderRadius.md,
                padding: Spacing.lg,
                alignItems: 'center',
                gap: Spacing.sm,
              }}
            >
              <Text style={[Typography.body, { color: Colors.category.amber.text, textAlign: 'center', fontWeight: '500' }]}>
                {item.charity_name} hasn't added their bank details yet
              </Text>
              <Text style={[Typography.meta, { color: Colors.category.amber.text, textAlign: 'center' }]}>
                We can't take a pledge until they do — please check back soon.
              </Text>
            </View>
          )}

          {!loading && step === 3 && !bankUnavailable && pledge && (
            <>
              <View
                style={{
                  backgroundColor: Colors.primaryTintBg,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.lg,
                  alignItems: 'center',
                }}
              >
                <Text style={[Typography.meta, { color: Colors.textSecondary }]}>Reference</Text>
                <TouchableOpacity
                  onPress={() => handleCopy('reference', pledge.reference)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs }}
                >
                  <Text
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 28,
                      fontWeight: '500',
                      color: Colors.primary,
                      letterSpacing: 2,
                    }}
                  >
                    {pledge.reference}
                  </Text>
                  {copiedField === 'reference' ? (
                    <Check size={20} color={Colors.primary} strokeWidth={2} />
                  ) : (
                    <Copy size={18} color={Colors.primary} strokeWidth={1.5} />
                  )}
                </TouchableOpacity>
                <Text style={[Typography.meta, { color: Colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' }]}>
                  Use this exact reference so {item.charity_name} can match your transfer
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: Colors.surfaceMuted,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                }}
              >
                <Text style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
                  £{pledge.amount.toFixed(2)}
                </Text>

                {[
                  { label: 'Account name', value: bankDetails?.bank_account_name },
                  { label: 'Sort code', value: bankDetails?.bank_sort_code },
                  { label: 'Account number', value: bankDetails?.bank_account_number },
                ].map((row) => (
                  <View
                    key={row.label}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: Spacing.sm,
                      borderTopWidth: 1,
                      borderTopColor: Colors.border,
                    }}
                  >
                    <View>
                      <Text style={[Typography.meta, { color: Colors.textSecondary }]}>{row.label}</Text>
                      <Text style={[Typography.body, { color: Colors.textPrimary, fontWeight: '500' }]}>
                        {row.value || '—'}
                      </Text>
                    </View>
                    {row.value && (
                      <TouchableOpacity onPress={() => handleCopy(row.label, row.value!)}>
                        {copiedField === row.label ? (
                          <Check size={18} color={Colors.primary} strokeWidth={2} />
                        ) : (
                          <Copy size={18} color={Colors.textTertiary} strokeWidth={1.5} />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              <Text style={[Typography.meta, { color: Colors.textSecondary, textAlign: 'center' }]}>
                Your pledge reserves these items for 48 hours
              </Text>
            </>
          )}

          {remainingWarning !== null && (
            <View
              style={{
                backgroundColor: Colors.category.amber.bg,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                gap: Spacing.sm,
              }}
            >
              <Text style={{ color: Colors.category.amber.text }}>
                Only {remainingWarning} {item.unit_label} left — adjust?
              </Text>
              <Button label={`Adjust to ${remainingWarning}`} onPress={adjustToAvailable} variant="primary" size="sm" />
            </View>
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
            {step === 1 && <Button label="Continue" onPress={handleContinueFromAmount} variant="primary" size="lg" />}
            {step === 2 && (
              <>
                <Button label="Continue" onPress={handleCreatePledge} variant="primary" size="lg" />
                <Button label="Back" onPress={() => setStep(1)} variant="ghost" size="lg" />
              </>
            )}
            {step === 3 && bankUnavailable && <Button label="Close" onPress={onClose} variant="primary" size="lg" />}
            {step === 3 && !bankUnavailable && (
              <>
                <Button label="I've made the transfer" onPress={handleConfirmTransfer} variant="primary" size="lg" />
                <Button label="I'll do it later" onPress={onSuccess} variant="ghost" size="lg" />
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
