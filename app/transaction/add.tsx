import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import type { Wallet, Category, Label, TransactionType } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';

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

export default function AddTransactionScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [form, setForm] = useState<Form>({
    type: 'expense',
    amount: '',
    wallet_id: '',
    category_id: '',
    date: todayInputDate(),
    notes: '',
    payer: '',
    labelIds: [],
  });

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: w }, { data: c }, { data: l }] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
        supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
        supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      ]);

      setWallets(w ?? []);
      setCategories(c ?? []);
      setLabels(l ?? []);

      const defaultWallet = (w ?? []).find((x: Wallet) => x.is_default) ?? (w ?? [])[0];
      if (defaultWallet) {
        setForm((f) => ({ ...f, wallet_id: defaultWallet.id }));
      }
    }
    loadData();
  }, []);

  function setField<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleLabel(id: string) {
    setForm((f) => ({
      ...f,
      labelIds: f.labelIds.includes(id)
        ? f.labelIds.filter((x) => x !== id)
        : [...f.labelIds, id],
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: form.type,
        amount: parseFloat(form.amount),
        wallet_id: form.wallet_id,
        category_id: form.category_id || null,
        date: form.date,
        notes: form.notes || null,
        payer: form.payer || null,
      })
      .select()
      .single();

    if (txErr) {
      setError(txErr.message);
      setLoading(false);
      return;
    }

    if (form.labelIds.length > 0) {
      await supabase.from('transaction_labels').insert(
        form.labelIds.map((lid) => ({ transaction_id: tx.id, label_id: lid }))
      );
    }

    setLoading(false);
    router.back();
  }

  const filteredCategories = categories.filter(
    (c) => c.type === 'both' || c.type === form.type
  );

  const selectedWallet = wallets.find((w) => w.id === form.wallet_id);
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedLabels = labels.filter((l) => form.labelIds.includes(l.id));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.muted }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New transaction</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {/* Type toggle */}
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

        {/* Amount */}
        <AppInput
          label="Amount"
          value={form.amount}
          onChangeText={(v) => setField('amount', v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        {/* Date */}
        <AppInput
          label="Date (YYYY-MM-DD)"
          value={form.date}
          onChangeText={(v) => setField('date', v)}
          placeholder="2024-01-01"
        />

        {/* Wallet */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Wallet</Text>
          <View style={styles.chips}>
            {wallets.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  form.wallet_id === w.id && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => setField('wallet_id', w.id)}
              >
                {w.icon ? <Text>{w.icon} </Text> : null}
                <Text style={[styles.chipText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>
                  {w.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Category — picker button */}
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
            <Text style={{ color: colors.muted }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Labels — multi-select picker */}
        {labels.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Labels</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowLabelModal(true)}
            >
              <Text style={[styles.pickerBtnText, { color: selectedLabels.length ? colors.text : colors.muted }]}>
                {selectedLabels.length > 0
                  ? selectedLabels.map((l) => l.name).join(', ')
                  : 'Select labels…'}
              </Text>
              <Text style={{ color: colors.muted }}>›</Text>
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

        {/* Payer */}
        <AppInput
          label="Payer (optional)"
          value={form.payer}
          onChangeText={(v) => setField('payer', v)}
          placeholder="Who paid?"
        />

        {/* Notes */}
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
          Save transaction
        </AppButton>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Category picker modal */}
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

      {/* Labels picker modal */}
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
  headerTitle: { fontSize: 17, fontWeight: '600' },
  cancel: { fontSize: 16 },
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
