import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import TransactionRow from '@/components/TransactionRow';
import type { Transaction, Wallet } from '@/lib/types';
import { formatCurrency, formatDate, groupByDate } from '@/lib/utils';

export default function DashboardScreen() {
  const colors = useTheme();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [periodTxs, setPeriodTxs] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Period bounds
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const nextM = new Date(year, month + 1, 1);
  const monthEnd = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`;

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: allTxSums }, { data: txs }] = await Promise.all([
      supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false }),
      // All transactions ever — for wallet balance calculation
      supabase
        .from('transactions')
        .select('wallet_id, type, amount')
        .eq('user_id', user.id)
        .limit(10000),
      // All transactions in selected month — for cashflow + list
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lt('date', monthEnd)
        .order('date', { ascending: false })
        .limit(10000),
    ]);

    // Wallet current balance: starting_balance + income - expenses (all time)
    const walletList = w ?? [];
    const txSums = allTxSums ?? [];
    const walletBalanceMap = new Map<string, number>();
    for (const wallet of walletList) {
      const wTxs = txSums.filter((t: any) => t.wallet_id === wallet.id);
      const inc = wTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const exp = wTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      walletBalanceMap.set(wallet.id, (wallet.starting_balance ?? 0) + inc - exp);
    }
    setWallets(walletList.map(wl => ({ ...wl, _balance: walletBalanceMap.get(wl.id) ?? wl.starting_balance ?? 0 })));

    const normalized = (txs ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    }));
    setPeriodTxs(normalized);
  }, [monthStart, monthEnd]);

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

  const defaultWallet = wallets.find(w => w.is_default) ?? wallets[0];
  const currency = defaultWallet?.currency ?? 'HUF';
  const allSameCurrency = wallets.every(w => w.currency === currency);
  const totalBalance = allSameCurrency
    ? wallets.reduce((s, w) => s + ((w as any)._balance ?? 0), 0)
    : null;

  // Group transactions by date for the list
  const groups = useMemo(() => groupByDate(periodTxs), [periodTxs]);

  type ListItem =
    | { kind: 'wallets' }
    | { kind: 'dayHeader'; date: string; dayNet: number }
    | { kind: 'tx'; tx: Transaction };

  const flat = useMemo(() => {
    const items: ListItem[] = [{ kind: 'wallets' }];
    for (const g of groups) {
      const dayIncome = g.items.filter(t => t.type === 'income' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
      const dayExpense = g.items.filter(t => t.type === 'expense' && !t.transfer_group_id).reduce((s, t) => s + t.amount, 0);
      items.push({ kind: 'dayHeader', date: g.date, dayNet: dayIncome - dayExpense });
      for (const tx of g.items) items.push({ kind: 'tx', tx });
    }
    return items;
  }, [groups]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={flat}
        keyExtractor={(item, i) => {
          if (item.kind === 'wallets') return 'wallets';
          if (item.kind === 'dayHeader') return `h-${item.date}`;
          return item.tx.id;
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'wallets') {
            return (
              <View style={styles.walletsBlock}>
                {wallets.map(w => (
                  <View
                    key={w.id}
                    style={[styles.walletChip, { backgroundColor: (w.color || '#888') + '22', borderColor: (w.color || '#888') + '55' }]}
                  >
                    {w.icon ? <Text style={{ fontSize: 16 }}>{w.icon}</Text> : null}
                    <View>
                      <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                      <Text style={[styles.walletBalance, { color: colors.muted }]}>
                        {formatCurrency((w as any)._balance ?? w.starting_balance ?? 0, w.currency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          }
          if (item.kind === 'dayHeader') {
            const netPositive = item.dayNet >= 0;
            return (
              <View style={styles.dayHeader}>
                <Text style={[styles.dayDate, { color: colors.muted }]}>{formatDate(item.date)}</Text>
                <Text style={[styles.dayNet, { color: netPositive ? colors.income : colors.expense }]}>
                  {netPositive ? '+' : '−'}{formatCurrency(Math.abs(item.dayNet), currency)}
                </Text>
              </View>
            );
          }
          return <TransactionRow transaction={item.tx} />;
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>

            {/* Month selector */}
            <View style={[styles.monthRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.monthArrow, { color: colors.text }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} disabled={isCurrentMonth}>
                <Text style={[styles.monthArrow, { color: isCurrentMonth ? colors.border : colors.text }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Cash Flow card */}
            <View style={[styles.cashFlow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cashFlowTitle, { color: colors.muted }]}>Cash Flow</Text>
              <Text style={[styles.cashFlowNet, { color: net >= 0 ? colors.income : colors.expense }]}>
                {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net), currency)}
              </Text>
              <View style={styles.cashFlowRow}>
                <View style={styles.cashFlowItem}>
                  <Text style={[styles.cashFlowItemLabel, { color: colors.muted }]}>Income</Text>
                  <Text style={[styles.cashFlowItemValue, { color: colors.income }]}>
                    +{formatCurrency(income, currency)}
                  </Text>
                </View>
                <View style={[styles.cashFlowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.cashFlowItem}>
                  <Text style={[styles.cashFlowItemLabel, { color: colors.muted }]}>Expenses</Text>
                  <Text style={[styles.cashFlowItemValue, { color: colors.expense }]}>
                    −{formatCurrency(expense, currency)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Wallet chips */}
            {wallets.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletRow}>
                {wallets.map(w => (
                  <View
                    key={w.id}
                    style={[styles.walletChipH, { backgroundColor: (w.color || '#888') + '22', borderColor: (w.color || '#888') + '55' }]}
                  >
                    {w.icon ? <Text style={{ fontSize: 15 }}>{w.icon}</Text> : null}
                    <View>
                      <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                      <Text style={[styles.walletBalance, { color: colors.muted }]}>
                        {formatCurrency((w as any)._balance ?? w.starting_balance ?? 0, w.currency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {periodTxs.length > 0 && (
              <Text style={[styles.sectionTitle, { color: colors.muted }]}>Transactions</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No transactions this month.</Text>
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={() => router.push('/transaction/add')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 80 },
  header: { gap: 12, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '800' },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  monthBtn: { padding: 4 },
  monthArrow: { fontSize: 22, fontWeight: '300', lineHeight: 26 },
  monthLabel: { fontSize: 15, fontWeight: '600' },

  cashFlow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cashFlowTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cashFlowNet: { fontSize: 30, fontWeight: '800' },
  cashFlowRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cashFlowItem: { flex: 1, gap: 2 },
  cashFlowItemLabel: { fontSize: 12 },
  cashFlowItemValue: { fontSize: 16, fontWeight: '700' },
  cashFlowDivider: { width: 1, height: 32 },

  walletRow: { gap: 8, paddingBottom: 4 },
  walletsBlock: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  walletChipH: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  walletName: { fontSize: 13, fontWeight: '600' },
  walletBalance: { fontSize: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  dayDate: { fontSize: 13, fontWeight: '600' },
  dayNet: { fontSize: 13, fontWeight: '700' },

  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  fabIcon: { color: '#fff', fontSize: 28, lineHeight: 32 },
});
