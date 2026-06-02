import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/TransactionsTransactionRow';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction, Wallet, Category, Label, TransactionType } from '@/lib/types';
import { groupByDate, formatDayHeader, formatCurrency } from '@/lib/utils';
import { getExchangeRatesForPeriod, getExchangeRates, getRatesForDate, toHUF, type DailyRates } from '@/lib/exchange';
import SkeletonBox from '@/components/SkeletonBox';
import Toast from '@/components/Toast';
import { Events } from '@/lib/events';
import { useRouter } from 'expo-router';

const PANEL_WIDTH = Math.min(Dimensions.get('window').width * 0.85, Dimensions.get('window').width - 40);

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

type PanelView = 'main' | 'type' | 'account' | 'category' | 'label';

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
  const [typeFilters, setTypeFilters] = useState<(TransactionType | 'transfer')[]>([]);
  const [walletFilters, setWalletFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [labelFilters, setLabelFilters] = useState<string[]>([]);
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);

  // Draft filters (edited inside the panel before applying)
  const [draftTypes, setDraftTypes] = useState<(TransactionType | 'transfer')[]>([]);
  const [draftWallets, setDraftWallets] = useState<string[]>([]);
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);

  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('main');
  const panelAnim = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<'transactions' | 'wallets'>('transactions');
  const [walletBalances, setWalletBalances] = useState<Map<string, number>>(new Map());
  const [dailyRates, setDailyRates] = useState<DailyRates>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', success: true });

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setTransactions([]);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: w }, { data: t }, { data: c }, { data: l }, { data: allTxSums }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, wallet:wallets(*), category:categories(*), labels:transaction_labels(label:labels(*))')
        .eq('user_id', user.id)
        .gte('date', period.from)
        .lte('date', period.to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10000),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('transactions').select('wallet_id, type, amount').eq('user_id', user.id).limit(10000),
    ]);

    const walletList = w ?? [];
    setWallets(walletList);
    setCategories(c ?? []);
    setLabels(l ?? []);

    const balMap = new Map<string, number>();
    for (const wl of walletList) {
      const wTxs = (allTxSums ?? []).filter((tx: any) => tx.wallet_id === wl.id);
      const inc = wTxs.filter((tx: any) => tx.type === 'income').reduce((s: number, tx: any) => s + tx.amount, 0);
      const exp = wTxs.filter((tx: any) => tx.type === 'expense').reduce((s: number, tx: any) => s + tx.amount, 0);
      balMap.set(wl.id, (wl.starting_balance ?? 0) + inc - exp);
    }
    setWalletBalances(balMap);
    setTransactions((t ?? []).map((tx: any) => ({
      ...tx,
      labels: (tx.labels ?? []).map((l: any) => l.label).filter(Boolean),
    })));

    let periodRates = await getExchangeRatesForPeriod(period.from, period.to);
    if (Object.keys(periodRates).length === 0) {
      const current = await getExchangeRates();
      if (Object.keys(current).length > 0) periodRates = { [period.from]: current };
    }
    setDailyRates(periodRates);

    setLoading(false);
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

  useEffect(() => {
    return Events.on('wallet-saved', () => { loadRef.current(true); });
  }, []);

  // Panel open/close — mirrors AppHeader drawer pattern
  function openFilterPanel() {
    setDraftTypes([...typeFilters]);
    setDraftWallets([...walletFilters]);
    setDraftCategories([...categoryFilters]);
    setDraftLabels([...labelFilters]);
    setPanelView('main');
    panelAnim.setValue(PANEL_WIDTH);
    fadeAnim.setValue(0);
    setFilterPanelVisible(true);
  }

  useEffect(() => {
    if (filterPanelVisible) {
      Animated.parallel([
        Animated.timing(panelAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [filterPanelVisible]);

  function closeFilterPanel(apply = false) {
    Animated.parallel([
      Animated.timing(panelAnim, { toValue: PANEL_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => { setFilterPanelVisible(false); });
    if (apply) {
      setTypeFilters(draftTypes);
      setWalletFilters(draftWallets);
      setCategoryFilters(draftCategories);
      setLabelFilters(draftLabels);
    }
  }

  function resetDraft() {
    setDraftTypes([]);
    setDraftWallets([]);
    setDraftCategories([]);
    setDraftLabels([]);
  }

  function resetFilters() {
    setSearch('');
    setTypeFilters([]);
    setWalletFilters([]);
    setCategoryFilters([]);
    setLabelFilters([]);
    setPeriod(defaultPeriod());
  }

  function toggleItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  }

  const hasActiveFilters = !!(
    search ||
    typeFilters.length > 0 ||
    walletFilters.length > 0 ||
    categoryFilters.length > 0 ||
    labelFilters.length > 0
  );

  function matchesTypeFilter(tx: Transaction, types: (TransactionType | 'transfer')[]) {
    if (types.length === 0) return true;
    const isTransfer = !!tx.transfer_group_id;
    if (isTransfer) return types.includes('transfer');
    return types.includes(tx.type as TransactionType);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (!matchesTypeFilter(tx, typeFilters)) return false;
      if (walletFilters.length > 0 && !walletFilters.includes(tx.wallet_id)) return false;
      if (categoryFilters.length > 0 && !categoryFilters.includes(tx.category_id ?? '')) return false;
      if (labelFilters.length > 0 && !tx.labels?.some((l: Label) => labelFilters.includes(l.id))) return false;
      if (q) {
        const inNotes = tx.notes?.toLowerCase().includes(q) ?? false;
        const inPayer = tx.payer?.toLowerCase().includes(q) ?? false;
        if (!inNotes && !inPayer) return false;
      }
      return true;
    });
  }, [transactions, search, typeFilters, walletFilters, categoryFilters, labelFilters]);

  // Draft-filtered count (for filter button)
  const draftFilteredCount = useMemo(() => {
    return transactions.filter((tx) => {
      if (!matchesTypeFilter(tx, draftTypes)) return false;
      if (draftWallets.length > 0 && !draftWallets.includes(tx.wallet_id)) return false;
      if (draftCategories.length > 0 && !draftCategories.includes(tx.category_id ?? '')) return false;
      if (draftLabels.length > 0 && !tx.labels?.some((l: Label) => draftLabels.includes(l.id))) return false;
      return true;
    }).length;
  }, [transactions, draftTypes, draftWallets, draftCategories, draftLabels]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  type ListItem = { kind: 'header'; date: string; dayNet: number } | { kind: 'tx'; tx: Transaction };
  const flat = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    for (const g of groups) {
      const rates = getRatesForDate(g.date, dailyRates);
      let dayNet = 0;
      for (const tx of g.items) {
        if (tx.transfer_group_id) continue;
        const huf = toHUF(tx.amount, (tx.wallet as any)?.currency, rates);
        dayNet += tx.type === 'income' ? huf : -huf;
      }
      items.push({ kind: 'header', date: g.date, dayNet });
      for (const tx of g.items) items.push({ kind: 'tx', tx });
    }
    return items;
  }, [groups, dailyRates]);

  // Filter summary helpers
  function typeSummary() {
    if (draftTypes.length === 0) return 'All';
    return draftTypes.map(t => t === 'expense' ? 'Expenses' : t === 'income' ? 'Income' : 'Transfers').join(', ');
  }
  function accountSummary() {
    if (draftWallets.length === 0) return 'All';
    if (draftWallets.length === 1) {
      const w = wallets.find(x => x.id === draftWallets[0]);
      return w ? `${w.icon ? w.icon + ' ' : ''}${w.name}` : '1 selected';
    }
    return `${draftWallets.length} selected`;
  }
  function categorySummary() {
    if (draftCategories.length === 0) return 'All';
    if (draftCategories.length === 1) {
      const c = categories.find(x => x.id === draftCategories[0]);
      return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : '1 selected';
    }
    return `${draftCategories.length} selected`;
  }
  function labelSummary() {
    if (draftLabels.length === 0) return 'All';
    if (draftLabels.length === 1) {
      const l = labels.find(x => x.id === draftLabels[0]);
      return l ? l.name : '1 selected';
    }
    return `${draftLabels.length} selected`;
  }

  const filterCount = typeFilters.length + walletFilters.length + categoryFilters.length + labelFilters.length;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Overview" />

      {/* Tab switcher */}
      <View style={[styles.tabStrip, { borderBottomColor: colors.border }]}>
        {(['transactions', 'wallets'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, { color: active ? colors.accent : colors.muted }]}>
                {tab === 'transactions' ? 'Transactions' : 'Accounts'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Wallets tab */}
      {activeTab === 'wallets' && (
        <>
          <View style={[styles.walletTabHeader, { borderBottomColor: colors.border, paddingTop: 16}]}>
            <TouchableOpacity
              onPress={() => router.push('/wallet/new')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={[styles.walletsList, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {wallets.map((w) => {
              const balance = walletBalances.get(w.id) ?? 0;
              const balColor = balance >= 0 ? colors.income : colors.expense;
              return (
                <TouchableOpacity
                  key={w.id}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/wallet/${w.id}`)}
                  style={[styles.walletCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.walletIcon}>
                    {w.icon
                      ? <Text style={{ fontSize: 22 }}>{w.icon}</Text>
                      : <View style={[styles.walletIconFallback, { backgroundColor: colors.border }]} />}
                  </View>
                  <View style={styles.walletInfo}>
                    <View style={styles.walletNameRow}>
                      <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                      {w.is_default && (
                        <View style={[styles.defaultBadge, { backgroundColor: colors.accent + '22' }]}>
                          <Text style={[styles.defaultBadgeText, { color: colors.accent }]}>Default</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.walletCurrency, { color: colors.muted }]}>{w.currency}</Text>
                  </View>
                  <Text style={[styles.walletBalance, { color: balColor }]}>
                    {balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(balance), w.currency as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Transactions tab */}
      {activeTab === 'transactions' && <FlatList
        data={flat}
        style={{ paddingTop: 16 }}
        keyExtractor={(item) => item.kind === 'header' ? `h-${item.date}` : item.tx.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            const positive = item.dayNet >= 0;
            return (
              <View style={styles.dayHeader}>
                <Text style={[styles.dateHeader, { color: colors.muted }]}>{formatDayHeader(item.date)}</Text>
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
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Search bar + filter button */}
            <View style={styles.searchRow}>
              <View style={[styles.searchBox, { backgroundColor: colors.surface, flex: 1 }]}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search for notes or payee"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={openFilterPanel}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor: filterCount > 0 ? colors.accent : colors.surface,
                    borderColor: filterCount > 0 ? colors.accent : colors.border,
                  },
                ]}
              >
                <Ionicons name="options-outline" size={22} color={filterCount > 0 ? '#fff' : colors.muted} />
                {filterCount > 0 && (
                  <View style={[styles.filterBadge, { backgroundColor: '#fff' }]}>
                    <Text style={[styles.filterBadgeText, { color: colors.accent }]}>{filterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Period picker */}
            <PeriodPicker value={period} onChange={setPeriod} />

          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.skeletonRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SkeletonBox style={{ width: 40, height: 40, borderRadius: 8 }} />
                  <View style={{ flex: 1, gap: 7, paddingTop: 3 }}>
                    <SkeletonBox style={{ height: 13, width: `${48 + (i * 11) % 28}%`, borderRadius: 4 }} />
                    <SkeletonBox style={{ height: 11, width: `${28 + (i * 17) % 22}%`, borderRadius: 4 }} />
                  </View>
                  <SkeletonBox style={{ height: 13, width: 70, borderRadius: 4, marginTop: 3 }} />
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.muted }]}>No transactions found.</Text>
          )
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
      />}

      {/* Filter panel */}
      <Modal visible={filterPanelVisible} transparent animationType="none" onRequestClose={() => closeFilterPanel(false)}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: fadeAnim }]} pointerEvents="none" />
        <View style={styles.panelOverlayContainer}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeFilterPanel(false)} />
          <Animated.View
            style={[
              styles.filterPanel,
              { backgroundColor: colors.bg, transform: [{ translateX: panelAnim }] },
            ]}
          >
            {/* Panel header */}
            <SafeAreaView edges={['top', 'right']} style={{ flex: 1 }}>
              <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
                {panelView !== 'main' ? (
                  <TouchableOpacity onPress={() => setPanelView('main')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="arrow-back" size={22} color={colors.accent} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => closeFilterPanel(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={22} color={colors.accent} />
                  </TouchableOpacity>
                )}
                <Text style={[styles.panelTitle, { color: colors.text }]}>
                  {panelView === 'main' ? 'Filters' :
                    panelView === 'type' ? 'Type' :
                    panelView === 'account' ? 'Account' :
                    panelView === 'category' ? 'Category' : 'Label'}
                </Text>
                <View style={{ width: 22 }} />
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                {panelView === 'main' && (
                  <>
                    {/* Type row */}
                    <TouchableOpacity
                      style={[styles.panelRow, { borderBottomColor: colors.border }]}
                      onPress={() => setPanelView('type')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.panelRowIcon, { backgroundColor: colors.accent + '18' }]}>
                        <Ionicons name="swap-vertical-outline" size={16} color={colors.accent} />
                      </View>
                      <Text style={[styles.panelRowLabel, { color: colors.text }]}>Type</Text>
                      <Text style={[styles.panelRowValue, { color: colors.muted }]} numberOfLines={1}>{typeSummary()}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>

                    {/* Account row */}
                    <TouchableOpacity
                      style={[styles.panelRow, { borderBottomColor: colors.border }]}
                      onPress={() => setPanelView('account')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.panelRowIcon, { backgroundColor: colors.accent + '18' }]}>
                        <Ionicons name="wallet-outline" size={16} color={colors.accent} />
                      </View>
                      <Text style={[styles.panelRowLabel, { color: colors.text }]}>Account</Text>
                      <Text style={[styles.panelRowValue, { color: colors.muted }]} numberOfLines={1}>{accountSummary()}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>

                    {/* Category row */}
                    <TouchableOpacity
                      style={[styles.panelRow, { borderBottomColor: colors.border }]}
                      onPress={() => setPanelView('category')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.panelRowIcon, { backgroundColor: colors.accent + '18' }]}>
                        <Ionicons name="grid-outline" size={16} color={colors.accent} />
                      </View>
                      <Text style={[styles.panelRowLabel, { color: colors.text }]}>Category</Text>
                      <Text style={[styles.panelRowValue, { color: colors.muted }]} numberOfLines={1}>{categorySummary()}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>

                    {/* Label row */}
                    <TouchableOpacity
                      style={[styles.panelRow, { borderBottomColor: colors.border }]}
                      onPress={() => setPanelView('label')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.panelRowIcon, { backgroundColor: colors.accent + '18' }]}>
                        <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
                      </View>
                      <Text style={[styles.panelRowLabel, { color: colors.text }]}>Label</Text>
                      <Text style={[styles.panelRowValue, { color: colors.muted }]} numberOfLines={1}>{labelSummary()}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  </>
                )}

                {panelView === 'type' && (
                  <View>
                    {([
                      { key: 'expense' as const, label: 'Expenses', icon: 'arrow-up-outline' },
                      { key: 'income' as const, label: 'Income', icon: 'arrow-down-outline' },
                      { key: 'transfer' as const, label: 'Transfers', icon: 'swap-horizontal-outline' },
                    ]).map((opt) => {
                      const sel = draftTypes.includes(opt.key);
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.optionRow, { borderBottomColor: colors.border }, sel && { backgroundColor: colors.accent + '11' }]}
                          onPress={() => setDraftTypes(prev => toggleItem(prev, opt.key))}
                        >
                          <Ionicons name={opt.icon as any} size={18} color={sel ? colors.accent : colors.muted} />
                          <Text style={[styles.optionLabel, { color: sel ? colors.accent : colors.text }]}>{opt.label}</Text>
                          {sel && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {panelView === 'account' && (
                  <View>
                    {wallets.map((w) => {
                      const sel = draftWallets.includes(w.id);
                      return (
                        <TouchableOpacity
                          key={w.id}
                          style={[styles.optionRow, { borderBottomColor: colors.border }, sel && { backgroundColor: colors.accent + '11' }]}
                          onPress={() => setDraftWallets(prev => toggleItem(prev, w.id))}
                        >
                          <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{w.icon ?? '💰'}</Text>
                          <Text style={[styles.optionLabel, { color: sel ? colors.accent : colors.text }]}>{w.name}</Text>
                          {sel && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {panelView === 'category' && (() => {
                  const parents = categories.filter(c => !c.parent_id);
                  const children = categories.filter(c => !!c.parent_id);
                  const getChildren = (parentId: string) => children.filter(c => c.parent_id === parentId);
                  // Flat categories (no children and no parent)
                  const flatCats = parents.filter(p => getChildren(p.id).length === 0);
                  // Group parents (have children)
                  const groupParents = parents.filter(p => getChildren(p.id).length > 0);

                  function toggleParent(parentId: string) {
                    setExpandedCategories(prev => {
                      const next = new Set(prev);
                      if (next.has(parentId)) next.delete(parentId);
                      else next.add(parentId);
                      return next;
                    });
                  }

                  function selectParent(parent: Category) {
                    const kids = getChildren(parent.id);
                    const allIds = [parent.id, ...kids.map(k => k.id)];
                    const allSelected = allIds.every(id => draftCategories.includes(id));
                    if (allSelected) {
                      setDraftCategories(prev => prev.filter(id => !allIds.includes(id)));
                    } else {
                      setDraftCategories(prev => [...new Set([...prev, ...allIds])]);
                    }
                  }

                  return (
                    <View>
                      {[...groupParents, ...flatCats].sort((a, b) => a.name.localeCompare(b.name)).map((cat) => {
                        const kids = getChildren(cat.id);
                        const isGroup = kids.length > 0;
                        const expanded = expandedCategories.has(cat.id);
                        const allSelected = isGroup
                          ? [cat.id, ...kids.map(k => k.id)].every(id => draftCategories.includes(id))
                          : draftCategories.includes(cat.id);
                        const someSelected = isGroup
                          ? [cat.id, ...kids.map(k => k.id)].some(id => draftCategories.includes(id))
                          : false;

                        return (
                          <View key={cat.id}>
                            <TouchableOpacity
                              style={[styles.optionRow, { borderBottomColor: colors.border }, allSelected && { backgroundColor: colors.accent + '11' }]}
                              onPress={() => isGroup ? selectParent(cat) : setDraftCategories(prev => toggleItem(prev, cat.id))}
                            >
                              <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{cat.icon ?? '•'}</Text>
                              <Text style={[styles.optionLabel, { color: allSelected ? colors.accent : someSelected ? colors.accent : colors.text, fontFamily: isGroup ? 'Figtree_600SemiBold' : 'Figtree_500Medium' }]}>{cat.name}</Text>
                              {allSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                              {someSelected && !allSelected && <View style={[styles.partialCheck, { borderColor: colors.accent }]} />}
                              {isGroup && (
                                <TouchableOpacity onPress={() => toggleParent(cat.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                            {isGroup && expanded && kids.sort((a, b) => a.name.localeCompare(b.name)).map((kid) => {
                              const kidSel = draftCategories.includes(kid.id);
                              return (
                                <TouchableOpacity
                                  key={kid.id}
                                  style={[styles.optionRow, styles.optionRowChild, { borderBottomColor: colors.border }, kidSel && { backgroundColor: colors.accent + '11' }]}
                                  onPress={() => setDraftCategories(prev => toggleItem(prev, kid.id))}
                                >
                                  <Text style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{kid.icon ?? '•'}</Text>
                                  <Text style={[styles.optionLabel, { color: kidSel ? colors.accent : colors.text }]}>{kid.name}</Text>
                                  {kidSel && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {panelView === 'label' && (
                  <View>
                    {labels.map((lb) => {
                      const sel = draftLabels.includes(lb.id);
                      return (
                        <TouchableOpacity
                          key={lb.id}
                          style={[styles.optionRow, { borderBottomColor: colors.border }, sel && { backgroundColor: colors.accent + '11' }]}
                          onPress={() => setDraftLabels(prev => toggleItem(prev, lb.id))}
                        >
                          {lb.color
                            ? <View style={[styles.labelDot, { backgroundColor: lb.color }]} />
                            : <View style={{ width: 22 }} />}
                          <Text style={[styles.optionLabel, { color: sel ? colors.accent : colors.text }]}>{lb.name}</Text>
                          {sel && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Footer */}
              <View style={[styles.panelFooter, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  onPress={resetDraft}
                  style={[styles.resetAllBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.resetAllText, { color: colors.muted }]}>Reset all</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => closeFilterPanel(true)}
                  style={[styles.showResultsBtn, { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.showResultsText}>Filter</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

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
  list: { paddingHorizontal: 16 },
  headerBlock: { gap: 12, marginBottom: 12 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },

  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 9, fontFamily: 'Figtree_700Bold' },

  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  resetBtnText: { fontSize: 13, fontFamily: 'Figtree_500Medium' },

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 0,
    paddingHorizontal: 4,
  },
  dateHeader: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
  },
  dayNet: { fontSize: 13, fontFamily: 'Figtree_700Bold' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },

  tabStrip: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },

  walletTabHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  walletsList: { padding: 16, gap: 10 },
  walletNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  defaultBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  defaultBadgeText: { fontSize: 11, fontFamily: 'Figtree_600SemiBold' },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 14,
  },
  walletIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  walletIconFallback: { width: 28, height: 28, borderRadius: 8 },
  walletInfo: { flex: 1, paddingVertical: 14, gap: 2 },
  walletName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  walletCurrency: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  walletBalance: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },

  // Filter panel
  panelOverlayContainer: { flex: 1, flexDirection: 'row' },
  filterPanel: {
    width: PANEL_WIDTH,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: { fontSize: 17, fontFamily: 'Figtree_700Bold' },

  panelSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  panelSectionLabel: { fontSize: 12, fontFamily: 'Figtree_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },

  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  panelRowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  panelRowLabel: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  panelRowValue: { fontSize: 14, maxWidth: 110 },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  optionRowChild: {
    paddingLeft: 32,
  },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  labelDot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 5 },
  partialCheck: { width: 14, height: 14, borderRadius: 3, borderWidth: 2 },

  panelFooter: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resetAllBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetAllText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  showResultsBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showResultsText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#fff' },
});
