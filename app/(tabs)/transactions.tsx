import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/TransactionRow';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import BottomModal from '@/components/BottomModal';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction, Wallet, Category, Label, TransactionType } from '@/lib/types';
import { groupByDate, formatDate } from '@/lib/utils';
import { useRouter } from 'expo-router';

type TypeFilter = 'all' | TransactionType;
type ModalKind = 'type' | 'wallet' | 'label' | null;

function defaultPeriod(): PeriodValue {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    label: 'This month',
    tab: 'months',
  };
}

// ── Reusable dropdown button ──────────────────────────────────────────────────
function DropBtn({
  label, active, onPress, onClear, colors,
}: {
  label: string; active: boolean;
  onPress: () => void; onClear: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.dropBtn,
        { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surface },
      ]}
    >
      <Text numberOfLines={1} style={[styles.dropBtnText, { color: active ? colors.text : colors.muted }]}>
        {label}
      </Text>
      {active ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={16} color={colors.muted} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

// ── Modal row ─────────────────────────────────────────────────────────────────
function ModalRow({
  label, selected, onPress, colors, icon,
}: {
  label: string; selected: boolean; onPress: () => void; colors: any; icon?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.modalRow, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.accent + '11' }]}
      onPress={onPress}
    >
      {icon ?? null}
      <Text style={[styles.modalRowText, { color: selected ? colors.accent : colors.text }]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TransactionsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [walletFilter, setWalletFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [labelFilter, setLabelFilter] = useState<string>('');
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);

  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: t }, { data: c }, { data: l }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(500),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);

    setWallets(w ?? []);
    setCategories(c ?? []);
    setLabels(l ?? []);
    setTransactions((t ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setWalletFilter('');
    setCategoryFilter('');
    setLabelFilter('');
    setPeriod(defaultPeriod());
  }

  const hasActiveFilters = !!(search || typeFilter !== 'all' || walletFilter || categoryFilter || labelFilter);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (walletFilter && tx.wallet_id !== walletFilter) return false;
      if (categoryFilter && tx.category_id !== categoryFilter) return false;
      if (labelFilter && !tx.labels?.some((l: Label) => l.id === labelFilter)) return false;
      if (period?.from && tx.date < period.from) return false;
      if (period?.to && tx.date > period.to) return false;
      if (q) {
        const inNotes = tx.notes?.toLowerCase().includes(q) ?? false;
        const inPayer = tx.payer?.toLowerCase().includes(q) ?? false;
        if (!inNotes && !inPayer) return false;
      }
      return true;
    });
  }, [transactions, search, typeFilter, walletFilter, categoryFilter, labelFilter, period]);

  const groups = groupByDate(filtered);

  type ListItem = { kind: 'header'; date: string } | { kind: 'tx'; tx: Transaction };
  const flat: ListItem[] = [];
  for (const g of groups) {
    flat.push({ kind: 'header', date: g.date });
    for (const tx of g.items) flat.push({ kind: 'tx', tx });
  }

  const selectedCategory = categories.find((c) => c.id === categoryFilter);
  const selectedWallet = wallets.find((w) => w.id === walletFilter);
  const selectedLabel = labels.find((l) => l.id === labelFilter);

  const typeLabel = typeFilter === 'all' ? 'All types' : typeFilter === 'expense' ? 'Expenses' : 'Income';

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={flat}
        keyExtractor={(item) => item.kind === 'header' ? `h-${item.date}` : item.tx.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={[styles.dateHeader, { color: colors.muted }]}>{formatDate(item.date)}</Text>;
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
            <View style={styles.headerEscape}><AppHeader /></View>

            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>Transactions</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={resetFilters} style={[styles.resetBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.muted} />
                  <Text style={[styles.resetBtnText, { color: colors.muted }]}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search */}
            <View style={[styles.searchBox, { borderColor: search ? colors.accent : colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="search-outline" size={16} color={colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search notes & payer…"
                placeholderTextColor={colors.muted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 2×2 filter grid */}
            <View style={styles.filterGrid}>
              <DropBtn
                label={typeLabel}
                active={typeFilter !== 'all'}
                onPress={() => setOpenModal('type')}
                onClear={() => setTypeFilter('all')}
                colors={colors}
              />
              <DropBtn
                label={selectedWallet ? `${selectedWallet.icon ? selectedWallet.icon + ' ' : ''}${selectedWallet.name}` : 'All wallets'}
                active={!!walletFilter}
                onPress={() => setOpenModal('wallet')}
                onClear={() => setWalletFilter('')}
                colors={colors}
              />
              <DropBtn
                label={selectedCategory ? `${selectedCategory.icon ? selectedCategory.icon + ' ' : ''}${selectedCategory.name}` : 'All categories'}
                active={!!categoryFilter}
                onPress={() => setShowCategoryPicker(true)}
                onClear={() => setCategoryFilter('')}
                colors={colors}
              />
              <DropBtn
                label={selectedLabel?.name ?? 'All labels'}
                active={!!labelFilter}
                onPress={() => setOpenModal('label')}
                onClear={() => setLabelFilter('')}
                colors={colors}
              />
            </View>

            {/* Date range */}
            <PeriodPicker value={period} onChange={setPeriod} />
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No transactions found.</Text>
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
      />

      {/* Type modal */}
      <BottomModal visible={openModal === 'type'} onClose={() => setOpenModal(null)} title="Transaction type">
        {([
          { key: 'all', label: 'All types' },
          { key: 'expense', label: 'Expenses' },
          { key: 'income', label: 'Income' },
        ] as { key: TypeFilter; label: string }[]).map((opt) => (
          <ModalRow
            key={opt.key}
            label={opt.label}
            selected={typeFilter === opt.key}
            onPress={() => { setTypeFilter(opt.key); setOpenModal(null); }}
            colors={colors}
          />
        ))}
      </BottomModal>

      {/* Wallet modal */}
      <BottomModal visible={openModal === 'wallet'} onClose={() => setOpenModal(null)} title="Wallet">
        <ModalRow label="All wallets" selected={!walletFilter} onPress={() => { setWalletFilter(''); setOpenModal(null); }} colors={colors} />
        {wallets.map((w) => (
          <ModalRow
            key={w.id}
            label={`${w.icon ? w.icon + ' ' : ''}${w.name}`}
            selected={walletFilter === w.id}
            onPress={() => { setWalletFilter(w.id); setOpenModal(null); }}
            colors={colors}
          />
        ))}
      </BottomModal>

      {/* Label modal */}
      <BottomModal visible={openModal === 'label'} onClose={() => setOpenModal(null)} title="Label">
        <ModalRow label="All labels" selected={!labelFilter} onPress={() => { setLabelFilter(''); setOpenModal(null); }} colors={colors} />
        {labels.map((lb) => (
          <ModalRow
            key={lb.id}
            label={lb.name}
            selected={labelFilter === lb.id}
            onPress={() => { setLabelFilter(lb.id); setOpenModal(null); }}
            colors={colors}
            icon={lb.color ? <View style={[styles.labelDot, { backgroundColor: lb.color }]} /> : undefined}
          />
        ))}
      </BottomModal>

      {/* Category modal */}
      <CategoryPickerModal
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        categories={categories}
        selectedId={categoryFilter}
        onSelect={(id) => { setCategoryFilter(id); setShowCategoryPicker(false); }}
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

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    width: '48%',
  },
  dropBtnText: { flex: 1, fontSize: 13 },


  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  modalRowText: { flex: 1, fontSize: 15 },
  labelDot: { width: 10, height: 10, borderRadius: 5 },

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
