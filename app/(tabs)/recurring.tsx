import { useEffect, useRef, useState, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ConfirmModal from '@/components/ConfirmModal';
import { Ionicons } from '@expo/vector-icons';
import type { RecurringPayment, Wallet, Category, Label, RecurrenceFrequency } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { generateDueDates, nextDueDate, frequencyLabel, isoDate, monthBounds } from '@/lib/recurringUtils';
import { useRecurring } from '@/lib/recurringContext';
import { Events } from '@/lib/events';
import Toast from '@/components/Toast';

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

export default function RecurringScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { setHasDueToday } = useRecurring();

  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<RecurringPayment | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedDue, setSelectedDue] = useState<{ payment: RecurringPayment; dueDate: Date } | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; success: boolean; undoable: boolean }>({ visible: false, message: '', success: true, undoable: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPay = useRef<{ transactionId: string; paymentId: string; dueDate: string } | null>(null);

  function showToast(message: string, success: boolean, undoable = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, success, undoable });
    toastTimer.current = setTimeout(() => { setToast(t => ({ ...t, visible: false })); lastPay.current = null; }, 3000);
  }

  async function handleUndo() {
    const ref = lastPay.current;
    if (!ref) return;
    lastPay.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, visible: false }));
    await Promise.all([
      supabase.from('transactions').delete().eq('id', ref.transactionId),
      supabase.from('recurring_occurrences').delete()
        .eq('recurring_payment_id', ref.paymentId)
        .eq('due_date', ref.dueDate),
    ]);
    Events.emit('transaction-saved', { success: true });
    load();
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [from, to] = monthBounds(viewYear, viewMonth);
    const wideFrom = new Date(from); wideFrom.setMonth(wideFrom.getMonth() - 1);
    const wideTo = new Date(to); wideTo.setMonth(wideTo.getMonth() + 1);

    const [{ data: pmts }, { data: w }, { data: c }, { data: occs }, { data: l }] = await Promise.all([
      supabase.from('recurring_payments').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).neq('is_archived', true),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id)
        .gte('due_date', isoDate(wideFrom)).lte('due_date', isoDate(wideTo)),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);

    const walletMap = new Map((w ?? []).map((x: Wallet) => [x.id, x]));
    const categoryMap = new Map((c ?? []).map((x: Category) => [x.id, x]));

    setWallets(w ?? []);
    setCategories(c ?? []);
    setLabels(l ?? []);
    setOccurrences(occs ?? []);
    setPayments((pmts ?? []).map((r: any) => ({
      ...r,
      wallet: r.wallet_id ? walletMap.get(r.wallet_id) ?? null : null,
      category: r.category_id ? categoryMap.get(r.category_id) ?? null : null,
    })));
  }, [viewYear, viewMonth]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return;
      channel = supabase
        .channel('purrfolio-recurring-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_occurrences', filter: `user_id=eq.${user.id}` }, () => load())
        .subscribe();
    });
    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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

  const overdueItems = dueItems.filter(i => isoDate(i.dueDate) < isoDate(today));
  const todayItems = dueItems.filter(i => isoDate(i.dueDate) === isoDate(today));
  const upcomingItems = dueItems.filter(i => isoDate(i.dueDate) > isoDate(today));

  useEffect(() => { setHasDueToday(todayItems.length > 0); }, [todayItems.length]);

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
        date: isoDate(new Date()),
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
      lastPay.current = { transactionId: txData.id, paymentId: payment.id, dueDate: isoDate(dueDate) };
      Events.emit('transaction-saved', { success: true });
      showToast('Payment confirmed!', true, true);
    } else {
      showToast('Failed to confirm payment.', false);
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

  async function handleDelete() {
    await supabase.from('recurring_payments').delete().eq('id', editing!.id);
    setEditing(null);
    load();
  }

  async function handleToggleActive() {
    if (!editing) return;
    const next = !editing.is_active;
    await supabase.from('recurring_payments').update({ is_active: next }).eq('id', editing.id);
    setEditing(null);
    load();
  }

  const [activeTab, setActiveTab] = useState<'due' | 'recurring'>('due');

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader
        title="Planned"
        rightAction={
          activeTab === 'recurring' ? (
            <TouchableOpacity
              onPress={() => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Tab strip */}
      <View style={[styles.tabStrip, { borderBottomColor: colors.border }]}>
        {(['due', 'recurring'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, { color: active ? colors.accent : colors.muted }]}>
                {tab === 'due' ? 'Upcoming' : 'Recurring'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Upcoming tab ───────────────────────────────────────────────────── */}
      {activeTab === 'due' && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16, paddingTop: 16 }]}
        >
          {/* Month navigator */}
          <View style={[styles.monthNavRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={colors.muted} />
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {dueItems.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
              {payments.filter(p => p.is_active).length === 0
                ? 'No recurring payments yet.'
                : 'All payments for this period have been handled.'}
            </Text>
          )}

          {overdueItems.length > 0 && (
            <>
              <Text style={[styles.dueGroupLabel, { color: colors.danger, marginTop: 10 }]}>Overdue</Text>
              {overdueItems.map(({ payment, dueDate }) => {
                const key = `${payment.id}|${isoDate(dueDate)}`;
                return (
                  <DueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    onPress={() => setSelectedDue({ payment, dueDate })}
                    colors={colors}
                  />
                );
              })}
            </>
          )}

          {todayItems.length > 0 && (
            <>
              <Text style={[styles.dueGroupLabel, { color: colors.text, marginTop: 10 }]}>Today</Text>
              {todayItems.map(({ payment, dueDate }) => {
                const key = `${payment.id}|${isoDate(dueDate)}`;
                return (
                  <DueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    onPress={() => setSelectedDue({ payment, dueDate })}
                    colors={colors}
                  />
                );
              })}
            </>
          )}

          {upcomingItems.length > 0 && (
            <>
              {(overdueItems.length > 0 || todayItems.length > 0) && (
                <Text style={[styles.dueGroupLabel, { color: colors.muted, marginTop: 10 }]}>Upcoming</Text>
              )}
              {upcomingItems.map(({ payment, dueDate }) => {
                const key = `${payment.id}|${isoDate(dueDate)}`;
                return (
                  <DueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    onPress={() => setSelectedDue({ payment, dueDate })}
                    colors={colors}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Recurring tab ─────────────────────────────────────────────── */}
      {activeTab === 'recurring' && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16, paddingTop: 16 }]}
        >
          {payments.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.muted, textAlign: 'center', marginTop: 24 }]}>
              No recurring payments yet.
            </Text>
          )}

          {(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as RecurrenceFrequency[])
            .filter(f => payments.some(p => p.frequency === f))
            .map(f => (
              <View key={f}>
                <Text style={[styles.freqLabel, { color: colors.muted }]}>{frequencyLabel(f).toUpperCase()}</Text>
                {payments.filter(p => p.frequency === f).map((p) => (
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
                        labelIds: [],
                      });
                      setFormError('');
                      setEditing(p);
                    }}
                  />
                ))}
              </View>
            ))
          }
        </ScrollView>
      )}

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
        labels={labels}
        colors={colors}
      />

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
          labels={labels}
          colors={colors}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          isActive={editing.is_active}
        />
      )}
      {/* Due item action sheet */}
      <BottomModal
        visible={!!selectedDue}
        onClose={() => setSelectedDue(null)}
        title={selectedDue?.payment.name}
      >
        {selectedDue && (() => {
          const { payment, dueDate } = selectedDue;
          const key = `${payment.id}|${isoDate(dueDate)}`;
          const loading = actionLoading === key;
          const currency = payment.wallet?.currency ?? 'HUF';
          return (
            <>
              <View style={[styles.actionSheetAmount, { borderColor: colors.border }]}>
                <Text style={[styles.actionSheetAmountLabel, { color: colors.muted }]}>
                  {dueDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
                <Text style={[styles.actionSheetAmountValue, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
                  {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.actionSheetBtn, { backgroundColor: colors.accent }]}
                onPress={() => { setSelectedDue(null); handlePay(payment, dueDate); }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.actionSheetBtnText}>Mark as paid</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionSheetBtn, styles.actionSheetBtnOutline, { borderColor: colors.border }]}
                onPress={() => { setSelectedDue(null); handleSkip(payment, dueDate); }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={[styles.actionSheetBtnText, { color: colors.muted }]}>Skip</Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </BottomModal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        success={toast.success}
        bottomOffset={TAB_BAR_HEIGHT + bottom + 16}
        onUndo={toast.undoable ? handleUndo : undefined}
      />
    </SafeAreaView>
  );
}

// ─── DueCard ────────────────────────────────────────────────────────────────

function DueCard({
  payment, dueDate, today, onPress, colors,
}: {
  payment: RecurringPayment;
  dueDate: Date;
  today: Date;
  onPress: () => void;
  colors: any;
}) {
  const currency = payment.wallet?.currency ?? 'HUF';
  const isOverdue = isoDate(dueDate) < isoDate(today);
  const isToday = isoDate(dueDate) === isoDate(today);
  const diff = Math.round((new Date(isoDate(dueDate) + 'T00:00:00').getTime() - new Date(isoDate(today) + 'T00:00:00').getTime()) / 86400000);
  const label = isToday ? 'Today'
    : diff === 1 ? 'Tomorrow'
      : diff < 0 ? `${Math.abs(diff)}d overdue`
        : diff < 7 ? `In ${diff} days`
          : dueDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });

  return (
    <TouchableOpacity
      style={[styles.dueCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.dueMeta}>
        <View style={[styles.iconBox, { backgroundColor: '#fcf1ff' }]}>
          {payment.category?.icon ? <Text style={styles.dueIcon}>{payment.category.icon}</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dueName, { color: colors.text }]}>{payment.name}</Text>
          <Text style={[styles.dueSub, { color: isOverdue ? colors.danger : isToday ? colors.text : colors.muted }]}>{label}</Text>
        </View>
      </View>
      <Text style={[styles.dueAmount, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
        {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
      </Text>
    </TouchableOpacity>
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
  const subText = !payment.is_active
    ? 'Paused'
    : next
      ? next.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
  return (
    <TouchableOpacity
      style={[styles.dueCard, { backgroundColor: colors.surface, marginBottom: 12 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.dueMeta}>
        <View style={[styles.iconBox, { backgroundColor: '#fcf1ff' }]}>
          {payment.category?.icon ? <Text style={styles.dueIcon}>{payment.category.icon}</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dueName, { color: payment.is_active ? colors.text : colors.muted }]}>{payment.name}</Text>
          {subText ? <Text style={[styles.dueSub, { color: colors.muted }]}>{subText}</Text> : null}
        </View>
      </View>
      <Text style={[styles.dueAmount, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
        {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── PaymentModal (full-screen, matches [id].tsx layout) ─────────────────────

function PaymentModal({
  visible, onClose, title,
  form, setForm, formError, saving, onSave,
  wallets, categories, labels,
  colors,
  onDelete, onToggleActive, isActive,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  form: EditForm;
  setForm: Dispatch<SetStateAction<EditForm>>;
  formError: string;
  saving: boolean;
  onSave: () => void;
  wallets: Wallet[];
  categories: Category[];
  labels: Label[];
  colors: any;
  onDelete?: () => void;
  onToggleActive?: () => void;
  isActive?: boolean;
}) {
  const { bottom } = useSafeAreaInsets();
  const amountRef = useRef<TextInput>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [showDotMenu, setShowDotMenu] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'delete' | 'pause' | 'close' | null>(null);

  const initialFormRef = useRef<EditForm>(form);
  useEffect(() => {
    if (visible) initialFormRef.current = form;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  function handleClose() {
    if (isDirty) { setConfirmKind('close'); return; }
    onClose();
  }

  useEffect(() => {
    if (!visible) {
      setShowWalletModal(false);
      setShowFrequencyModal(false);
      setShowCategoryModal(false);
      setShowLabelModal(false);
      setShowStartDatePicker(false);
      setShowEndDatePicker(false);
      setMoreExpanded(false);
      setShowDotMenu(false);
      setConfirmKind(null);
    }
  }, [visible]);

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

  const selectedWallet = wallets.find((w) => w.id === form.wallet_id);
  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const selectedLabels = labels.filter((l) => form.labelIds.includes(l.id));
  const currency = selectedWallet?.currency ?? '';
  const filteredCategories = categories.filter((c) => c.type === 'both' || c.type === form.type);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView edges={['top']} style={[styles.modalSafe, { backgroundColor: colors.bg }]}>

        {/* Header */}
        <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
          {onDelete ? (
            <View>
              <TouchableOpacity onPress={() => setShowDotMenu((v) => !v)} style={styles.headerBtnRight}>
                <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
              </TouchableOpacity>
              {showDotMenu && (
                <View style={[styles.dotMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {onToggleActive && (
                    <TouchableOpacity
                      style={[styles.dotMenuItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                      onPress={() => { setShowDotMenu(false); setConfirmKind('pause'); }}
                    >
                      <Ionicons name={isActive ? 'pause-outline' : 'play-outline'} size={18} color={colors.text} />
                      <Text style={[styles.dotMenuText, { color: colors.text }]}>
                        {isActive ? 'Pause' : 'Resume'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.dotMenuItem}
                    onPress={() => { setShowDotMenu(false); setConfirmKind('delete'); }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    <Text style={[styles.dotMenuText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
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
            <AppButton onPress={onSave} loading={saving} fullWidth>
              {onDelete ? 'Save changes' : 'Save recurring payment'}
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
              {form.wallet_id === w.id && <Text style={{ color: colors.accent }}>
                <Ionicons name="checkmark" size={18} color={colors.accent} />
              </Text>}
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
              {form.frequency === f && <Text style={{ color: colors.accent }}><Ionicons name="checkmark" size={18} color={colors.accent} /></Text>}
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
                {selected && <Text style={{ color: l.color }}><Ionicons name="checkmark" size={18} color={l.color} /></Text>}
              </TouchableOpacity>
            );
          })}
          <View style={{ marginTop: 8 }}>
            <AppButton onPress={() => setShowLabelModal(false)} fullWidth>Done</AppButton>
          </View>
        </BottomModal>

        <ConfirmModal
          visible={confirmKind === 'delete'}
          title="Delete recurring payment"
          message="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => { setConfirmKind(null); onDelete?.(); }}
          onCancel={() => setConfirmKind(null)}
        />
        <ConfirmModal
          visible={confirmKind === 'pause'}
          title={isActive ? 'Pause recurring payment' : 'Resume recurring payment'}
          message={isActive ? 'No future occurrences will be scheduled while paused.' : 'Future occurrences will resume being scheduled.'}
          confirmLabel={isActive ? 'Pause' : 'Resume'}
          onConfirm={() => { setConfirmKind(null); onToggleActive?.(); }}
          onCancel={() => setConfirmKind(null)}
        />
        <ConfirmModal
          visible={confirmKind === 'close'}
          title="Discard changes?"
          message="You have unsaved changes. Are you sure you want to discard them?"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => { setConfirmKind(null); onClose(); }}
          onCancel={() => setConfirmKind(null)}
        />

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 10 },
  tabStrip: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  monthNavRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 4,
    marginBottom: 12,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthNavBtn: { padding: 8 },
  monthLabel: { fontSize: 14, fontFamily: 'Figtree_600SemiBold', flex: 1, textAlign: 'center' },
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
    marginTop: 8,
    marginBottom: 6,
  },
  dueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dueMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dueIcon: { fontSize: 20 },
  dueName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  dueSub: { fontSize: 12, marginTop: 1 },
  dueAmount: { fontSize: 14, fontFamily: 'Figtree_700Bold' },

  // Action sheet
  actionSheetAmount: {
    borderWidth: 1, borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 4, marginBottom: 4,
  },
  actionSheetAmountLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  actionSheetAmountValue: { fontSize: 28, fontFamily: 'Lora_700Bold' },
  actionSheetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  actionSheetBtnOutline: { borderWidth: 1 },
  actionSheetBtnText: { fontSize: 16, fontFamily: 'Figtree_600SemiBold', color: '#fff' },
  paymentGroup: {
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  paymentIcon: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  paymentDot: { width: 10, height: 10, borderRadius: 5 },
  paymentName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  paymentSub: { fontSize: 12, marginTop: 1 },
  paymentAmount: { fontSize: 14, fontFamily: 'Figtree_700Bold' },

  // Full-screen modal
  modalSafe: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerBtnRight: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  form: { padding: 16, gap: 16, flexGrow: 1 },
  stickyFooter: {
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  error: { fontSize: 14, textAlign: 'center' },

  // Type toggle (matches [id].tsx)
  typeToggle: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    overflow: 'hidden', padding: 4, gap: 4,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  typeBtnText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },

  // Amount display (matches add.tsx)
  amountSection: { alignItems: 'center' },
  amountDisplay: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'center', paddingVertical: 8, gap: 6,
  },
  amountText: { fontSize: 52, fontFamily: 'Lora_400Regular', minWidth: 60, textAlign: 'center' },
  amountCurrency: { fontSize: 15, fontFamily: 'Figtree_700Bold', marginBottom: 22 },

  // Row layout
  row: { flexDirection: 'row', gap: 8 },

  // Fields
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontFamily: 'Figtree_500Medium', marginBottom: 4 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  pickerBtnText: { fontSize: 14, flex: 1 },

  // More options (matches [id].tsx)
  moreToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
  },
  moreToggleText: { fontSize: 14, fontFamily: 'Figtree_500Medium' },
  clearText: { fontSize: 13, textAlign: 'right' },

  dotMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 160,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  dotMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dotMenuText: { fontSize: 15, fontFamily: 'Figtree_500Medium' },

  // Modal list rows (matches [id].tsx)
  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  modalRowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  modalRowText: { flex: 1, fontSize: 15 },
  labelDot: { width: 12, height: 12, borderRadius: 6 },
});
