import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import TransactionRow from '@/components/TransactionsTransactionRow';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import BottomModal from '@/components/BottomModal';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction, Wallet, Category, Label, TransactionType, Currency } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import ConfirmModal from '@/components/ConfirmModal';
import { groupByDate, formatDayHeader, formatCurrency } from '@/lib/utils';
import { getExchangeRatesForPeriod, getExchangeRates, getRatesForDate, toHUF, type DailyRates } from '@/lib/exchange';
import SkeletonBox from '@/components/SkeletonBox';
import Toast from '@/components/Toast';
import { Events } from '@/lib/events';
import { useRouter } from 'expo-router';

type TypeFilter = 'all' | TransactionType;
type ModalKind = 'type' | 'wallet' | 'label' | null;

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];

type WalletForm = {
  name: string;
  currency: Currency;
  icon: string;
  is_default: boolean;
  starting_balance: string;
};

const DEFAULT_WALLET_FORM: WalletForm = {
  name: '',
  currency: 'HUF',
  icon: '💰',
  is_default: false,
  starting_balance: '0',
};

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
  label: string; selected: boolean; onPress: () => void; colors: any; icon?: ReactNode;
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

  const [activeTab, setActiveTab] = useState<'transactions' | 'wallets'>('transactions');
  const [walletBalances, setWalletBalances] = useState<Map<string, number>>(new Map());

  const [dailyRates, setDailyRates] = useState<DailyRates>({});

  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', success: true });

  const [addWalletVisible, setAddWalletVisible] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);
  const [walletForm, setWalletForm] = useState<WalletForm>(DEFAULT_WALLET_FORM);
  const [walletSaving, setWalletSaving] = useState(false);
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState<(() => void) | null>(null);

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

  function resetFilters() {
    setSearch('');
    setTypeFilter('all');
    setWalletFilter('');
    setCategoryFilter('');
    setLabelFilter('');
    setPeriod(defaultPeriod());
  }

  function openEditWallet(w: Wallet) {
    setEditWallet(w);
    setWalletForm({
      name: w.name,
      currency: w.currency,
      icon: w.icon ?? '💰',
      is_default: w.is_default,
      starting_balance: String(w.starting_balance ?? 0),
    });
  }

  function setWalletField<K extends keyof WalletForm>(key: K, value: WalletForm[K]) {
    setWalletForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSaveWallet() {
    if (!walletForm.name.trim()) return;
    setWalletSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWalletSaving(false); return; }
    const payload = {
      name: walletForm.name.trim(),
      currency: walletForm.currency,
      icon: walletForm.icon,
      is_default: walletForm.is_default,
      starting_balance: parseFloat(walletForm.starting_balance) || 0,
    };
    if (walletForm.is_default) {
      await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
    }
    if (editWallet) {
      await supabase.from('wallets').update(payload).eq('id', editWallet.id);
    } else {
      await supabase.from('wallets').insert({ ...payload, user_id: user.id });
    }
    setWalletSaving(false);
    setAddWalletVisible(false);
    setEditWallet(null);
    load();
  }

  function handleDeleteWallet() {
    if (!editWallet) return;
    setConfirmDeleteWallet(() => async () => {
      await supabase.from('wallets').delete().eq('id', editWallet.id);
      setEditWallet(null);
      load();
    });
  }

  const hasActiveFilters = !!(search || typeFilter !== 'all' || walletFilter || categoryFilter || labelFilter);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (walletFilter && tx.wallet_id !== walletFilter) return false;
      if (categoryFilter && tx.category_id !== categoryFilter) return false;
      if (labelFilter && !tx.labels?.some((l: Label) => l.id === labelFilter)) return false;
      if (q) {
        const inNotes = tx.notes?.toLowerCase().includes(q) ?? false;
        const inPayer = tx.payer?.toLowerCase().includes(q) ?? false;
        if (!inNotes && !inPayer) return false;
      }
      return true;
    });
  }, [transactions, search, typeFilter, walletFilter, categoryFilter, labelFilter, period]);

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

  const selectedCategory = categories.find((c) => c.id === categoryFilter);
  const selectedWallet = wallets.find((w) => w.id === walletFilter);
  const selectedLabel = labels.find((l) => l.id === labelFilter);

  const typeLabel = typeFilter === 'all' ? 'All types' : typeFilter === 'expense' ? 'Expenses' : 'Income';

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
          <View style={[styles.walletTabHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { setWalletForm(DEFAULT_WALLET_FORM); setAddWalletVisible(true); }}
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
                  onPress={() => openEditWallet(w)}
                  style={[styles.walletCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.walletColorBar, { backgroundColor: w.color || colors.muted }]} />
                  <View style={styles.walletIcon}>
                    {w.icon
                      ? <Text style={{ fontSize: 22 }}>{w.icon}</Text>
                      : <View style={[styles.walletIconFallback, { backgroundColor: (w.color || colors.muted) + '33' }]} />}
                  </View>
                  <View style={styles.walletInfo}>
                    <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
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
            <View style={styles.titleRow}>
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
          loading ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.skeletonRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SkeletonBox style={{ width: 40, height: 40, borderRadius: 10 }} />
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
      <BottomModal visible={openModal === 'wallet'} onClose={() => setOpenModal(null)} title="Account">
        <ModalRow label="All accounts" selected={!walletFilter} onPress={() => { setWalletFilter(''); setOpenModal(null); }} colors={colors} />
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

      <Toast
        visible={toast.visible}
        message={toast.message}
        success={toast.success}
        bottomOffset={TAB_BAR_HEIGHT + bottom + 12}
      />

      {/* Add wallet modal */}
      <BottomModal visible={addWalletVisible} onClose={() => setAddWalletVisible(false)} title="Add account">
        <WalletFormFields form={walletForm} setField={setWalletField} colors={colors} />
        <AppButton onPress={handleSaveWallet} loading={walletSaving} fullWidth>Save</AppButton>
      </BottomModal>

      {/* Edit wallet modal */}
      <BottomModal visible={!!editWallet} onClose={() => setEditWallet(null)} title="Edit account">
        <WalletFormFields form={walletForm} setField={setWalletField} colors={colors} />
        <View style={styles.modalActions}>
          <AppButton onPress={handleDeleteWallet} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          <AppButton onPress={handleSaveWallet} loading={walletSaving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </BottomModal>

      <ConfirmModal
        visible={!!confirmDeleteWallet}
        title="Delete account"
        message={`Delete "${editWallet?.name}"?`}
        confirmLabel="Delete"
        onConfirm={() => { confirmDeleteWallet?.(); setConfirmDeleteWallet(null); }}
        onCancel={() => setConfirmDeleteWallet(null)}
      />
    </SafeAreaView>
  );
}

