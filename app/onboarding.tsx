import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { CURRENCIES, CURRENCY_NAMES } from '@/lib/baseCurrency';
import { useBaseCurrencyState } from '@/lib/baseCurrencyContext';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import type { AccountType, Currency, Wallet } from '@/lib/types';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/lib/utils';

// First-run setup: the currency of the first account becomes the base currency for all totals.
// The root layout sends users here until a base currency is saved, and away once it is.
export default function OnboardingScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { setBaseCurrency } = useBaseCurrencyState();
  const [existing, setExisting] = useState<Wallet | null>(null);
  const [name, setName] = useState('Main account');
  const [type, setType] = useState<AccountType>('bank');
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [balance, setBalance] = useState('0');
  const [typePickerVisible, setTypePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A signup may already have created a default account; set that one up instead of adding a second.
  useEffect(() => {
    supabase.from('wallets').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      const wallets = (data ?? []) as Wallet[];
      const wallet = wallets.find((w) => w.is_default) ?? wallets[0];
      if (!wallet) return;
      setExisting(wallet);
      setName(wallet.name);
      setType(wallet.type ?? 'bank');
      setCurrency(wallet.currency);
      setBalance(String(wallet.starting_balance ?? 0));
    });
  }, []);

  async function handleContinue() {
    setError('');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // Changing a currency under existing transactions would corrupt them.
    const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) {
      // Not new after all; keep their HUF base (what the legacy check does).
      await setBaseCurrency('HUF');
      return;
    }

    const fields = {
      name: name.trim() || 'Main account',
      currency,
      type,
      starting_balance: parseFloat(balance) || 0,
    };
    const { error: walletError } = existing
      ? await supabase.from('wallets').update(fields).eq('id', existing.id)
      : await supabase.from('wallets').insert({
          ...fields, user_id: user.id, icon: '💰', color: '#7a5ce0', is_default: true,
        });
    if (walletError) {
      setError('Could not save your account. Please try again.');
      setSaving(false);
      return;
    }

    if (!(await setBaseCurrency(currency))) {
      setError('Could not save your base currency. Please try again.');
      setSaving(false);
    }
    // On success the root layout notices the saved currency and moves on to the app.
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>Set up your first account</Text>
          <Text style={[styles.intro, { color: colors.muted }]}>
            The currency of your first account is your base currency: totals, statistics and net worth are
            shown in it, and records in other currencies are converted to it. It can’t be changed later.
          </Text>

          <View style={styles.group}>
            <Text style={[styles.label, { color: colors.muted }]}>Currency</Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map((c) => {
                const active = currency === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCurrency(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.currencyOption,
                      { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent + '11' : colors.surface },
                    ]}
                  >
                    <Text style={[styles.currencyCode, { color: active ? colors.accent : colors.text }]}>{c}</Text>
                    <Text style={[styles.currencyName, { color: colors.muted }]}>{CURRENCY_NAMES[c]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <AppInput label="Account name" value={name} onChangeText={setName} placeholder="e.g. Main account" />

          <View style={styles.group}>
            <Text style={[styles.label, { color: colors.muted }]}>Type</Text>
            <TouchableOpacity
              onPress={() => setTypePickerVisible(true)}
              style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ color: colors.text, fontFamily: 'Nunito_600SemiBold', fontSize: 15 }}>{ACCOUNT_TYPE_LABELS[type]}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <AppInput
            label="Starting balance"
            value={balance}
            onChangeText={setBalance}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

          <AppButton onPress={handleContinue} loading={saving} fullWidth style={{ marginTop: 8 }}>
            Continue
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomModal visible={typePickerVisible} onClose={() => setTypePickerVisible(false)} title="Type">
        {ACCOUNT_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeRow, { borderBottomColor: colors.border }, type === t && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { setType(t); setTypePickerVisible(false); }}
          >
            <Text style={{ fontFamily: 'Nunito_400Regular', fontSize: 15, color: type === t ? colors.accent : colors.text }}>
              {ACCOUNT_TYPE_LABELS[t]}
            </Text>
            {type === t && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 14 },
  title: { fontSize: 22, fontFamily: 'Lora_700Bold', marginTop: 8 },
  intro: { fontSize: 14, fontFamily: 'Nunito_400Regular', lineHeight: 20 },
  group: { gap: 4 },
  label: { fontSize: 13, fontFamily: 'Nunito_500Medium', marginBottom: 2 },
  currencyRow: { flexDirection: 'row', gap: 8 },
  currencyOption: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  currencyCode: { fontSize: 16, fontFamily: 'Nunito_700Bold' },
  currencyName: { fontSize: 11, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 42,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  error: { fontSize: 13, fontFamily: 'Nunito_500Medium' },
});
