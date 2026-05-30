import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
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
import { formatCurrency } from '@/lib/utils';
import { generateDueDates, nextDueDate, frequencyLabel, isoDate, monthBounds } from '@/lib/recurringUtils';

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

  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<RecurringPayment | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [from, to] = monthBounds(viewYear, viewMonth);
    const wideFrom = new Date(from); wideFrom.setMonth(wideFrom.getMonth() - 1);
    const wideTo = new Date(to); wideTo.setMonth(wideTo.getMonth() + 1);

    const [{ data: pmts }, { data: w }, { data: c }, { data: occs }] = await Promise.all([
      supabase.from('recurring_payments').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id)
        .gte('due_date', isoDate(wideFrom)).lte('due_date', isoDate(wideTo)),
    ]);

    const walletMap = new Map((w ?? []).map((x: Wallet) => [x.id, x]));
    const categoryMap = new Map((c ?? []).map((x: Category) => [x.id, x]));

    setWallets(w ?? []);
    setCategories(c ?? []);
    setOccurrences(occs ?? []);
    setPayments((pmts ?? []).map((r: any) => ({
      ...r,
      wallet: r.wallet_id ? walletMap.get(r.wallet_id) ?? null : null,
      category: r.category_id ? categoryMap.get(r.category_id) ?? null : null,
    })));
  }, [viewYear, viewMonth]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const today = new Date();

  const dueItems = useMemo(() => {
    const [from, to] = monthBounds(viewYear, viewMonth);
    const actionedKeys = new Set(occurrences.map((o: any) => `${o.recurring_payment_id}|${o.due_date}`));
    const items: { payment: RecurringPayment; dueDate: Date }[] = [];
    for (const p of payments) {
      for (const date of generateDueDates(p, from, to)) {
        if (!actionedKeys.has(`${p.id}|${isoDate(date)}`)) {
          items.push({ payment: p, dueDate: date });
        }
      }
    }
    return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [payments, occurrences, viewYear, viewMonth]);

  const overdueItems = dueItems.filter(i => i.dueDate < today && isoDate(i.dueDate) !== isoDate(today));
  const upcomingItems = dueItems.filter(i => i.dueDate >= today || isoDate(i.dueDate) === isoDate(today));

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  async function handlePay(payment: RecurringPayment, dueDate: Date) {
    const key = `${payment.id}|${isoDate(dueDate)}`;
    setActionLoading(key);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(null); return; }

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: payment.type,
        amount: payment.amount,
        wallet_id: payment.wallet_id,
        category_id: payment.category_id,
        date: isoDate(dueDate),
        notes: payment.notes,
        payer: payment.payer,
      })
      .select('id')
      .single();

    if (!txErr && txData) {
      await supabase.from('recurring_occurrences').insert({
        recurring_payment_id: payment.id,
        user_id: user.id,
        due_date: isoDate(dueDate),
        status: 'paid',
        transaction_id: txData.id,
      });
    }
    setActionLoading(null);
    load();
  }

  async function handleSkip(payment: RecurringPayment, dueDate: Date) {
    const key = `${payment.id}|${isoDate(dueDate)}`;
    setActionLoading(key);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(null); return; }
    await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: payment.id,
      user_id: user.id,
      due_date: isoDate(dueDate),
      status: 'skipped',
      transaction_id: null,
    });
    setActionLoading(null);
    load();
  }

  async function handleAdd() {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.amount || isNaN(Number(form.amount))) { setFormError('Enter a valid amount.'); return; }

    setSaving(true);
    setFormError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
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
      });

    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setShowAddModal(false);
    load();
  }

  async function handleEdit() {
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

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader
        title="Planned"
        leftAction={
          <TouchableOpacity
            onPress={() => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}
      >

        {/* Due this month */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Due this month</Text>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color={colors.muted} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {dueItems.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {payments.filter(p => p.is_active).length === 0
                ? 'No recurring payments yet.'
                : 'All payments for this month have been handled.'}
            </Text>
          )}

          {overdueItems.length > 0 && (
            <>
              <Text style={[styles.dueGroupLabel, { color: colors.danger }]}>Overdue</Text>
              {overdueItems.map(({ payment, dueDate }) => {
                const key = `${payment.id}|${isoDate(dueDate)}`;
                return (
                  <DueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    loading={actionLoading === key}
                    onPay={() => handlePay(payment, dueDate)}
                    onSkip={() => handleSkip(payment, dueDate)}
                    colors={colors}
                  />
                );
              })}
            </>
          )}

          {upcomingItems.length > 0 && (
            <>
              {overdueItems.length > 0 && (
                <Text style={[styles.dueGroupLabel, { color: colors.muted }]}>Upcoming</Text>
              )}
              {upcomingItems.map(({ payment, dueDate }) => {
                const key = `${payment.id}|${isoDate(dueDate)}`;
                return (
                  <DueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    loading={actionLoading === key}
                    onPay={() => handlePay(payment, dueDate)}
                    onSkip={() => handleSkip(payment, dueDate)}
                    colors={colors}
                  />
                );
              })}
            </>
          )}
        </View>

        {/* All recurring payments grouped by frequency */}
        {payments.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>All recurring payments</Text>
            {(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as RecurrenceFrequency[])
              .filter(f => payments.some(p => p.frequency === f))
              .map(f => (
                <View key={f}>
                  <Text style={[styles.freqLabel, { color: colors.muted }]}>{frequencyLabel(f).toUpperCase()}</Text>
                  {payments.filter(p => p.frequency === f).map(p => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      colors={colors}
                      onPress={() => {
                        setForm({
                          name: p.name, type: p.type, amount: String(p.amount),
                          wallet_id: p.wallet_id ?? '', category_id: p.category_id ?? '',
                          frequency: p.frequency, start_date: p.start_date,
                          end_date: p.end_date ?? '', payer: p.payer ?? '', notes: p.notes ?? '',
                        });
                        setFormError('');
                        setEditing(p);
                      }}
                    />
                  ))}
                </View>
              ))
            }
          </View>
        )}

        {payments.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.muted, textAlign: 'center', marginTop: 32 }]}>
            No recurring payments yet.
          </Text>
        )}

      </ScrollView>

      {/* Add modal */}
      <PaymentModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add recurring payment"
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        onSave={handleAdd}
        wallets={wallets}
        categories={categories}
        showCategoryModal={showCategoryModal}
        setShowCategoryModal={setShowCategoryModal}
        colors={colors}
      />

      {/* Edit modal */}
      {editing && (
        <PaymentModal
          visible={!!editing}
          onClose={() => setEditing(null)}
          title="Edit recurring payment"
          form={form}
          setForm={setForm}
          formError={formError}
          saving={saving}
          onSave={handleEdit}
          wallets={wallets}
          categories={categories}
          showCategoryModal={showCategoryModal}
          setShowCategoryModal={setShowCategoryModal}
          colors={colors}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          isActive={editing.is_active}
        />
      )}
    </SafeAreaView>
  );
}

