import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: t }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(20),
    ]);

    setWallets(w ?? []);
    const normalized = (t ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    }));
    setTransactions(normalized);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthlyIncome = transactions
    .filter((t) => t.type === 'income' && t.date >= monthStart)
    .reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = transactions
    .filter((t) => t.type === 'expense' && t.date >= monthStart)
    .reduce((s, t) => s + t.amount, 0);

  const defaultWallet = wallets.find((w) => w.is_default) ?? wallets[0];
  const totalBalance = wallets.reduce((s, w) => s + w.starting_balance, 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={transactions.slice(0, 10)}
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
                  {formatCurrency(totalBalance, defaultWallet?.currency ?? 'HUF')}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Income (this month)</Text>
                <Text style={[styles.cardValue, { color: colors.income }]}>
                  +{formatCurrency(monthlyIncome, defaultWallet?.currency ?? 'HUF')}
                </Text>
              </View>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Expenses (this month)</Text>
                <Text style={[styles.cardValue, { color: colors.expense }]}>
                  -{formatCurrency(monthlyExpense, defaultWallet?.currency ?? 'HUF')}
                </Text>
              </View>
            </View>

            {/* Wallets row */}
            {wallets.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>Wallets</Text>
                <View style={styles.walletRow}>
                  {wallets.map((w) => (
                    <View
                      key={w.id}
                      style={[styles.walletChip, { backgroundColor: w.color + '22', borderColor: w.color + '55' }]}
                    >
                      <Text style={{ fontSize: 16 }}>{w.icon}</Text>
                      <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.muted, marginTop: 8 }]}>
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
  cardLabel: { fontSize: 13 },
  cardValue: { fontSize: 22, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  walletRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  walletName: { fontSize: 13, fontWeight: '600' },
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
