import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import CategoryPickerModal from '@/components/CategoryPickerModal';
import DatePickerModal from '@/components/DatePickerModal';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction, Wallet, Category, Label, TransactionType } from '@/lib/types';
import { groupByDate, formatDate } from '@/lib/utils';
import { useRouter } from 'expo-router';

type TypeFilter = 'all' | TransactionType;

export default function TransactionsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [walletFilter, setWalletFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [labelFilter, setLabelFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: t }, { data: c }, { data: l }] = await Promise.all([
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
      supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('labels')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
    ]);

    setWallets(w ?? []);
    setCategories(c ?? []);
    setLabels(l ?? []);
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

  function resetFilters() {
    setTypeFilter('all');
    setWalletFilter('');
    setCategoryFilter('');
    setLabelFilter('');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters = typeFilter !== 'all' || walletFilter || categoryFilter || labelFilter || dateFrom || dateTo;

  const filtered = useMemo(() => transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (walletFilter && tx.wallet_id !== walletFilter) return false;
    if (categoryFilter && tx.category_id !== categoryFilter) return false;
    if (labelFilter && !tx.labels?.some((l: Label) => l.id === labelFilter)) return false;
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;
    return true;
  }), [transactions, typeFilter, walletFilter, categoryFilter, labelFilter, dateFrom, dateTo]);

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

  const selectedCategory = categories.find((c) => c.id === categoryFilter);

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
          return (
            <TransactionRow
              transaction={item.tx}
              onPress={() => router.push(`/transaction/${item.tx.id}`)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerEscape}>
              <AppHeader />
            </View>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>Transactions</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={resetFilters} style={[styles.resetBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.muted} />
                  <Text style={[styles.resetBtnText, { color: colors.muted }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

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

            {/* Date range */}
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: dateFrom ? colors.accent : colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowFromPicker(true)}
              >
                <Ionicons name="calendar-outline" size={14} color={dateFrom ? colors.accent : colors.muted} />
                <Text style={[styles.dateBtnText, { color: dateFrom ? colors.text : colors.muted }]}>
                  {dateFrom ? formatDate(dateFrom) : 'From date'}
                </Text>
                {dateFrom ? (
                  <TouchableOpacity onPress={() => setDateFrom('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={14} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
              <Text style={[styles.dateSep, { color: colors.muted }]}>–</Text>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: dateTo ? colors.accent : colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowToPicker(true)}
              >
                <Ionicons name="calendar-outline" size={14} color={dateTo ? colors.accent : colors.muted} />
                <Text style={[styles.dateBtnText, { color: dateTo ? colors.text : colors.muted }]}>
                  {dateTo ? formatDate(dateTo) : 'To date'}
                </Text>
                {dateTo ? (
                  <TouchableOpacity onPress={() => setDateTo('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={14} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            </View>

            {/* Category filter */}
            {categories.length > 0 && (
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: categoryFilter ? colors.accent : colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text style={[styles.pickerBtnText, { color: categoryFilter ? colors.text : colors.muted }]}>
                  {selectedCategory
                    ? `${selectedCategory.icon ? selectedCategory.icon + ' ' : ''}${selectedCategory.name}`
                    : 'All categories'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.muted} />
              </TouchableOpacity>
            )}

            {/* Label filter */}
            {labels.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, !labelFilter && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                  onPress={() => setLabelFilter('')}
                >
                  <Text style={[styles.chipText, { color: !labelFilter ? colors.accent : colors.text }]}>All labels</Text>
                </TouchableOpacity>
                {labels.map((lb) => (
                  <TouchableOpacity
                    key={lb.id}
                    style={[
                      styles.chip,
                      { borderColor: lb.color ? lb.color + '88' : colors.border, backgroundColor: lb.color ? lb.color + '22' : colors.surface },
                      labelFilter === lb.id && { borderColor: lb.color || colors.accent, backgroundColor: (lb.color || colors.accent) + '44' },
                    ]}
                    onPress={() => setLabelFilter(labelFilter === lb.id ? '' : lb.id)}
                  >
                    <Text style={[styles.chipText, { color: labelFilter === lb.id ? (lb.color || colors.accent) : colors.text }]}>
                      {lb.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Wallet filter */}
            {wallets.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }, !walletFilter && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}
                  onPress={() => setWalletFilter('')}
                >
                  <Text style={[styles.chipText, { color: !walletFilter ? colors.accent : colors.text }]}>
                    All wallets
                  </Text>
                </TouchableOpacity>
                {wallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      walletFilter === w.id && { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
                    ]}
                    onPress={() => setWalletFilter(walletFilter === w.id ? '' : w.id)}
                  >
                    {w.icon ? <Text style={{ fontSize: 14 }}>{w.icon} </Text> : null}
                    <Text style={[styles.chipText, { color: walletFilter === w.id ? colors.accent : colors.text }]}>
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

      <CategoryPickerModal
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        categories={categories}
        selectedId={categoryFilter}
        onSelect={(id) => { setCategoryFilter(id); setShowCategoryPicker(false); }}
      />

      <DatePickerModal
        visible={showFromPicker}
        value={dateFrom}
        onConfirm={(d) => { setDateFrom(d); setShowFromPicker(false); }}
        onClose={() => setShowFromPicker(false)}
      />

      <DatePickerModal
        visible={showToPicker}
        value={dateTo}
        onConfirm={(d) => { setDateTo(d); setShowToPicker(false); }}
        onClose={() => setShowToPicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16 },
  headerBlock: { gap: 10, marginBottom: 12 },
  headerEscape: { marginHorizontal: -16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  resetBtnText: { fontSize: 13, fontWeight: '500' },

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

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dateBtnText: { flex: 1, fontSize: 13 },
  dateSep: { fontSize: 16, fontWeight: '300' },

  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickerBtnText: { flex: 1, fontSize: 14 },

  chipRow: { gap: 8, paddingBottom: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },

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
