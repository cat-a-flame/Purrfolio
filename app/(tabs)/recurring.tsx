import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import { Ionicons } from '@expo/vector-icons';
import type { RecurringPayment, Wallet, Category, RecurrenceFrequency } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { nextDueDate, frequencyLabel, isoDate } from '@/lib/recurringUtils';

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
};

const EMPTY_FORM: EditForm = {
  name: '', type: 'expense', amount: '', wallet_id: '', category_id: '',
  frequency: 'monthly', start_date: isoDate(new Date()), end_date: '', payer: '', notes: '',
};

export default function RecurringScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState<RecurringPayment | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: planned } = await supabase
      .from('recurring_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    const [{ data: w }, { data: c }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
    ]);

    const walletMap = new Map((w ?? []).map((x: Wallet) => [x.id, x]));
    const categoryMap = new Map((c ?? []).map((x: Category) => [x.id, x]));

    setWallets(w ?? []);
    setCategories(c ?? []);
    setItems((planned ?? []).map((r: any) => ({
      ...r,
      wallet: r.wallet_id ? walletMap.get(r.wallet_id) ?? null : null,
      category: r.category_id ? categoryMap.get(r.category_id) ?? null : null,
    })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function openEdit(item: RecurringPayment) {
    setForm({
      name: item.name,
      type: item.type,
      amount: String(item.amount),
      wallet_id: item.wallet_id ?? '',
      category_id: item.category_id ?? '',
      frequency: item.frequency,
      start_date: item.start_date,
      end_date: item.end_date ?? '',
      payer: item.payer ?? '',
      notes: item.notes ?? '',
    });
    setFormError('');
    setEditing(item);
  }

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.amount || isNaN(Number(form.amount))) { setFormError('Enter a valid amount.'); return; }

    setSaving(true);
    setFormError('');

    const { error } = await supabase
      .from('recurring_payments')
      .update({
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
      .eq('id', editing!.id);

    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setEditing(null);
    load();
  }

  function handleDelete() {
    Alert.alert('Delete planned payment', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('recurring_payments').delete().eq('id', editing!.id);
          setEditing(null);
          load();
        },
      },
    ]);
  }

  async function handleToggleActive() {
    if (!editing) return;
    await supabase.from('recurring_payments').update({ is_active: !editing.is_active }).eq('id', editing.id);
    setEditing(null);
    load();
  }

  const selectedCategory = categories.find((c) => c.id === form.category_id);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Planned" />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RecurringCard item={item} colors={colors} onPress={() => openEdit(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={null}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No planned payments.</Text>
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
      />

      {/* Edit modal */}
      <BottomModal
        visible={!!editing}
        onClose={() => setEditing(null)}
        title="Edit planned payment"
      >
        <View style={styles.modalForm}>
          {formError ? <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text> : null}

          {/* Type chips */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Type</Text>
            <View style={styles.chips}>
              {(['expense', 'income'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface },
                    form.type === t && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                  onPress={() => setField('type', t)}
                >
                  <Text style={[styles.chipText, { color: form.type === t ? colors.accent : colors.text }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AppInput label="Name" value={form.name} onChangeText={(v) => setField('name', v)} placeholder="e.g. Netflix" />
          <AppInput label="Amount" value={form.amount} onChangeText={(v) => setField('amount', v)} keyboardType="decimal-pad" placeholder="0.00" />
          <AppInput label="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={(v) => setField('start_date', v)} placeholder="2024-01-01" />
          <AppInput label="End date (optional)" value={form.end_date} onChangeText={(v) => setField('end_date', v)} placeholder="2025-12-31" />

          {/* Frequency chips */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Frequency</Text>
            <View style={styles.chips}>
              {FREQUENCIES.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface },
                    form.frequency === f && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                  onPress={() => setField('frequency', f)}
                >
                  <Text style={[styles.chipText, { color: form.frequency === f ? colors.accent : colors.text }]}>
                    {frequencyLabel(f)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Wallet chips */}
          {wallets.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Wallet</Text>
              <View style={styles.chips}>
                {wallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface },
                      form.wallet_id === w.id && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                    onPress={() => setField('wallet_id', form.wallet_id === w.id ? '' : w.id)}
                  >
                    {w.icon ? <Text>{w.icon} </Text> : null}
                    <Text style={[styles.chipText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Category picker */}
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

          <AppInput label="Payer / payee (optional)" value={form.payer} onChangeText={(v) => setField('payer', v)} placeholder="e.g. OTP Bank" />
          <AppInput label="Notes (optional)" value={form.notes} onChangeText={(v) => setField('notes', v)} placeholder="Add a note…" multiline numberOfLines={2} style={{ minHeight: 60, textAlignVertical: 'top' }} />

          <AppButton onPress={handleSave} loading={saving} fullWidth>Save changes</AppButton>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleToggleActive}>
            <Ionicons name={editing?.is_active ? 'pause-outline' : 'play-outline'} size={16} color={colors.muted} />
            <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>
              {editing?.is_active ? 'Pause' : 'Resume'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </BottomModal>

      {/* Category picker sub-modal */}
      <BottomModal visible={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Select category">
        <TouchableOpacity
          style={[styles.modalRow, { borderBottomColor: colors.border }, !form.category_id && { backgroundColor: colors.accent + '11' }]}
          onPress={() => { setField('category_id', ''); setShowCategoryModal(false); }}
        >
          <Text style={[styles.modalRowText, { color: !form.category_id ? colors.accent : colors.text }]}>— None</Text>
          {!form.category_id && <Text style={{ color: colors.accent }}>✓</Text>}
        </TouchableOpacity>
        {categories.map((c) => (
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
    </SafeAreaView>
  );
}

function RecurringCard({ item, colors, onPress }: { item: RecurringPayment; colors: any; onPress: () => void }) {
  const currency = item.wallet?.currency ?? 'HUF';
  const next = nextDueDate(item);
  const now = new Date();
  const isOverdue = next ? next < now : false;
  const isDueSoon = next ? !isOverdue && next.getTime() - now.getTime() < 7 * 24 * 3600 * 1000 : false;
  const statusColor = !item.is_active ? colors.muted : isOverdue ? colors.danger : isDueSoon ? '#f59e0b' : colors.muted;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: isOverdue && item.is_active ? colors.danger + '66' : colors.border },
        !item.is_active && { opacity: 0.55 },
      ]}
    >
      <View style={styles.cardMain}>
        <View style={styles.cardLeft}>
          {item.category?.icon ? <Text style={styles.categoryIcon}>{item.category.icon}</Text> : null}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.name}</Text>
            {item.category && <Text style={[styles.cardSub, { color: colors.muted }]}>{item.category.name}</Text>}
            {item.wallet && (
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                {item.wallet.icon ? `${item.wallet.icon} ` : ''}{item.wallet.name}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardAmount, { color: item.type === 'income' ? colors.income : colors.expense }]}>
            {item.type === 'income' ? '+' : '−'}{formatCurrency(item.amount, currency)}
          </Text>
          <Text style={[styles.cardFreq, { color: colors.muted }]}>{frequencyLabel(item.frequency)}</Text>
        </View>
      </View>
      {!item.is_active ? (
        <View style={[styles.dueRow, { borderTopColor: colors.border }]}>
          <View style={[styles.dueBadge, { backgroundColor: colors.muted + '22' }]}>
            <Text style={[styles.dueText, { color: colors.muted }]}>Paused</Text>
          </View>
        </View>
      ) : next ? (
        <View style={[styles.dueRow, { borderTopColor: colors.border }]}>
          <View style={[styles.dueBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.dueText, { color: statusColor }]}>
              {isOverdue ? 'Overdue' : isDueSoon ? 'Due soon' : 'Next'}: {formatDate(isoDate(next))}
            </Text>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, gap: 10 },
  cardLeft: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  categoryIcon: { fontSize: 22, paddingTop: 2 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  cardSub: { fontSize: 13 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  cardAmount: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  cardFreq: { fontSize: 12 },
  dueRow: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1 },
  dueBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dueText: { fontSize: 13, fontFamily: 'Figtree_500Medium' },

  modalForm: { gap: 14, paddingBottom: 8 },
  formError: { fontSize: 13, textAlign: 'center' },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  pickerBtnText: { fontSize: 15, flex: 1 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  modalRowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  modalRowText: { flex: 1, fontSize: 15 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  secondaryBtnText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  deleteBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
});
