import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import BottomModal from '@/components/BottomModal';
import { Ionicons } from '@expo/vector-icons';
import type { RecurringPayment, RecurrenceFrequency, Wallet, Category } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { generateDueDates, nextDueDate, frequencyLabel, isoDate, monthBounds } from '@/lib/recurringUtils';
import { useRecurring } from '@/lib/recurringContext';
import { Events } from '@/lib/events';
import Toast from '@/components/Toast';

export default function RecurringScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { setHasDueToday } = useRecurring();

  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [occurrences, setOccurrences] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedDue, setSelectedDue] = useState<{ payment: RecurringPayment; dueDate: Date } | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; success: boolean; undoable: boolean }>({ visible: false, message: '', success: true, undoable: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUndo = useRef<
    | { type: 'pay'; transactionId: string; paymentId: string; dueDate: string }
    | { type: 'skip'; paymentId: string; dueDate: string }
    | null
  >(null);

  function showToast(message: string, success: boolean, undoable = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, success, undoable });
    toastTimer.current = setTimeout(() => { setToast(t => ({ ...t, visible: false })); pendingUndo.current = null; }, 3000);
  }

  async function handleUndo() {
    const action = pendingUndo.current;
    if (!action) return;
    pendingUndo.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ ...t, visible: false }));
    if (action.type === 'pay') {
      await Promise.all([
        supabase.from('transactions').delete().eq('id', action.transactionId),
        supabase.from('recurring_occurrences').delete()
          .eq('recurring_payment_id', action.paymentId)
          .eq('due_date', action.dueDate),
      ]);
      Events.emit('transaction-saved', { success: true });
    } else {
      await supabase.from('recurring_occurrences').delete()
        .eq('recurring_payment_id', action.paymentId)
        .eq('due_date', action.dueDate);
    }
    load();
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [from, to] = monthBounds(viewYear, viewMonth);
    const wideFrom = new Date(from); wideFrom.setMonth(wideFrom.getMonth() - 1);
    const wideTo = new Date(to); wideTo.setMonth(wideTo.getMonth() + 1);

    const [{ data: pmts }, { data: w }, { data: c }, { data: occs }] = await Promise.all([
      supabase.from('recurring_payments').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).neq('is_archived', true),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('recurring_occurrences').select('*').eq('user_id', user.id)
        .gte('due_date', isoDate(wideFrom)).lte('due_date', isoDate(wideTo)),
    ]);

    const walletMap = new Map((w ?? []).map((x: Wallet) => [x.id, x]));
    const categoryMap = new Map((c ?? []).map((x: Category) => [x.id, x]));

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

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    return Events.on('recurring-saved', ({ success, message }: { success: boolean; message?: string }) => {
      loadRef.current();
      showToast(message ?? (success ? 'Done.' : 'Something went wrong.'), success);
    });
  }, []);

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
      pendingUndo.current = { type: 'pay', transactionId: txData.id, paymentId: payment.id, dueDate: isoDate(dueDate) };
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
    const { error } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: payment.id,
      user_id: user.id,
      due_date: isoDate(dueDate),
      status: 'skipped',
      transaction_id: null,
    });
    if (!error) {
      pendingUndo.current = { type: 'skip', paymentId: payment.id, dueDate: isoDate(dueDate) };
      showToast('Payment skipped.', true, true);
    } else {
      showToast('Failed to skip payment.', false);
    }
    setActionLoading(null);
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
              onPress={() => router.push('/payment/add')}
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
                  <SwipeableDueCard
                    key={key}
                    payment={payment}
                    dueDate={dueDate}
                    today={today}
                    onPress={() => setSelectedDue({ payment, dueDate })}
                    colors={colors}
                    onSwipePay={() => handlePay(payment, dueDate)}
                    onSwipeSkip={() => handleSkip(payment, dueDate)}
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
                    onPress={() => router.push(`/payment/${p.id}`)}
                  />
                ))}
              </View>
            ))
          }
        </ScrollView>
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

// ─── SwipeableDueCard ────────────────────────────────────────────────────────

function SwipeableDueCard({
  payment, dueDate, today, colors, onPress, onSwipePay, onSwipeSkip,
}: {
  payment: RecurringPayment;
  dueDate: Date;
  today: Date;
  colors: any;
  onPress: () => void;
  onSwipePay: () => void;
  onSwipeSkip: () => void;
}) {
  const swipeRef = useRef<any>(null);

  function handleOpen(direction: 'left' | 'right') {
    swipeRef.current?.close();
    if (direction === 'right') onSwipePay();
    else onSwipeSkip();
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: colors.income, marginLeft: 6 }]}>
          <Ionicons name="checkmark-circle-outline" size={26} color="#fff" />
          <Text style={styles.swipeActionText}>Add</Text>
        </View>
      )}
      renderLeftActions={() => (
        <View style={[styles.swipeAction, { backgroundColor: colors.border, marginRight: 6 }]}>
          <Ionicons name="close-circle-outline" size={26} color={colors.muted} />
          <Text style={[styles.swipeActionText, { color: colors.muted }]}>Skip</Text>
        </View>
      )}
      onSwipeableOpen={handleOpen}
    >
      <DueCard payment={payment} dueDate={dueDate} today={today} onPress={onPress} colors={colors} />
    </ReanimatedSwipeable>
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
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 2,
  },
  swipeActionText: { fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#fff' },

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
});
