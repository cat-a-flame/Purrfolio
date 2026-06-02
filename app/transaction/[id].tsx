import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Events } from '@/lib/events';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import NumPad from '@/components/NumPad';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, Category, Label, TransactionType } from '@/lib/types';

function formatAmountDisplay(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

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

function typeColor(t: TransactionType, colors: any): string {
  return t === 'income' ? colors.income : colors.expense;
}

export default function EditTransactionScreen() {
  const colors = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
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

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [initialForm, setInitialForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [isTransfer, setIsTransfer] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);

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
        const loaded: Form = {
          type: tx.type,
          amount: String(tx.amount),
          wallet_id: tx.wallet_id ?? '',
          category_id: tx.category_id ?? '',
          date: tx.date,
          notes: tx.notes ?? '',
          payer: tx.payer ?? '',
          labelIds: (tx.transaction_labels ?? []).map((tl: any) => tl.label_id),
        };
        setForm(loaded);
        setInitialForm(loaded);
      }

      setFetching(false);
    }
    loadData();
  }, [id]);

  const isDirty = initialForm !== null && (
    form.type !== initialForm.type ||
    form.amount !== initialForm.amount ||
    form.wallet_id !== initialForm.wallet_id ||
    form.category_id !== initialForm.category_id ||
    form.date !== initialForm.date ||
    form.notes !== initialForm.notes ||
    form.payer !== initialForm.payer ||
    form.labelIds.join(',') !== initialForm.labelIds.join(',')
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty) return;
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

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

  function handleNumPadKey(key: string) {
    setForm((f) => {
      const current = f.amount;
      let next: string;
      if (key === 'backspace') {
        next = current.slice(0, -1);
      } else if (key === '.') {
        if (current.includes('.')) return f;
        next = current + '.';
      } else {
        if (current === '0') {
          next = key;
        } else if (current.includes('.') && current.split('.')[1].length >= 2) {
          return f;
        } else {
          next = current + key;
        }
      }
      return { ...f, amount: next };
    });
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
        payer: isTransfer ? null : (form.payer || null),
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
    Events.emit('transaction-saved', { success: true, message: 'Record updated.' });
    router.back();
  }

  function handleDelete() {
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('transaction_labels').delete().eq('transaction_id', id);
          const { error: txErr } = await supabase.from('transactions').delete().eq('id', id);
          Events.emit('transaction-saved', {
            success: !txErr,
            message: txErr ? (txErr.message ?? 'Failed to delete.') : 'Record deleted.',
          });
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
  const accentColor = isTransfer ? colors.accent : typeColor(form.type, colors);

  if (fetching) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit transaction</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.headerBtnRight}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      {/* Scrollable form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.form, { paddingBottom: 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isTransfer ? (
          /* ── Transfer layout ── */
          <>
            <View style={[styles.transferBadge, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '40' }]}>
              <Ionicons name="swap-horizontal" size={15} color={colors.accent} />
              <Text style={[styles.transferBadgeText, { color: colors.accent }]}>Transfer</Text>
            </View>

            {/* Amount display */}
            <View style={styles.amountSection}>
              <View style={styles.amountDisplay}>
                <Text
                  style={[styles.amountText, { color: form.amount ? colors.text : colors.placeholder }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatAmountDisplay(form.amount) || '0'}
                </Text>
                {currency ? <Text style={[styles.currencyLabel, { color: colors.muted }]}>{currency}</Text> : null}
              </View>
            </View>

            {/* Date + Wallet */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar" size={15} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerBtnText, { color: form.date ? colors.text : colors.muted }]} numberOfLines={1}>
                    {form.date || 'Select date…'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowWalletModal(true)}>
                  <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                    {selectedWallet ? `${selectedWallet.icon ?? ''}${selectedWallet.icon ? ' ' : ''}${selectedWallet.name}` : 'Select wallet…'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* More options */}
            <TouchableOpacity
              style={[styles.moreToggle, { borderColor: colors.border }]}
              onPress={() => setMoreExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.moreToggleText, { color: colors.muted }]}>More options</Text>
              <Ionicons name={moreExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>

            {moreExpanded && (
              <AppInput
                label="Notes (optional)"
                value={form.notes}
                onChangeText={(v) => setField('notes', v)}
                placeholder="Add a note…"
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
            )}
          </>
        ) : (
          /* ── Income / Expense layout ── */
          <>
            {/* Type toggle */}
            <View style={[styles.typeToggle, { backgroundColor: colors.surface }]}>
              {(['expense', 'income'] as TransactionType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeBtn,
                    form.type === t && { backgroundColor: typeColor(t, colors) },
                  ]}
                  onPress={() => { setField('type', t); setField('category_id', ''); }}
                >
                  <Text style={[styles.typeBtnText, { color: form.type === t ? '#fff' : colors.muted }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount display */}
            <View style={styles.amountSection}>
              <View style={styles.amountDisplay}>
                <Text
                  style={[styles.amountText, { color: form.amount ? colors.text : colors.placeholder }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {form.amount ? (form.type === 'income' ? '+' : '−') : ''}{formatAmountDisplay(form.amount) || '0'}
                </Text>
                {currency ? <Text style={[styles.currencyLabel, { color: colors.muted }]}>{currency}</Text> : null}
              </View>
            </View>

            {/* Category — full width */}
            <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowCategoryModal(true)}>
              <Text style={[styles.pickerBtnText, { color: selectedCategory ? colors.text : colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                {selectedCategory ? `${selectedCategory.icon ?? ''}${selectedCategory.icon ? ' ' : ''}${selectedCategory.name}` : 'Add category'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            {/* Date + Wallet side by side */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar" size={15} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerBtnText, { color: form.date ? colors.text : colors.muted }]} numberOfLines={1}>
                    {form.date || 'Select date…'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowWalletModal(true)}>
                  <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                    {selectedWallet ? `${selectedWallet.icon ?? ''}${selectedWallet.icon ? ' ' : ''}${selectedWallet.name}` : 'Select wallet…'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* More options */}
            <TouchableOpacity
              style={[styles.moreToggle, { borderColor: colors.border }]}
              onPress={() => setMoreExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.moreToggleText, { color: colors.muted }]}>More options</Text>
              <Ionicons name={moreExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>

            {moreExpanded && (
              <>
                {labels.length > 0 && (
                  <TouchableOpacity
                    style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => setShowLabelModal(true)}
                  >
                    <Text style={[styles.pickerBtnText, { color: selectedLabels.length ? colors.text : colors.muted }]}>
                      {selectedLabels.length > 0 ? selectedLabels.map((l) => l.name).join(', ') : 'Select labels'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </TouchableOpacity>
                )}

                <AppInput
                  value={form.payer}
                  onChangeText={(v) => setField('payer', v)}
                  placeholder="Payee name"
                />

                <AppInput
                  value={form.notes}
                  onChangeText={(v) => setField('notes', v)}
                  placeholder="Notes"
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Always-visible numpad + save */}
      <View style={[styles.bottomBlock, { borderTopColor: colors.border, paddingBottom: bottom + 8, backgroundColor: colors.surface }]}>
        <NumPad onKey={handleNumPadKey} />
        <View style={styles.saveRow}>
          <AppButton onPress={handleSave} loading={loading} fullWidth>
            Save changes
          </AppButton>
        </View>
      </View>

      {/* Modals */}
      <DatePickerModal
        visible={showDatePicker}
        value={form.date}
        onConfirm={(d) => setField('date', d)}
        onClose={() => setShowDatePicker(false)}
      />

      <BottomModal visible={showWalletModal} onClose={() => setShowWalletModal(false)} title="Select account">
        {wallets.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.modalRow, { borderBottomColor: colors.border }, form.wallet_id === w.id && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { setField('wallet_id', w.id); setShowWalletModal(false); }}
          >
            {w.icon ? <Text style={styles.modalRowIcon}>{w.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>{w.name}</Text>
            {form.wallet_id === w.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>

      <CategoryPickerModal
        visible={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={filteredCategories}
        selectedId={form.category_id}
        onSelect={(id) => setField('category_id', id)}
      />

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
              {selected && <Ionicons name="checkmark" size={18} color={l.color} />}
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
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerBtnRight: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  form: { padding: 16, gap: 14 },
  error: { fontSize: 14, textAlign: 'center' },
  transferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  transferBadgeText: { fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
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
  typeBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  amountSection: {
    alignItems: 'center',
    gap: 4,
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  amountText: {
    fontSize: 52,
    fontFamily: 'Lora_400Regular',
    paddingVertical: 0,
  },
  currencyLabel: {
    fontSize: 15,
    fontFamily: 'Figtree_700Bold',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 8 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBtnText: { fontSize: 14, flex: 1 },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  moreToggleText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  bottomBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
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
