import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/DashboardTransactionRow';
import SkeletonBox from '@/components/SkeletonBox';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import type { Transaction, Currency } from '@/lib/types';
import { formatCurrency, formatDayHeader, groupByDate } from '@/lib/utils';
import { getExchangeRatesForPeriod, getExchangeRates, getRatesForDate, toHUF, type DailyRates } from '@/lib/exchange';
import { Events } from '@/lib/events';
import Toast from '@/components/Toast';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPrevRange(v: PeriodValue): { from: string; to: string } {
  const f = new Date(v.from + 'T12:00:00');
  const t = new Date(v.to + 'T12:00:00');
  if (v.tab === 'weeks') {
    return {
      from: isoDate(new Date(f.getTime() - 7 * 86400000)),
      to: isoDate(new Date(t.getTime() - 7 * 86400000)),
    };
  }
  if (v.tab === 'months') {
    return {
      from: isoDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)),
      to: isoDate(new Date(f.getFullYear(), f.getMonth(), 0)),
    };
  }
  if (v.tab === 'years') {
    const y = f.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  return {
    from: isoDate(new Date(f.getTime() - days * 86400000)),
    to: isoDate(new Date(f.getTime() - 86400000)),
  };
}

function defaultPeriod(): PeriodValue {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    label: 'This month',
    tab: 'months',
  };
}

