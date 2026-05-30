import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/TransactionRow';
import type { Transaction, Wallet, TransactionType } from '@/lib/types';
import { groupByDate, formatDate } from '@/lib/utils';

type TypeFilter = 'all' | TransactionType;

export default function TransactionsScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [walletFilter, setWalletFilter] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: t }] = await Promise.all([
      supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(500),
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

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (walletFilter && tx.wallet_id !== walletFilter) return false;
    return true;
  });

  const groups = groupByDate(filtered);

  type ListItem =
    | { kind: 'header'; date: string }
    | { kind: 'tx'; tx: Transaction };

  const flat: ListItem[] = [];
  for (const g of groups) {
    flat.push({ kind: 'header', date: g.date });
    for (const tx of g.items) flat.push({ kind: 'tx', tx });
  }

  const typeFilters: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'expense', label: 'Expenses' },
    { key: 'income', label: 'Income' },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={flat}
        keyExtractor={(item) => item.kind === 'header' ? `h-${item.date}` : item.tx.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <Text style={[styles.dateHeader, { color: colors.muted }]}>
                {formatDate(item.date)}
              </Text>
            );
          }
          return <TransactionRow transaction={item.tx} />;
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerEscape}>
              <AppHeader />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Transactions</Text>

            {/* Type filter */}
            <View style={[styles.filterRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {typeFilters.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterBtn,
                    typeFilter === f.key && {
                      backgroundColor: f.key === 'income' ? colors.income : f.key === 'expense' ? colors.expense : colors.accent,
                    },
                  ]}
                  onPress={() => setTypeFilter(f.key)}
                >
                  <Text style={[
                    styles.filterBtnText,
                    { color: typeFilter === f.key ? '#fff' : colors.muted },
                  ]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Wallet filter */}
            {wallets.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletChips}>
                <TouchableOpacity
                  style={[
                    styles.walletChip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    !walletFilter && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                  ]}
                  onPress={() => setWalletFilter('')}
                >
                  <Text style={[styles.walletChipText, { color: !walletFilter ? colors.accent : colors.text }]}>
                    All wallets
                  </Text>
                </TouchableOpacity>
                {wallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.walletChip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      walletFilter === w.id && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                    ]}
                    onPress={() => setWalletFilter(walletFilter === w.id ? '' : w.id)}
                  >
                    {w.icon ? <Text style={{ fontSize: 14 }}>{w.icon} </Text> : null}
                    <Text style={[styles.walletChipText, { color: walletFilter === w.id ? colors.accent : colors.text }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No transactions found.</Text>
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16 },
  headerBlock: { gap: 10, marginBottom: 12 },
  headerEscape: { marginHorizontal: -16 },
  title: { fontSize: 26, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 4,
    gap: 4,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterBtnText: { fontSize: 14, fontWeight: '600' },
  walletChips: { gap: 8, paddingBottom: 2 },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  walletChipText: { fontSize: 13, fontWeight: '500' },
  dateHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
