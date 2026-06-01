import { useEffect, useRef, useState } from 'react';
import { useKeyboardVisible } from '@/lib/useKeyboardVisible';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, Category, Label, TransactionType } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';
import { Events } from '@/lib/events';

function formatAmountDisplay(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

function parseAmountInput(text: string): string {
  return text.replace(/\s/g, '');
}

type Form = {
  type: TransactionType | 'transfer';
  amount: string;
  to_amount: string;
  wallet_id: string;
  to_wallet_id: string;
  category_id: string;
  date: string;
  notes: string;
  payer: string;
  labelIds: string[];
};

const TYPES: { value: Form['type']; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function typeColor(t: Form['type'], colors: any): string {
  if (t === 'income') return colors.income;
  if (t === 'expense') return colors.expense;
  return colors.accent;
}

export default function AddTransactionScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const [form, setForm] = useState<Form>({
    type: 'expense',
    amount: '',
    to_amount: '',
    wallet_id: '',
    to_wallet_id: '',
    category_id: '',
    date: todayInputDate(),
    notes: '',
    payer: '',
    labelIds: [],
  });

  const amountRef = useRef<TextInput>(null);
  const toAmountRef = useRef<TextInput>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showToWalletModal, setShowToWalletModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateUserSelected, setDateUserSelected] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);

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

  const selectedWallet = wallets.find((w) => w.id === form.wallet_id);
  const selectedToWallet = wallets.find((w) => w.id === form.to_wallet_id);
  const sameCurrency = !!(
    selectedWallet && selectedToWallet &&
    selectedWallet.currency === selectedToWallet.currency
  );

  function handleFromAmountChange(raw: string) {
    setForm((f) => ({ ...f, amount: raw, ...(sameCurrency ? { to_amount: raw } : {}) }));
  }

  function handleFromWalletSelect(id: string) {
    const from = wallets.find((w) => w.id === id);
    const to = wallets.find((w) => w.id === form.to_wallet_id);
    setForm((f) => ({
      ...f,
      wallet_id: id,
      ...(from && to && from.currency === to.currency ? { to_amount: f.amount } : {}),
    }));
  }

  function handleToWalletSelect(id: string) {
    const from = wallets.find((w) => w.id === form.wallet_id);
    const to = wallets.find((w) => w.id === id);
    setForm((f) => ({
      ...f,
      to_wallet_id: id,
      ...(from && to && from.currency === to.currency ? { to_amount: f.amount } : {}),
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
    if (form.type === 'transfer' && !form.to_wallet_id) {
      setError('Please select a destination wallet.');
      return;
    }
    if (form.type === 'transfer' && form.wallet_id === form.to_wallet_id) {
      setError('Source and destination wallet must be different.');
      return;
    }
    if (form.type === 'transfer' && !sameCurrency) {
      const toAmt = Number(form.to_amount);
      if (!form.to_amount || isNaN(toAmt) || toAmt <= 0) {
        setError('Please enter a valid amount received.');
        return;
      }
    }
    if (!form.date) {
      setError('Please select a date.');
      return;
    }

    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    if (form.type === 'transfer') {
      const groupId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { error: txErr } = await supabase.from('transactions').insert([
        {
          user_id: user.id,
          type: 'expense',
          amount: parseFloat(form.amount),
          wallet_id: form.wallet_id,
          category_id: null,
          date: form.date,
          notes: form.notes || null,
          payer: null,
          transfer_group_id: groupId,
        },
        {
          user_id: user.id,
          type: 'income',
          amount: sameCurrency ? parseFloat(form.amount) : parseFloat(form.to_amount),
          wallet_id: form.to_wallet_id,
          category_id: null,
          date: form.date,
          notes: form.notes || null,
          payer: null,
          transfer_group_id: groupId,
        },
      ]);

      if (txErr) {
        Events.emit('transaction-saved', { success: false, message: txErr.message });
        setError(txErr.message);
        setLoading(false);
        return;
      }
    } else {
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
        Events.emit('transaction-saved', { success: false, message: txErr.message });
        setError(txErr.message);
        setLoading(false);
        return;
      }

      if (form.labelIds.length > 0) {
        await supabase.from('transaction_labels').insert(
          form.labelIds.map((lid) => ({ transaction_id: tx.id, label_id: lid }))
        );
      }
    }

    Events.emit('transaction-saved', { success: true, message: 'Record created.' });
    setLoading(false);
    router.back();
  }

  const filteredCategories = categories.filter(
    (c) => c.type === 'both' || c.type === form.type
  );
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedLabels = labels.filter((l) => form.labelIds.includes(l.id));
  const currency = selectedWallet?.currency ?? '';
  const isTransfer = form.type === 'transfer';

  const dateLabel = dateUserSelected ? form.date : 'Today';

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New transaction</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {/* Type toggle */}
          <View style={[styles.typeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.typeBtn,
                  form.type === t.value && { backgroundColor: typeColor(t.value, colors) },
                ]}
                onPress={() => { setField('type', t.value); setField('category_id', ''); }}
              >
                <Text style={[styles.typeBtnText, { color: form.type === t.value ? '#fff' : colors.muted }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isTransfer ? (
            /* ── Transfer layout ── */
            <>
              {/* From account */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>From account</Text>
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

              {/* Amount sent */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Amount sent</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => amountRef.current?.focus()}
                >
                  <TextInput
                    ref={amountRef}
                    value={formatAmountDisplay(form.amount)}
                    onChangeText={(v) => handleFromAmountChange(parseAmountInput(v))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.amountInput, { color: colors.text }]}
                    textAlign="right"
                  />
                  {currency ? <Text style={[styles.currencyLabel, { color: colors.accent }]}>{currency}</Text> : null}
                </TouchableOpacity>
              </View>

              {/* Arrow divider */}
              <View style={styles.arrowRow}>
                <View style={[styles.arrowLine, { backgroundColor: colors.border }]} />
                <View style={[styles.arrowCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="arrow-down" size={16} color={colors.accent} />
                </View>
                <View style={[styles.arrowLine, { backgroundColor: colors.border }]} />
              </View>

              {/* To account */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>To account</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowToWalletModal(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: selectedToWallet ? colors.text : colors.muted }]}>
                    {selectedToWallet
                      ? `${selectedToWallet.icon ? selectedToWallet.icon + ' ' : ''}${selectedToWallet.name}`
                      : 'Select wallet…'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Amount received — only when currencies differ */}
              {!sameCurrency ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>Amount received</Text>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => toAmountRef.current?.focus()}
                  >
                    <TextInput
                      ref={toAmountRef}
                      value={formatAmountDisplay(form.to_amount)}
                      onChangeText={(v) => setField('to_amount', parseAmountInput(v))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.amountInput, { color: colors.text }]}
                      textAlign="right"
                    />
                    {selectedToWallet?.currency ? (
                      <Text style={[styles.currencyLabel, { color: colors.accent }]}>{selectedToWallet.currency}</Text>
                    ) : null}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.sameHint, { color: colors.muted }]}>
                  Same currency — amount auto-matched
                </Text>
              )}

              {/* Date */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Date</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: colors.text }]}>{dateLabel}</Text>
                  <Ionicons name="calendar" size={18} color={colors.muted} />
                </TouchableOpacity>
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
              {/* Account */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Account</Text>
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

              {/* Amount */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Amount</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => amountRef.current?.focus()}
                >
                  <TextInput
                    ref={amountRef}
                    value={formatAmountDisplay(form.amount)}
                    onChangeText={(v) => handleFromAmountChange(parseAmountInput(v))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.amountInput, { color: colors.text }]}
                    textAlign="right"
                  />
                  {currency ? <Text style={[styles.currencyLabel, { color: colors.accent }]}>{currency}</Text> : null}
                </TouchableOpacity>
              </View>

              {/* Date */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Date</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: colors.text }]}>{dateLabel}</Text>
                  <Ionicons name="calendar" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Category */}
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
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </TouchableOpacity>
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
                </>
              )}
            </>
          )}
        </ScrollView>

        <View style={[styles.stickyFooter, { paddingBottom: keyboardVisible ? 8 : bottom + 16, borderTopColor: colors.border }]}>
          <AppButton onPress={handleSave} loading={loading} fullWidth>
            Save transaction
          </AppButton>
        </View>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={showDatePicker}
        value={form.date || todayInputDate()}
        onConfirm={(d) => { setField('date', d); setDateUserSelected(true); }}
        onClose={() => setShowDatePicker(false)}
      />

      {/* From wallet picker */}
      <BottomModal visible={showWalletModal} onClose={() => setShowWalletModal(false)} title={isTransfer ? 'From account' : 'Select account'}>
        {wallets.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.modalRow, { borderBottomColor: colors.border }, form.wallet_id === w.id && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { handleFromWalletSelect(w.id); setShowWalletModal(false); }}
          >
            {w.icon ? <Text style={styles.modalRowIcon}>{w.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>{w.name}</Text>
            {form.wallet_id === w.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>

      {/* To wallet picker */}
      <BottomModal visible={showToWalletModal} onClose={() => setShowToWalletModal(false)} title="To account">
        {wallets.filter((w) => w.id !== form.wallet_id).map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[styles.modalRow, { borderBottomColor: colors.border }, form.to_wallet_id === w.id && { backgroundColor: colors.accent + '11' }]}
            onPress={() => { handleToWalletSelect(w.id); setShowToWalletModal(false); }}
          >
            {w.icon ? <Text style={styles.modalRowIcon}>{w.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.to_wallet_id === w.id ? colors.accent : colors.text }]}>{w.name}</Text>
            {form.to_wallet_id === w.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
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
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  form: { padding: 16, gap: 16, flexGrow: 1 },
  stickyFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
  typeBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
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
    fontFamily: 'Figtree_700Bold',
    marginLeft: 10,
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  moreToggleText: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
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
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowLine: { flex: 1, height: 1 },
  arrowCircle: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  sameHint: { fontSize: 13, textAlign: 'center', marginTop: -8 },
});