export default function DashboardScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [periodTxs, setPeriodTxs] = useState<Transaction[]>([]);
  const [prevNet, setPrevNet] = useState<number | null>(null);
  const [dailyRates, setDailyRates] = useState<DailyRates>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', success: true });

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setPeriodTxs([]);
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const prev = getPrevRange(period);
      const [{ data: w }, { data: txs }, { data: prevTxs }] = await Promise.all([
        supabase
          .from('wallets')
          .select('currency, is_default')
          .eq('user_id', user.id),
        // All transactions in selected period for cashflow + list
        supabase
          .from('transactions')
          .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
          .eq('user_id', user.id)
          .gte('date', period.from)
          .lte('date', period.to)
          .order('date', { ascending: false })
          .limit(10000),
        // Previous period transactions for vs% (exclude transfers)
        supabase
          .from('transactions')
          .select('type, amount')
          .eq('user_id', user.id)
          .gte('date', prev.from)
          .lte('date', prev.to)
          .filter('transfer_group_id', 'is', null)
          .limit(10000),
      ]);

      const defaultW = (w ?? []).find((wl: any) => wl.is_default) ?? (w ?? [])[0];
      if (defaultW?.currency) setCurrency(defaultW.currency as Currency);

      const normalized = (txs ?? []).map((tx: any) => ({
        ...tx,
        labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
      }));
      setPeriodTxs(normalized);

      let periodRates = await getExchangeRatesForPeriod(period.from, period.to);
      if (Object.keys(periodRates).length === 0) {
        const current = await getExchangeRates();
        if (Object.keys(current).length > 0) {
          periodRates = { [period.from]: current };
        }
      }
      setDailyRates(periodRates);

      const pList = prevTxs ?? [];
      const pInc = pList.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const pExp = pList.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      setPrevNet(pInc - pExp);
    } catch (e) {
      console.error('[Dashboard] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    return Events.on('transaction-saved', ({ success, message }: { success: boolean; message?: string }) => {
      loadRef.current(true);
      setToast({ visible: true, message: message ?? (success ? 'Done.' : 'Something went wrong.'), success });
      setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
    });
  }, []);

  // Cash flow — exclude transfers; convert each transaction to HUF using its day's rate
  const nonTransferTxs = useMemo(
    () => periodTxs.filter(tx => !tx.transfer_group_id),
    [periodTxs],
  );
  const income = useMemo(
    () => nonTransferTxs.filter(t => t.type === 'income').reduce((s, t) => {
      const rates = getRatesForDate(t.date, dailyRates);
      return s + toHUF(t.amount, (t.wallet as any)?.currency, rates);
    }, 0),
    [nonTransferTxs, dailyRates],
  );
  const expense = useMemo(
    () => nonTransferTxs.filter(t => t.type === 'expense').reduce((s, t) => {
      const rates = getRatesForDate(t.date, dailyRates);
      return s + toHUF(t.amount, (t.wallet as any)?.currency, rates);
    }, 0),
    [nonTransferTxs, dailyRates],
  );
  const net = income - expense;

  const vsPct = prevNet === null || prevNet === 0
    ? null
    : Math.round(((net - prevNet) / Math.abs(prevNet)) * 100);

  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  // Group transactions by date
  const groups = useMemo(() => groupByDate(periodTxs), [periodTxs]);

  type ListItem =
    | { kind: 'dayHeader'; date: string; dayNet: number }
    | { kind: 'tx'; tx: Transaction };

  const flat = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const g of groups) {
      const rates = getRatesForDate(g.date, dailyRates);
      let dayNet = 0;
      for (const t of g.items) {
        if (t.transfer_group_id) continue;
        const cur = (t.wallet as any)?.currency;
        const huf = toHUF(t.amount, cur, rates);
        dayNet += t.type === 'income' ? huf : -huf;
      }
      items.push({ kind: 'dayHeader', date: g.date, dayNet });
      for (const tx of g.items) items.push({ kind: 'tx', tx });
    }
    return items;
  }, [groups, dailyRates]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Dashboard" />
      <FlatList
        style={{ paddingTop: 16 }}
        data={flat}
        keyExtractor={(item) =>
          item.kind === 'dayHeader' ? `h-${item.date}` : item.tx.id
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'dayHeader') {
            const positive = item.dayNet >= 0;
            return (
              <View style={styles.dayHeader}>
                <Text style={[styles.dayDate, { color: colors.muted }]}>
                  {formatDayHeader(item.date)}
                </Text>
                <Text style={[styles.dayNet, { color: positive ? colors.income : colors.expense }]}>
                  {positive ? '+' : '−'}{formatCurrency(Math.abs(item.dayNet), 'HUF')}
                </Text>
              </View>
            );
          }
          return (
            <TransactionRow
              transaction={item.tx}
              onPress={() => router.push(`/transaction/${item.tx.id}`)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Cash Flow card */}
            <LinearGradient
              colors={[
                '#4D7BE7',
                '#C064BC',
                '#F78162',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cashFlow}
            >
              {/* Title row + VS badge */}
              <View style={styles.cashFlowHeader}>
                <Text style={[styles.cashFlowTitle, { color: '#fff' }]}>Cash Flow</Text>
                {!loading && vsPct !== null && (
                  <View style={[styles.vsBadge, { backgroundColor: '#ffffff33' }]}>
                    <Text style={[styles.vsText, { color: '#fff' }]}>
                      {vsPct >= 0 ? '↑' : '↓'} {Math.abs(vsPct)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Net */}
              {loading
                ? <SkeletonBox style={{ height: 34, width: 170, borderRadius: 6, backgroundColor: '#ffffff40' }} />
                : <Text style={[styles.cashFlowNet, { color: net >= 0 ? '#fff' : '#ffcaca' }]}>
                    {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net), 'HUF')}
                  </Text>
              }

              {/* Income bar */}
              <View style={[styles.barSection, { marginBottom: 12 }]}>
                <View style={styles.barLabelRow}>
                  <Text style={[styles.cashFlowLabel, { color: '#fff' }]}>Income</Text>
                  {loading
                    ? <SkeletonBox style={{ height: 13, width: 90, borderRadius: 4, backgroundColor: '#ffffff40' }} />
                    : <Text style={[styles.cashFlowValue, { color: '#fff' }]}>+{formatCurrency(income, 'HUF')}</Text>
                  }
                </View>
                <View style={[styles.barTrack, { backgroundColor: '#ffffff94' }]}>
                  <View style={[styles.barFill, { width: `${incomePct}%` as any, backgroundColor: '#449f90' }]} />
                </View>
              </View>

              {/* Expense bar */}
              <View style={styles.barSection}>
                <View style={styles.barLabelRow}>
                  <Text style={[styles.cashFlowLabel, { color: '#fff' }]}>Expenses</Text>
                  {loading
                    ? <SkeletonBox style={{ height: 13, width: 90, borderRadius: 4, backgroundColor: '#ffffff40' }} />
                    : <Text style={[styles.cashFlowValue, { color: '#fee5e5' }]}>−{formatCurrency(expense, 'HUF')}</Text>
                  }
                </View>
                <View style={[styles.barTrack, { backgroundColor: '#ffffff94' }]}>
                  <View style={[styles.barFill, { width: `${expensePct}%` as any, backgroundColor: '#f44c4c' }]} />
                </View>
              </View>
            </LinearGradient>

            {/* Period picker */}
            <PeriodPicker value={period} onChange={setPeriod} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {[3, 2, 2].map((count, gi) => (
                <View key={gi}>
                  <View style={[styles.dayHeader, { marginTop: 20, marginBottom: 10 }]}>
                    <SkeletonBox style={{ height: 13, width: 130, borderRadius: 4 }} />
                    <SkeletonBox style={{ height: 13, width: 65, borderRadius: 4 }} />
                  </View>
                  {Array.from({ length: count }).map((_, ri) => (
                    <View key={ri} style={{ marginBottom: 6 }}>
                      <View style={[styles.skeletonRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <SkeletonBox style={{ width: 40, height: 40, borderRadius: 10 }} />
                        <View style={{ flex: 1, gap: 7, paddingTop: 3 }}>
                          <SkeletonBox style={{ height: 13, width: `${50 + (ri * 13) % 25}%`, borderRadius: 4 }} />
                          <SkeletonBox style={{ height: 11, width: `${30 + (ri * 17) % 20}%`, borderRadius: 4 }} />
                        </View>
                        <SkeletonBox style={{ height: 13, width: 68, borderRadius: 4, marginTop: 3 }} />
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.muted }]}>No transactions in this period.</Text>
          )
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        success={toast.success}
        bottomOffset={TAB_BAR_HEIGHT + bottom + 12}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  header: { gap: 12, marginBottom: 8 },

  cashFlow: {
    borderRadius: 10,
    borderWidth: 0,
    padding: 20,
    gap: 10,
    marginBottom: 8,
    marginTop: 6,
  },
  cashFlowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cashFlowTitle: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  cashFlowNet: { fontSize: 30, fontFamily: 'Figtree_700Bold' },
  cashFlowLabel: { fontSize: 12 },
  cashFlowValue: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  vsBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  vsText: { fontSize: 12, fontFamily: 'Figtree_600SemiBold', paddingVertical: 1 },
  barSection: { gap: 4 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

  sectionTitle: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  dayDate: { fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  dayNet: { fontSize: 13, fontFamily: 'Figtree_700Bold' },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
});
