import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import ConfirmModal from '@/components/ConfirmModal';
import { Events } from '@/lib/events';
import type { Currency } from '@/lib/types';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];

type WalletForm = {
  name: string;
  currency: Currency;
  icon: string;
  is_default: boolean;
  is_archived: boolean;
  starting_balance: string;
};

export default function WalletScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [form, setForm] = useState<WalletForm>({
    name: '',
    currency: 'HUF',
    icon: '💰',
    is_default: false,
    is_archived: false,
    starting_balance: '0',
  });
  const [saving, setSaving] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase.from('wallets').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setForm({
        name: data.name,
        currency: data.currency,
        icon: data.icon ?? '💰',
        is_default: data.is_default,
        is_archived: data.is_archived ?? false,
        starting_balance: String(data.starting_balance ?? 0),
      });
    });
  }, [id]);

  function setField<K extends keyof WalletForm>(key: K, value: WalletForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name.trim(),
      currency: form.currency,
      icon: form.icon,
      is_default: form.is_default,
      is_archived: form.is_archived,
      starting_balance: parseFloat(form.starting_balance) || 0,
    };

    if (form.is_default) {
      await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
    }

    if (isNew) {
      await supabase.from('wallets').insert({ ...payload, user_id: user.id });
    } else {
      await supabase.from('wallets').update(payload).eq('id', id);
    }

    setSaving(false);
    Events.emit('wallet-saved', {});
    router.back();
  }

  async function handleDelete() {
    await supabase.from('wallets').delete().eq('id', id);
    Events.emit('wallet-saved', {});
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isNew ? 'Add account' : 'Edit account'}
        </Text>
        {!isNew ? (
          <TouchableOpacity onPress={() => setConfirmDelete(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconNameRow}>
            <AppInput
              label="Icon"
              value={form.icon}
              onChangeText={(v) => setField('icon', v)}
              placeholder="💰"
              style={{ width: 72 }}
            />
            <View style={{ flex: 1 }}>
              <AppInput
                label="Name"
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                placeholder="Account name"
              />
            </View>
          </View>

          <AppInput
            label="Starting balance"
            value={form.starting_balance}
            onChangeText={(v) => setField('starting_balance', v)}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <View style={styles.currencyWrapper}>
            <Text style={[styles.currencyLabel, { color: colors.muted }]}>Currency</Text>
            <TouchableOpacity
              onPress={() => setCurrencyPickerVisible(true)}
              style={[styles.currencyDropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ color: colors.text, fontFamily: 'Figtree_600SemiBold', fontSize: 15 }}>{form.currency}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.rowLabel, { color: colors.muted }]}>Set as default</Text>
            <Switch
              value={form.is_default}
              onValueChange={(v) => setField('is_default', v)}
              trackColor={{ true: colors.accent }}
              thumbColor="#fff"
            />
          </View>

          {!isNew && (
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.rowLabel, { color: form.is_archived ? colors.danger : colors.muted }]}>
                  {form.is_archived ? 'Archived' : 'Archive account'}
                </Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>
                  Transactions still count; account hidden from pickers
                </Text>
              </View>
              <Switch
                value={form.is_archived}
                onValueChange={(v) => {
                  if (v) setConfirmArchive(true);
                  else setField('is_archived', false);
                }}
                trackColor={{ true: colors.danger }}
                thumbColor="#fff"
              />
            </View>
          )}

          <AppButton onPress={handleSave} loading={saving} fullWidth style={{ marginTop: 8 }}>
            Save
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomModal visible={currencyPickerVisible} onClose={() => setCurrencyPickerVisible(false)} title="Currency">
        {CURRENCIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.currencyRow, { borderBottomColor: colors.border }, form.currency === c && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { setField('currency', c); setCurrencyPickerVisible(false); }}
          >
            <Text style={[styles.currencyRowText, { color: form.currency === c ? colors.accent : colors.text }]}>{c}</Text>
            {form.currency === c && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete account"
        message={`Delete "${form.name}"?`}
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        visible={confirmArchive}
        title="Archive account"
        message={`Archive "${form.name}"? It will be hidden from transaction pickers but all records will remain visible.`}
        confirmLabel="Archive"
        onConfirm={() => { setConfirmArchive(false); setField('is_archived', true); }}
        onCancel={() => setConfirmArchive(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  content: { padding: 16, gap: 14 },
  iconNameRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 14 },
  rowSub: { fontSize: 12, fontFamily: 'Figtree_400Regular' },
  currencyWrapper: {
    gap: 4,
  },
  currencyLabel: {
    fontSize: 13,
    fontFamily: 'Figtree_500Medium',
    marginBottom: 2,
  },
  currencyDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 42,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  currencyRowText: { fontSize: 15 },
});