// ─── DueCard ────────────────────────────────────────────────────────────────

function DueCard({
  payment, dueDate, today, loading, onPay, onSkip, colors,
}: {
  payment: RecurringPayment;
  dueDate: Date;
  today: Date;
  loading: boolean;
  onPay: () => void;
  onSkip: () => void;
  colors: any;
}) {
  const currency = payment.wallet?.currency ?? 'HUF';
  const isOverdue = dueDate < today && isoDate(dueDate) !== isoDate(today);
  const diff = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  let label = isoDate(dueDate) === isoDate(today) ? 'Today'
    : diff === 1 ? 'Tomorrow'
    : diff < 0 ? `${Math.abs(diff)}d overdue`
    : diff < 7 ? `In ${diff} days`
    : dueDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });

  return (
    <View style={[styles.dueCard, { borderColor: isOverdue ? colors.danger + '44' : colors.border }]}>
      <View style={styles.dueMeta}>
        {payment.category?.icon ? <Text style={styles.dueIcon}>{payment.category.icon}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.dueName, { color: colors.text }]}>{payment.name}</Text>
          <Text style={[styles.dueSub, { color: isOverdue ? colors.danger : colors.muted }]}>{label}</Text>
        </View>
      </View>
      <View style={styles.dueRight}>
        <Text style={[styles.dueAmount, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
          {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
        </Text>
        <View style={styles.dueActions}>
          <TouchableOpacity
            style={[styles.skipBtn, { borderColor: colors.border }]}
            onPress={onSkip}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payBtn, { backgroundColor: colors.accent }]}
            onPress={onPay}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── PaymentRow ──────────────────────────────────────────────────────────────

function PaymentRow({
  payment, colors, onPress,
}: {
  payment: RecurringPayment;
  colors: any;
  onPress: () => void;
}) {
  const currency = payment.wallet?.currency ?? 'HUF';
  const next = nextDueDate(payment);
  const dotColor = payment.category?.color || colors.muted;
  return (
    <TouchableOpacity
      style={[styles.paymentRow, { borderTopColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.paymentIcon, { backgroundColor: dotColor + '28' }]}>
        {payment.category?.icon
          ? <Text style={{ fontSize: 16 }}>{payment.category.icon}</Text>
          : <View style={[styles.paymentDot, { backgroundColor: dotColor }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.paymentName, { color: payment.is_active ? colors.text : colors.muted }]}>
          {payment.name}
        </Text>
        {payment.category && (
          <Text style={[styles.paymentSub, { color: colors.muted }]}>{payment.category.name}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.paymentAmount, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
          {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
        </Text>
        {!payment.is_active
          ? <Text style={[styles.paymentSub, { color: colors.muted }]}>Paused</Text>
          : next
          ? <Text style={[styles.paymentSub, { color: colors.muted }]}>
              Next: {next.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── PaymentModal ────────────────────────────────────────────────────────────

function PaymentModal({
  visible, onClose, title,
  form, setForm, formError, saving, onSave,
  wallets, categories,
  showCategoryModal, setShowCategoryModal,
  colors,
  onDelete, onToggleActive, isActive,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  form: EditForm;
  setForm: React.Dispatch<React.SetStateAction<EditForm>>;
  formError: string;
  saving: boolean;
  onSave: () => void;
  wallets: Wallet[];
  categories: Category[];
  showCategoryModal: boolean;
  setShowCategoryModal: (v: boolean) => void;
  colors: any;
  onDelete?: () => void;
  onToggleActive?: () => void;
  isActive?: boolean;
}) {
  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedCategory = categories.find((c) => c.id === form.category_id);

  return (
    <>
      <BottomModal visible={visible} onClose={onClose} title={title}>
        <View style={styles.modalForm}>
          {formError ? <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text> : null}

          {/* Type chips */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Type</Text>
            <View style={styles.chips}>
              {(['expense', 'income'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    form.type === t && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                  ]}
                  onPress={() => setField('type', t)}
                >
                  <Text style={[styles.chipText, { color: form.type === t ? colors.accent : colors.text }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AppInput
            label="Name"
            value={form.name}
            onChangeText={(v) => setField('name', v)}
            placeholder="e.g. Netflix"
          />
          <AppInput
            label="Amount"
            value={form.amount}
            onChangeText={(v) => setField('amount', v)}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <AppInput
            label="Start date (YYYY-MM-DD)"
            value={form.start_date}
            onChangeText={(v) => setField('start_date', v)}
            placeholder="2024-01-01"
          />
          <AppInput
            label="End date (optional)"
            value={form.end_date}
            onChangeText={(v) => setField('end_date', v)}
            placeholder="2025-12-31"
          />

          {/* Frequency chips */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Frequency</Text>
            <View style={styles.chips}>
              {FREQUENCIES.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    form.frequency === f && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                  ]}
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
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      form.wallet_id === w.id && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                    ]}
                    onPress={() => setField('wallet_id', form.wallet_id === w.id ? '' : w.id)}
                  >
                    {w.icon ? <Text>{w.icon} </Text> : null}
                    <Text style={[styles.chipText, { color: form.wallet_id === w.id ? colors.accent : colors.text }]}>
                      {w.name}
                    </Text>
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

          <AppInput
            label="Payer / payee (optional)"
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
            numberOfLines={2}
            style={{ minHeight: 60, textAlignVertical: 'top' }}
          />

          <AppButton onPress={onSave} loading={saving} fullWidth>Save</AppButton>

          {onToggleActive && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={onToggleActive}>
              <Ionicons name={isActive ? 'pause-outline' : 'play-outline'} size={16} color={colors.muted} />
              <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>
                {isActive ? 'Pause' : 'Resume'}
              </Text>
            </TouchableOpacity>
          )}

          {onDelete && (
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </BottomModal>

      {/* Category sub-modal */}
      <BottomModal
        visible={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Select category"
      >
        <TouchableOpacity
          style={[
            styles.modalRow,
            { borderBottomColor: colors.border },
            !form.category_id && { backgroundColor: colors.accent + '11' },
          ]}
          onPress={() => { setField('category_id', ''); setShowCategoryModal(false); }}
        >
          <Text style={[styles.modalRowText, { color: !form.category_id ? colors.accent : colors.text }]}>
            — None
          </Text>
          {!form.category_id && <Text style={{ color: colors.accent }}>✓</Text>}
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[
              styles.modalRow,
              { borderBottomColor: colors.border },
              form.category_id === c.id && { backgroundColor: colors.accent + '11' },
            ]}
            onPress={() => { setField('category_id', c.id); setShowCategoryModal(false); }}
          >
            {c.icon
              ? <Text style={styles.modalRowIcon}>{c.icon}</Text>
              : <View style={{ width: 28 }} />}
            <Text style={[styles.modalRowText, { color: form.category_id === c.id ? colors.accent : colors.text }]}>
              {c.name}
            </Text>
            {form.category_id === c.id && <Text style={{ color: colors.accent }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </BottomModal>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontFamily: 'Figtree_600SemiBold' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthNavBtn: { padding: 4 },
  monthLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium', minWidth: 90, textAlign: 'center' },
  emptyText: { fontSize: 14, paddingVertical: 8 },
  dueGroupLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  freqLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  dueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 6,
  },
  dueMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dueIcon: { fontSize: 20 },
  dueName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  dueSub: { fontSize: 12, marginTop: 1 },
  dueRight: { alignItems: 'flex-end', gap: 6 },
  dueAmount: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  dueActions: { flexDirection: 'row', gap: 6 },
  skipBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  paymentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  paymentDot: { width: 10, height: 10, borderRadius: 5 },
  paymentName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  paymentSub: { fontSize: 12, marginTop: 1 },
  paymentAmount: { fontSize: 14, fontFamily: 'Figtree_700Bold' },

  // modal form styles
  modalForm: { gap: 14, paddingBottom: 8 },
  formError: { fontSize: 13, textAlign: 'center' },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
});
