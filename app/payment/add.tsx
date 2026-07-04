import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ConfirmModal from '@/components/ConfirmModal';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, Category, Label, RecurrenceFrequency } from '@/lib/types';
import { frequencyLabel, isoDate } from '@/lib/recurringUtils';
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

const FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

type EditForm = {
  name: string;
  type: 'income' | 'expense';
  amount: string;
  wallet_id: string;
  category_id: string;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date: string;
  payer: string;
  notes: string;
  labelIds: string[];
};

const EMPTY_FORM: EditForm = {
  name: '', type: 'expense', amount: '', wallet_id: '', category_id: '',
  frequency: 'monthly', start_date: isoDate(new Date()), end_date: '', payer: '', notes: '',
  labelIds: [],
};

export default function AddPaymentScreen() {
  const colors = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
  const amountRef = useRef<TextInput>(null);

  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);

  const isDirty = form.name !== '' || form.amount !== '' || form.payer !== '' || form.notes !== '' || form.labelIds.length > 0;
  const [pendingAction, setPendingAction] = useState<any>(null);
  const isSaved = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty || isSaved.current) return;
      e.preventDefault();
      setPendingAction(e.data.action);
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: w }, { data: c }, { data: l }] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).neq('is_archived', true).order('is_default', { ascending: false }),
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

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
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
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.amount || isNaN(Number(form.amount))) { setFormError('Enter a valid amount.'); return; }

    setSaving(true);
    setFormError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: newPayment, error } = await supabase
      .from('recurring_payments')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        type: form.type,
        amount: parseFloat(form.amount),
        wallet_id: form.wallet_id || null,
        category_id: form.category_id || null,
        frequency: form.frequency,
        start_date: form.start_date,
        end_date: form.end_date || null,
        payer: form.payer.trim() || null,
        notes: form.notes || null,
      })
      .select('id')
      .single();

    if (!error && newPayment && form.labelIds.length > 0) {
      await supabase.from('recurring_payment_labels').insert(
        form.labelIds.map((lid) => ({ recurring_payment_id: newPayment.id, label_id: lid }))
      );
    }

    setSaving(false);
    if (error) { setFormError(error.message); return; }

    Events.emit('recurring-saved', { success: true, message: 'Recurring payment created.' });
    isSaved.current = true;
    router.back();
  }

  const selectedWallet = wallets.find((w) => w.id === form.wallet_id);
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedLabels = labels.filter((l) => form.labelIds.includes(l.id));
  const currency = selectedWallet?.currency ?? '';
  const filteredCategories = categories.filter((c) => c.type === 'both' || c.type === form.type);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Add recurring payment</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {formError ? <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text> : null}

          {/* Type toggle */}
          <View style={[styles.typeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['expense', 'income'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeBtn,
                  form.type === t && { backgroundColor: t === 'income' ? colors.income : colors.expense },
                ]}
                onPress={() => { setField('type', t); setField('category_id', ''); }}
              >
                <Text style={[styles.typeBtnText, { color: form.type === t ? '#fff' : colors.muted }]}>
                  {t === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount */}
          <View style={styles.amountSection}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.amountDisplay}
              onPress={() => amountRef.current?.focus()}
            >
              <TextInput
                ref={amountRef}
                value={formatAmountDisplay(form.amount)}
                onChangeText={(v) => setField('amount', parseAmountInput(v))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.placeholder ?? colors.muted}
                style={[styles.amountText, { color: form.amount ? colors.text : colors.muted }]}
                textAlign="center"
              />
              {currency ? <Text style={[styles.amountCurrency, { color: colors.muted }]}>{currency}</Text> : null}
            </TouchableOpacity>
          </View>

          {/* Name */}
          <AppInput
            label="Name"
            value={form.name}
            onChangeText={(v) => setField('name', v)}
            placeholder="e.g. Netflix"
          />

          {/* Wallet + Category side by side */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Wallet</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowWalletModal(true)}
              >
                <Text style={[styles.pickerBtnText, { color: selectedWallet ? colors.text : colors.muted }]} numberOfLines={1}>
                  {selectedWallet ? `${selectedWallet.icon ? selectedWallet.icon + ' ' : ''}${selectedWallet.name}` : 'Wallet…'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Category</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowCategoryModal(true)}
              >
                <Text style={[styles.pickerBtnText, { color: selectedCategory ? colors.text : colors.muted }]} numberOfLines={1}>
                  {selectedCategory ? `${selectedCategory.icon ? selectedCategory.icon + ' ' : ''}${selectedCategory.name}` : 'Category…'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Start date + Frequency side by side */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Start date</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={[styles.pickerBtnText, { color: form.start_date ? colors.text : colors.muted }]} numberOfLines={1}>
                  {form.start_date || 'Date…'}
                </Text>
                <Ionicons name="calendar" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Frequency</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowFrequencyModal(true)}
              >
                <Text style={[styles.pickerBtnText, { color: colors.text }]} numberOfLines={1}>
                  {frequencyLabel(form.frequency)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
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
            <Ionicons
              name={moreExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.muted}
            />
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
                      {selectedLabels.length > 0 ? selectedLabels.map((l) => l.name).join(', ') : 'Select labels…'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              )}

              <AppInput
                label="Payee (optional)"
                value={form.payer}
                onChangeText={(v) => setField('payer', v)}
                placeholder="e.g. OTP Bank"
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

              {/* End date */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>End date (optional)</Text>
                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Text style={[styles.pickerBtnText, { color: form.end_date ? colors.text : colors.muted }]}>
                    {form.end_date || 'No end date'}
                  </Text>
                  <Ionicons name="calendar" size={18} color={colors.muted} />
                </TouchableOpacity>
                {form.end_date ? (
                  <TouchableOpacity onPress={() => setField('end_date', '')}>
                    <Text style={[styles.clearText, { color: colors.muted }]}>Clear end date</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}

        </ScrollView>

        {/* Sticky footer save button */}
        <View style={[styles.stickyFooter, { paddingBottom: bottom + 16, borderTopColor: colors.border }]}>
          <AppButton onPress={handleSave} loading={saving} fullWidth>
            Save recurring payment
          </AppButton>
        </View>
      </KeyboardAvoidingView>

      {/* Wallet picker */}
      <BottomModal visible={showWalletModal} onClose={() => setShowWalletModal(false)} title="Select account">
        {wallets.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[
              styles.modalRow,
              { borderBottomColor: colors.border },
              form.wallet_id === w.id && { backgroundColor: colors.accent + '11' },
            ]}
            onPress={() => { setField('wallet_id', w.id); setShowWalletModal(false); }}
          >
            {w.icon ? <Text style={styles.modalRowIcon}>{w.icon}</Text> : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>
              {w.name}
            </Text>
            {form.wallet_id === w.id && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>

      {/* Frequency picker */}
      <BottomModal visible={showFrequencyModal} onClose={() => setShowFrequencyModal(false)} title="Frequency">
        {FREQUENCIES.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.modalRow,
              { borderBottomColor: colors.border },
              form.frequency === f && { backgroundColor: colors.accent + '11' },
            ]}
            onPress={() => { setField('frequency', f); setShowFrequencyModal(false); }}
          >
            <Text style={[styles.modalRowText, { color: form.frequency === f ? colors.accent : colors.text }]}>
              {frequencyLabel(f)}
            </Text>
            {form.frequency === f && <Ionicons name="checkmark" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </BottomModal>

      {/* Start date picker */}
      <DatePickerModal
        visible={showStartDatePicker}
        value={form.start_date || isoDate(new Date())}
        onConfirm={(d) => setField('start_date', d)}
        onClose={() => setShowStartDatePicker(false)}
      />

      {/* End date picker */}
      <DatePickerModal
        visible={showEndDatePicker}
        value={form.end_date || isoDate(new Date())}
        onConfirm={(d) => setField('end_date', d)}
        onClose={() => setShowEndDatePicker(false)}
      />

      {/* Category picker */}
      <CategoryPickerModal
        visible={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={filteredCategories}
        selectedId={form.category_id}
        onSelect={(id) => setField('category_id', id)}
      />

      {/* Label picker */}
      <BottomModal visible={showLabelModal} onClose={() => setShowLabelModal(false)} title="Select labels">
        {labels.map((l) => {
          const selected = form.labelIds.includes(l.id);
          return (
            <TouchableOpacity
              key={l.id}
              style={[
                styles.modalRow,
                { borderBottomColor: colors.border },
                selected && { backgroundColor: l.color + '11' },
              ]}
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

      <ConfirmModal
        visible={!!pendingAction}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => { navigation.dispatch(pendingAction); setPendingAction(null); }}
        onCancel={() => setPendingAction(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  form: { padding: 16, gap: 16, flexGrow: 1 },
  stickyFooter: {
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  error: { fontSize: 14, textAlign: 'center' },

  typeToggle: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    overflow: 'hidden', padding: 4, gap: 4,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  typeBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },

  amountSection: { alignItems: 'center' },
  amountDisplay: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'center', paddingVertical: 8, gap: 6,
  },
  amountText: { fontSize: 52, fontFamily: 'Lora_400Regular', minWidth: 60, textAlign: 'center' },
  amountCurrency: { fontSize: 15, fontFamily: 'Figtree_700Bold', marginBottom: 22 },

  row: { flexDirection: 'row', gap: 8 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontFamily: 'Figtree_500Medium', marginBottom: 4 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBtnText: { fontSize: 14, flex: 1 },

  moreToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
  },
  moreToggleText: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
  clearText: { fontSize: 13, textAlign: 'right' },

  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  modalRowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  modalRowText: { flex: 1, fontSize: 15 },
  labelDot: { width: 12, height: 12, borderRadius: 6 },
});