function WalletFormFields({
  form,
  setField,
  colors,
}: {
  form: WalletForm;
  setField: <K extends keyof WalletForm>(k: K, v: WalletForm[K]) => void;
  colors: any;
}) {
  return (
    <>
      <AppInput
        label="Name"
        value={form.name}
        onChangeText={(v) => setField('name', v)}
        placeholder="Account name"
      />
      <AppInput
        label="Icon (emoji)"
        value={form.icon}
        onChangeText={(v) => setField('icon', v)}
        placeholder="💰"
      />
      <AppInput
        label="Starting balance"
        value={form.starting_balance}
        onChangeText={(v) => setField('starting_balance', v)}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <View style={styles.formRow}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Currency</Text>
        <View style={styles.chips}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.chip,
                { borderColor: form.currency === c ? colors.accent : colors.border },
                form.currency === c && { backgroundColor: colors.accent + '22' },
              ]}
              onPress={() => setField('currency', c)}
            >
              <Text style={{ color: form.currency === c ? colors.accent : colors.text, fontFamily: 'Figtree_600SemiBold' }}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.formRow, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Set as default</Text>
        <Switch
          value={form.is_default}
          onValueChange={(v) => setField('is_default', v)}
          trackColor={{ true: colors.accent }}
          thumbColor="#fff"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16 },
  headerBlock: { gap: 10, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  resetBtnText: { fontSize: 13, fontFamily: 'Figtree_500Medium' },

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

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  dateHeader: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 12,
    paddingRight: 14,
  },
  walletColorBar: { width: 4, alignSelf: 'stretch' },
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
});
