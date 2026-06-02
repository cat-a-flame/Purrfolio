import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
import NumPad from '@/components/NumPad';
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

  // which amount field the numpad is targeting (transfer mode)
  const [activeField, setActiveField] = useState<'amount' | 'to_amount'>('amount');

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

  function handleNumPadKey(key: string) {
    setForm((f) => {
      const field = f.type === 'transfer' && !sameCurrency ? activeField : 'amount';
      const current = f[field];

      let next: string;
      if (key === 'backspace') {
        next = current.slice(0, -1);
      } else if (key === '.') {
        if (current.includes('.')) return f;
        next = current + '.';
      } else {
        // digit
        if (current === '0') {
          next = key;
        } else if (current.includes('.') && current.split('.')[1].length >= 2) {
          return f;
        } else {
          next = current + key;
        }
      }

      if (field === 'amount') {
        const isSameCurr =
          f.type === 'transfer' &&
          wallets.find((w) => w.id === f.wallet_id)?.currency ===
          wallets.find((w) => w.id === f.to_wallet_id)?.currency &&
          !!f.wallet_id && !!f.to_wallet_id;
        return { ...f, amount: next, ...(isSameCurr ? { to_amount: next } : {}) };
      }
      return { ...f, [field]: next };
    });
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
  const accentColor = typeColor(form.type, colors);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New transaction</Text>
        <View style={{ width: 40 }} />

      </View>

      {/* Scrollable form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.form, { paddingBottom: 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {/* Type toggle */}
        <View style={[styles.typeToggle, { backgroundColor: colors.surface }]}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[
                styles.typeBtn,
                form.type === t.value && { backgroundColor: typeColor(t.value, colors) },
              ]}
              onPress={() => { setField('type', t.value); setField('category_id', ''); setActiveField('amount'); }}
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
            {/* Amount display — two fields when currencies differ */}
            <View style={[styles.transferAmountBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* From amount */}
              <TouchableOpacity
                style={[
                  styles.transferAmountField,
                  activeField === 'amount' && { borderColor: accentColor, borderWidth: 1.5 },
                  { borderColor: colors.border },
                ]}
                onPress={() => setActiveField('amount')}
                activeOpacity={0.7}
              >
                <Text style={[styles.transferFieldLabel, { color: colors.muted }]}>From</Text>
                <View style={styles.transferAmountRow}>
                  <Text style={[styles.transferAmountText, { color: colors.text }]}>
                    {formatAmountDisplay(form.amount) || <Text style={{ color: colors.placeholder }}>0</Text>}
                  </Text>
                  {currency ? <Text style={[styles.transferCurrency, { color: accentColor }]}>{currency}</Text> : null}
                </View>
              </TouchableOpacity>

              {/* Arrow */}
              <View style={[styles.arrowCircle, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Ionicons name="arrow-down" size={14} color={accentColor} />
              </View>

              {/* To amount — only shown when currencies differ */}
              {!sameCurrency && (
                <TouchableOpacity
                  style={[
                    styles.transferAmountField,
                    activeField === 'to_amount' && { borderColor: accentColor, borderWidth: 1.5 },
                    { borderColor: colors.border },
                  ]}
                  onPress={() => setActiveField('to_amount')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.transferFieldLabel, { color: colors.muted }]}>To</Text>
                  <View style={styles.transferAmountRow}>
                    <Text style={[styles.transferAmountText, { color: colors.text }]}>
                      {formatAmountDisplay(form.to_amount) || <Text style={{ color: colors.placeholder }}>0</Text>}
                    </Text>
                    {selectedToWallet?.currency ? (
                      <Text style={[styles.transferCurrency, { color: accentColor }]}>{selectedToWallet.currency}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}

              {sameCurrency && (
                <Text style={[styles.sameHint, { color: colors.muted }]}>Same currency — amount auto-matched</Text>
              )}
            </View>

            {/* From / To wallets */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>From</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowWalletModal(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]} numberOfLines={1}>
                    {selectedWallet ? `${selectedWallet.icon ?? ''}${selectedWallet.icon ? ' ' : ''}${selectedWallet.name}` : 'Select…'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>To</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowToWalletModal(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: selectedToWallet ? colors.text : colors.muted }]} numberOfLines={1}>
                    {selectedToWallet ? `${selectedToWallet.icon ?? ''}${selectedToWallet.icon ? ' ' : ''}${selectedToWallet.name}` : 'Select…'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Date */}
            <TouchableOpacity style={[styles.pickerBtnBorderless, { backgroundColor: colors.bg }]} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar" size={13} color={colors.muted} />
              <Text style={[styles.pickerBtnInlineText, { color: colors.text }]}>{dateLabel}</Text>
            </TouchableOpacity>

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
            {/* Amount display */}
            <View style={styles.amountSection}>
              <Text style={[styles.amountLabel, { color: colors.muted }]}>AMOUNT</Text>
              <View style={[styles.amountDisplay, { borderBottomColor: accentColor }]}>
                <Text
                  style={[styles.amountText, { color: form.amount ? colors.text : colors.placeholder }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatAmountDisplay(form.amount) || '0'}
                </Text>
                {currency ? <Text style={[styles.currencyLabel, { color: accentColor }]}>{currency}</Text> : null}
              </View>
            </View>

            {/* Category — full width */}
            <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowCategoryModal(true)}>
              <Text style={[styles.pickerBtnText, { color: selectedCategory ? colors.text : colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                {selectedCategory ? `${selectedCategory.icon ?? ''}${selectedCategory.icon ? ' ' : ''}${selectedCategory.name}` : 'Add category'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            {/* Account + Date side by side */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowWalletModal(true)}>
                  <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]} numberOfLines={1} ellipsizeMode="tail">
                    {selectedWallet ? `${selectedWallet.icon ?? ''}${selectedWallet.icon ? ' ' : ''}${selectedWallet.name}` : 'Select wallet…'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar" size={15} color={colors.muted} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerBtnText, { color: colors.text }]} numberOfLines={1}>{dateLabel}</Text>
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
                  <View style={styles.fieldGroup}>
                    <TouchableOpacity
                      style={[styles.pickerBtn2, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => setShowLabelModal(true)}
                    >
                      <Text style={[styles.pickerBtnText, { color: selectedLabels.length ? colors.text : colors.muted }]}>
                        {selectedLabels.length > 0 ? selectedLabels.map((l) => l.name).join(', ') : 'Select labels'}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
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
      <View style={[styles.bottomBlock, { borderTopColor: colors.border, paddingBottom: bottom + 8 }]}>
        <NumPad onKey={handleNumPadKey} />
        <View style={styles.saveRow}>
          <AppButton onPress={handleSave} loading={loading} fullWidth>
            Add
          </AppButton>
        </View>
      </View>

      {/* Modals */}
      <DatePickerModal
        visible={showDatePicker}
        value={form.date || todayInputDate()}
        onConfirm={(d) => { setField('date', d); setDateUserSelected(true); }}
        onClose={() => setShowDatePicker(false)}
      />

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
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  form: { padding: 16, gap: 14 },
  error: { fontSize: 14, textAlign: 'center' },
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

  /* Amount display */
  amountSection: {
    alignItems: 'center',
    gap: 4,
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_600SemiBold',
    letterSpacing: 1.2,
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
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

  /* Transfer amount block */
  transferAmountBlock: {
    borderRadius: 14,
    padding: 12,
    gap: 8,
    alignItems: 'stretch',
  },
  transferAmountField: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 2,
  },
  transferFieldLabel: { fontSize: 11, fontFamily: 'Figtree_500Medium' },
  transferAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transferAmountText: { flex: 1, fontSize: 22, fontFamily: 'Lora_400Regular' },
  transferCurrency: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  arrowCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    alignSelf: 'center',
  },
  sameHint: { fontSize: 12, textAlign: 'center', paddingVertical: 4 },

  /* Pickers */
  row: { flexDirection: 'row', gap: 8 },
  fieldGroup: { gap: 8, flexDirection: 'row' },
  fieldLabel: { fontSize: 12, fontFamily: 'Figtree_500Medium', marginBottom: 4 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBtnText: { fontSize: 14, flex: 1 },
  pickerBtn2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexGrow: 1,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBtnBorderless: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
  },
  pickerBtnInlineText: { fontSize: 14 },
  rowFieldGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  moreToggleText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },

  /* Bottom block */
  bottomBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },

  /* Modal rows */
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
