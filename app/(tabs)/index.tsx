import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/TransactionRow';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import type { Transaction, Currency } from '@/lib/types';
import { formatCurrency, formatDayHeader, groupByDate } from '@/lib/utils';
import { useCountUp } from '@/lib/useCountUp';
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
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
        .is('transfer_group_id', null)
        .limit(10000),
    ]);

    const defaultW = (w ?? []).find((wl: any) => wl.is_default) ?? (w ?? [])[0];
    if (defaultW?.currency) setCurrency(defaultW.currency as Currency);

    const normalized = (txs ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    }));
    setPeriodTxs(normalized);

    const pList = prevTxs ?? [];
    const pInc = pList.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
    const pExp = pList.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
    setPrevNet(pInc - pExp);
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Cash flow — exclude transfers
  const nonTransferTxs = useMemo(
    () => periodTxs.filter(tx => !tx.transfer_group_id),
    [periodTxs],
  );
  const income = useMemo(
    () => nonTransferTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [nonTransferTxs],
  );
  const expense = useMemo(
    () => nonTransferTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [nonTransferTxs],
  );
  const net = income - expense;
  const animatedNet = useCountUp(net);
  const animatedIncome = useCountUp(income);
  const animatedExpense = useCountUp(expense);

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
      const dayIncome = g.items.filter(t => t.type === 'income' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
      const dayExpense = g.items.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
      items.push({ kind: 'dayHeader', date: g.date, dayNet: dayIncome - dayExpense });
      for (const tx of g.items) items.push({ kind: 'tx', tx });
    }
    return items;
  }, [groups]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Dashboard" />
      <FlatList
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
                  {positive ? '+' : '−'}{formatCurrency(Math.abs(item.dayNet), currency)}
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
            {/* Period picker */}
            <PeriodPicker value={period} onChange={setPeriod} />

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
                {vsPct !== null && (
                  <View style={[
                    styles.vsBadge,
                    { backgroundColor: '#ffffff33' },
                  ]}>
                    <Text style={[
                      styles.vsText,
                      { color: '#fff' },
                    ]}>
                      {vsPct >= 0 ? '↑' : '↓'} {Math.abs(vsPct)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Animated net */}
              <Text style={[styles.cashFlowNet, { color: animatedNet >= 0 ? '#fff' : '#ffcaca' }]}>
                {animatedNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(animatedNet), currency)}
              </Text>

              {/* Income bar */}
              <View style={styles.barSection}>
                <View style={styles.barLabelRow}>
                  <Text style={[styles.cashFlowLabel, { color: '#fff' }]}>Income</Text>
                  <Text style={[styles.cashFlowValue, { color: '#fff' }]}>
                    +{formatCurrency(animatedIncome, currency)}
                  </Text>
                </View>
                <View style={[styles.barTrack, { backgroundColor: '#ffffff94' }]}>
                  <View style={[styles.barFill, { width: `${incomePct}%` as any, backgroundColor: '#449f90' }]} />
                </View>
              </View>

              {/* Expense bar */}
              <View style={styles.barSection}>
                <View style={styles.barLabelRow}>
                  <Text style={[styles.cashFlowLabel, { color: '#fff' }]}>Expenses</Text>
                  <Text style={[styles.cashFlowValue, { color: '#fee5e5' }]}>
                    −{formatCurrency(animatedExpense, currency)}
                  </Text>
                </View>
                <View style={[styles.barTrack, { backgroundColor: '#ffffff94' }]}>
                  <View style={[styles.barFill, { width: `${expensePct}%` as any, backgroundColor: '#f44c4c' }]} />
                </View>
              </View>
            </LinearGradient>

            {flat.length > 0 && (
              <Text style={[styles.sectionTitle, { color: colors.muted }]}>Transactions</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No transactions in this period.</Text>
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
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
  cashFlowTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cashFlowNet: { fontSize: 30, fontWeight: '800' },
  cashFlowLabel: { fontSize: 12 },
  cashFlowValue: { fontSize: 14, fontWeight: '700' },
  vsBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  vsText: { fontSize: 12, fontWeight: '600' },
  barSection: { gap: 4 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  dayDate: { fontSize: 13, fontWeight: '600' },
  dayNet: { fontSize: 13, fontWeight: '700' },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
