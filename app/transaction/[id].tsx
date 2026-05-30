import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import DatePickerModal from '@/components/DatePickerModal';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, Category, Label, TransactionType } from '@/lib/types';

type Form = {
  type: TransactionType;
  amount: string;
  wallet_id: string;
  category_id: string;
  date: string;
  notes: string;
  payer: string;
  labelIds: string[];
};

export default function EditTransactionScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [form, setForm] = useState<Form>({
    type: 'expense',
    amount: '',
    wallet_id: '',
    category_id: '',
    date: '',
    notes: '',
    payer: '',
    labelIds: [],
  });

  const amountRef = useRef<TextInput>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [isTransfer, setIsTransfer] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: w }, { data: c }, { data: l }, { data: tx }] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
        supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
        supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
        supabase
          .from('transactions')
          .select('*, transaction_labels(label_id)')
          .eq('id', id)
          .single(),
      ]);

      setWallets(w ?? []);
      setCategories(c ?? []);
      setLabels(l ?? []);

      if (tx) {
        setIsTransfer(!!tx.transfer_group_id);
        setForm({
          type: tx.type,
          amount: String(tx.amount),
          wallet_id: tx.wallet_id ?? '',
          category_id: tx.category_id ?? '',
          date: tx.date,
          notes: tx.notes ?? '',
          payer: tx.payer ?? '',
          labelIds: (tx.transaction_labels ?? []).map((tl: any) => tl.label_id),
        });
      }

      setFetching(false);
    }
    loadData();
  }, [id]);

  function setField<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleLabel(labelId: string) {
    setForm((f) => ({
      ...f,
      labelIds: f.labelIds.includes(labelId)
        ? f.labelIds.filter((x) => x !== labelId)
        : [...f.labelIds, labelId],
    }));
  }

  async function handleSave() {
    if (!form.amount || isNaN(Number(form.amount))) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!form.wallet_id) {
      setError('Please select a wallet.');
      return;
    }
    if (!form.date) {
      setError('Please select a date.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: txErr } = await supabase
      .from('transactions')
      .update({
        type: form.type,
        amount: parseFloat(form.amount),
        wallet_id: form.wallet_id,
        category_id: form.category_id || null,
        date: form.date,
        notes: form.notes || null,
        payer: form.payer || null,
      })
      .eq('id', id);

    if (txErr) {
      setError(txErr.message);
      setLoading(false);
      return;
    }

    await supabase.from('transaction_labels').delete().eq('transaction_id', id);
    if (form.labelIds.length > 0) {
      await supabase.from('transaction_labels').insert(
        form.labelIds.map((lid) => ({ transaction_id: id, label_id: lid }))
      );
    }

    setLoading(false);
    router.back();
  }

  function handleDelete() {
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('transaction_labels').delete().eq('transaction_id', id);
          await supabase.from('transactions').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  const filteredCategories = categories.filter(
    (c) => c.type === 'both' || c.type === form.type
  );
  const selectedWallet = wallets.find((w) => w.id === form.wallet_id);
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedLabels = labels.filter((l) => form.labelIds.includes(l.id));
  const currency = selectedWallet?.currency ?? '';

  if (fetching) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit transaction</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.headerBtnRight}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {/* Type toggle — hidden for transfers */}
        {!isTransfer && (
          <View style={[styles.typeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['expense', 'income'] as TransactionType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeBtn,
                  form.type === t && {
                    backgroundColor: t === 'income' ? colors.income : colors.expense,
                  },
                ]}
                onPress={() => { setField('type', t); setField('category_id', ''); }}
              >
                <Text style={[styles.typeBtnText, { color: form.type === t ? '#fff' : colors.muted }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Amount</Text>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => amountRef.current?.focus()}
          >
            <TextInput
              ref={amountRef}
              value={form.amount}
              onChangeText={(v) => setField('amount', v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.placeholder}
              style={[styles.amountInput, { color: colors.text }]}
              textAlign="right"
            />
            {currency ? (
              <Text style={[styles.currencyLabel, { color: colors.accent }]}>{currency}</Text>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Date */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Date</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={[styles.pickerBtnText, { color: form.date ? colors.text : colors.muted }]}>
              {form.date || 'Select date…'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <DatePickerModal
          visible={showDatePicker}
          value={form.date}
          onConfirm={(d) => setField('date', d)}
          onClose={() => setShowDatePicker(false)}
        />

        {/* Wallet */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Wallet</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowWalletModal(true)}
          >
            <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]}>
              {selectedWallet
                ? `${selectedWallet.icon ? selectedWallet.icon + ' ' : ''}${selectedWallet.name}`
                : 'Select wallet…'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Category */}
        {!isTransfer && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Category</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowCategoryModal(true)}
            >
              <Text style={[styles.pickerBtnText, { color: selectedCategory ? colors.text : colors.muted }]}>
                {selectedCategory
                  ? `${selectedCategory.icon ? selectedCategory.icon + ' ' : ''}${selectedCategory.name}`
                  : 'Select category…'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Labels */}
        {labels.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Labels</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowLabelModal(true)}
            >
              <Text style={[styles.pickerBtnText, { color: selectedLabels.length ? colors.text : colors.muted }]}>
                {selectedLabels.length > 0 ? selectedLabels.map((l) => l.name).join(', ') : 'Select labels…'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
            {selectedLabels.length > 0 && (
              <View style={styles.chips}>
                {selectedLabels.map((l) => (
                  <View key={l.id} style={[styles.chip, { borderColor: l.color, backgroundColor: l.color + '22' }]}>
                    <Text style={[styles.chipText, { color: l.color }]}>{l.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <AppInput
          label="Payer (optional)"
          value={form.payer}
          onChangeText={(v) => setField('payer', v)}
          placeholder="Who paid?"
        />

        <AppInput
          label="Notes (optional)"
          value={form.notes}
          onChangeText={(v) => setField('notes', v)}
          placeholder="Add a note…"
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />

        <AppButton onPress={handleSave} loading={loading} fullWidth>
          Save changes
        </AppButton>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Wallet picker modal */}
      <BottomModal visible={showWalletModal} onClose={() => setShowWalletModal(false)} title="Select wallet">
        {wallets.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.modalRow, { borderBottomColor: colors.border }, form.wallet_id === w.id && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { setField('wallet_id', w.id); setShowWalletModal(false); }}
          >
            {w.icon ? <Text style={styles.modalRowIcon}>{w.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>{w.name}</Text>
            {form.wallet_id === w.id && <Text style={{ color: colors.accent }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </BottomModal>

      <BottomModal visible={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Select category">
        <TouchableOpacity
          style={[styles.modalRow, { borderBottomColor: colors.border }, !form.category_id && { backgroundColor: colors.accent + '11' }]}
          onPress={() => { setField('category_id', ''); setShowCategoryModal(false); }}
        >
          <Text style={[styles.modalRowText, { color: !form.category_id ? colors.accent : colors.text }]}>— None</Text>
          {!form.category_id && <Text style={{ color: colors.accent }}>✓</Text>}
        </TouchableOpacity>
        {filteredCategories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.modalRow, { borderBottomColor: colors.border }, form.category_id === c.id && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { setField('category_id', c.id); setShowCategoryModal(false); }}
          >
            {c.icon ? <Text style={styles.modalRowIcon}>{c.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.category_id === c.id ? colors.accent : colors.text }]}>{c.name}</Text>
            {form.category_id === c.id && <Text style={{ color: colors.accent }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </BottomModal>

      <BottomModal visible={showLabelModal} onClose={() => setShowLabelModal(false)} title="Select labels">
        {labels.map((l) => {
          const selected = form.labelIds.includes(l.id);
          return (
            <TouchableOpacity
              key={l.id}
              style={[styles.modalRow, { borderBottomColor: colors.border }, selected && { backgroundColor: l.color + '11' }]}
              onPress={() => toggleLabel(l.id)}
            >
              <View style={[styles.labelDot, { backgroundColor: l.color }]} />
              <Text style={[styles.modalRowText, { color: selected ? l.color : colors.text }]}>{l.name}</Text>
              {selected && <Text style={{ color: l.color }}>✓</Text>}
            </TouchableOpacity>
          );
        })}
        <View style={{ marginTop: 8 }}>
          <AppButton onPress={() => setShowLabelModal(false)} fullWidth>Done</AppButton>
        </View>
      </BottomModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerBtnRight: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  form: { padding: 16, gap: 16 },
  error: { fontSize: 14, textAlign: 'center' },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 4,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeBtnText: { fontSize: 15, fontWeight: '600' },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '500' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  currencyLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerBtnText: { fontSize: 15, flex: 1 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  modalRowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  modalRowText: { flex: 1, fontSize: 15 },
  labelDot: { width: 12, height: 12, borderRadius: 6 },
});
