import React, { useEffect, useState, useCallback } from 'react';
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
import { formatCurrency } from '@/lib/utils';

export default function DashboardScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

    const [{ data: w }, { data: allTxSums }, { data: monthly }, { data: recent }] = await Promise.all([
      supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false }),
      // All transactions for computing current wallet balances (no row limit)
      supabase
        .from('transactions')
        .select('wallet_id, type, amount')
        .eq('user_id', user.id)
        .limit(10000),
      // This month — exclude transfers so they don't inflate income/expense
      supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lt('date', monthEnd)
        .is('transfer_group_id', null),
      // Recent 10 for the list — with joins for display
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(10),
    ]);

    // Compute current balance per wallet: starting_balance + income - expenses
    const walletList = w ?? [];
    const txSums = allTxSums ?? [];
    const walletBalanceMap = new Map<string, number>();
    for (const wallet of walletList) {
      const wTxs = txSums.filter((t: any) => t.wallet_id === wallet.id);
      const inc = wTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const exp = wTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      walletBalanceMap.set(wallet.id, (wallet.starting_balance ?? 0) + inc - exp);
    }

    setWallets(walletList.map(w => ({ ...w, _balance: walletBalanceMap.get(w.id) ?? w.starting_balance ?? 0 })));

    const mo = monthly ?? [];
    setMonthlyIncome(mo.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0));
    setMonthlyExpense(mo.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0));

    const normalized = (recent ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    }));
    setRecentTx(normalized);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const defaultWallet = wallets.find((w) => w.is_default) ?? wallets[0];
  const currency = defaultWallet?.currency ?? 'HUF';
  // Sum wallet balances; only meaningful if all wallets share the same currency
  const allSameCurrency = wallets.every(w => w.currency === currency);
  const totalBalance = allSameCurrency
    ? wallets.reduce((s, w) => s + ((w as any)._balance ?? 0), 0)
    : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={recentTx}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>

            {/* Summary cards */}
            <View style={styles.cards}>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Total balance</Text>
                <Text style={[styles.cardValue, { color: colors.text }]}>
                  {totalBalance !== null ? formatCurrency(totalBalance, currency) : 'Multiple currencies'}
                </Text>
              </View>
              <View style={[styles.cardRow]}>
                <View style={[styles.cardHalf, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.muted }]}>Income</Text>
                  <Text style={[styles.cardValue, { color: colors.income, fontSize: 18 }]}>
                    +{formatCurrency(monthlyIncome, currency)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.muted }]}>this month</Text>
                </View>
                <View style={[styles.cardHalf, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.muted }]}>Expenses</Text>
                  <Text style={[styles.cardValue, { color: colors.expense, fontSize: 18 }]}>
                    -{formatCurrency(monthlyExpense, currency)}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.muted }]}>this month</Text>
                </View>
              </View>
            </View>

            {/* Wallets row */}
            {wallets.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>Wallets</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletRow}>
                  {wallets.map((w) => (
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
                </ScrollView>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.muted, marginTop: 4 }]}>
              Recent transactions
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No transactions yet.</Text>
        }
      />

      {/* FAB */}
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
  list: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800' },
  cards: { gap: 8 },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardHalf: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
  },
  cardLabel: { fontSize: 13 },
  cardSub: { fontSize: 11 },
  cardValue: { fontSize: 22, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  walletRow: { gap: 8, paddingBottom: 4 },
  walletChip: {
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
