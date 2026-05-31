import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme, Colors } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import { formatCurrency } from '@/lib/utils';
import { useCountUp } from '@/lib/useCountUp';
import type { Currency, Wallet } from '@/lib/types';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

type CategoryStat = {
  id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  count: number;
};

type WalletPeriodStat = {
  wallet: Wallet & { _balance?: number };
  income: number;
  expense: number;
  net: number;
};

function groupByCategory(txs: any[], type: 'income' | 'expense'): CategoryStat[] {
  const map = new Map<string | null, CategoryStat>();
  for (const tx of txs) {
    if (tx.type !== type) continue;
    const cat = tx.category;
    const key = cat?.id ?? null;
    if (!map.has(key)) {
      map.set(key, { id: key, name: cat?.name ?? 'Uncategorised', icon: cat?.icon ?? null, color: cat?.color ?? null, amount: 0, count: 0 });
    }
    const s = map.get(key)!;
    s.amount += tx.amount;
    s.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export default function StatsScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [wallets, setWallets] = useState<(Wallet & { _balance: number })[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [prevTxs, setPrevTxs] = useState<any[]>([]);
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const prevRange = getPrevRange(period);

    const [
      { data: walletRows },
      { data: allTxSums },
      { data: periodData },
      { data: prevData },
    ] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      supabase.from('transactions').select('wallet_id, type, amount').eq('user_id', user.id).limit(10000),
      supabase
        .from('transactions')
        .select('type, amount, wallet_id, category:categories(id, name, icon, color)')
        .eq('user_id', user.id)
        .gte('date', period.from)
        .lte('date', period.to)
        .is('transfer_group_id', null)
        .limit(10000),
      supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id)
        .gte('date', prevRange.from)
        .lte('date', prevRange.to)
        .is('transfer_group_id', null)
        .limit(10000),
    ]);

    const walletList = walletRows ?? [];
    const txSumList = allTxSums ?? [];
    const balanceMap = new Map<string, number>();
    for (const w of walletList) {
      const wTxs = txSumList.filter((t: any) => t.wallet_id === w.id);
      const inc = wTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const exp = wTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      balanceMap.set(w.id, (w.starting_balance ?? 0) + inc - exp);
    }
    const enriched = walletList.map((w: any) => ({ ...w, _balance: balanceMap.get(w.id) ?? w.starting_balance ?? 0 }));
    setWallets(enriched);

    const defaultW = enriched.find((w: any) => w.is_default) ?? enriched[0];
    if (defaultW?.currency) setCurrency(defaultW.currency as Currency);

    setTxs(periodData ?? []);
    setPrevTxs(prevData ?? []);
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Period aggregates
  const income = useMemo(
    () => txs.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0),
    [txs],
  );
  const expense = useMemo(
    () => txs.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0),
    [txs],
  );
  const net = income - expense;

  // Previous period for comparison
  const prevNet = useMemo(() => {
    const pi = prevTxs.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
    const pe = prevTxs.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
    return pi - pe;
  }, [prevTxs]);

  const vsPct = prevNet === 0 ? null : Math.round(((net - prevNet) / Math.abs(prevNet)) * 100);

  // Proportional bars
  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  // Per-wallet period stats
  const walletPeriodStats: WalletPeriodStat[] = useMemo(() => {
    return wallets
      .map(w => {
        const wTxs = txs.filter((t: any) => t.wallet_id === w.id);
        const wi = wTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
        const we = wTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
        return { wallet: w, income: wi, expense: we, net: wi - we };
      })
      .filter(ws => ws.income > 0 || ws.expense > 0);
  }, [wallets, txs]);

  const animNet = useCountUp(Math.abs(net));

  const expenseByCategory = useMemo(() => groupByCategory(txs, 'expense'), [txs]);
  const incomeByCategory  = useMemo(() => groupByCategory(txs, 'income'),  [txs]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Statistics" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}
      >
        <PeriodPicker value={period} onChange={setPeriod} />

        {/* ── Cash flow card ───────────────────────────────────────── */}
        <View style={[styles.cashFlowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cashFlowTitle, { color: colors.text }]}>Cash flow</Text>

          <View style={styles.cashFlowTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cashFlowPeriodLabel, { color: colors.muted }]}>{period.label}</Text>
              <Text style={[styles.cashFlowBalance, { color: net >= 0 ? colors.income : colors.expense }]}>
                {net >= 0 ? '+' : '−'}{formatCurrency(animNet, currency)}
              </Text>
            </View>
            {vsPct !== null && (
              <View style={[
                styles.vsBadge,
                { backgroundColor: vsPct >= 0 ? colors.income + '22' : colors.expense + '22' },
              ]}>
                <Text style={[styles.vsLabel, { color: colors.muted }]}>vs prev.</Text>
                <Text style={[styles.vsPct, { color: vsPct >= 0 ? colors.income : colors.expense }]}>
                  {vsPct >= 0 ? '↑' : '↓'} {Math.abs(vsPct)}%
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cashFlowBars}>
            <View style={styles.barBlock}>
              <View style={styles.barMeta}>
                <Text style={[styles.barLabel, { color: colors.muted }]}>Income</Text>
                <Text style={[styles.barAmount, { color: colors.text }]}>{formatCurrency(income, currency)}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.barFill, { width: `${incomePct}%` as any, backgroundColor: colors.income }]} />
              </View>
            </View>
            <View style={styles.barBlock}>
              <View style={styles.barMeta}>
                <Text style={[styles.barLabel, { color: colors.muted }]}>Expenses</Text>
                <Text style={[styles.barAmount, { color: colors.text }]}>−{formatCurrency(expense, currency)}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.barFill, { width: `${expensePct}%` as any, backgroundColor: colors.expense }]} />
              </View>
            </View>
          </View>
        </View>

        {/* ── By wallet ────────────────────────────────────────────── */}
        {walletPeriodStats.length > 0 && (
          <View>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>By wallet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletScroll}>
              {walletPeriodStats.map(({ wallet: w, income: wi, expense: we, net: wn }) => (
                <View
                  key={w.id}
                  style={[
                    styles.walletCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderLeftColor: w.color || colors.accent,
                    },
                  ]}
                >
                  <View style={styles.walletCardHeader}>
                    {w.icon ? <Text style={styles.walletCardIcon}>{w.icon}</Text> : null}
                    <Text style={[styles.walletCardName, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                    <Text style={[styles.walletCardCurrency, { color: colors.muted }]}>{w.currency}</Text>
                  </View>
                  <Text style={[styles.walletCardBalance, { color: wn >= 0 ? colors.income : colors.expense }]}>
                    {wn >= 0 ? '+' : '−'}{formatCurrency(Math.abs(wn), w.currency)}
                  </Text>
                  <View style={styles.walletCardDetails}>
                    <Text style={[styles.walletIncome, { color: colors.income }]}>+{formatCurrency(wi, w.currency)}</Text>
                    <Text style={[styles.walletExpense, { color: colors.expense }]}>−{formatCurrency(we, w.currency)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Category breakdowns ──────────────────────────────────── */}
        {expenseByCategory.length > 0 && (
          <CategoryBreakdown
            title="Expenses by category"
            items={expenseByCategory}
            total={expense}
            fallbackBarColor={colors.expense}
            currency={currency}
            colors={colors}
          />
        )}

        {incomeByCategory.length > 0 && (
          <CategoryBreakdown
            title="Income by category"
            items={incomeByCategory}
            total={income}
            fallbackBarColor={colors.income}
            currency={currency}
            colors={colors}
          />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── CategoryBreakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({ title, items, total, fallbackBarColor, currency, colors }: {
  title: string;
  items: CategoryStat[];
  total: number;
  fallbackBarColor: string;
  currency: Currency;
  colors: Colors;
}) {
  const maxAmount = items[0]?.amount ?? 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.muted }]}>{title.toUpperCase()}</Text>
      {items.map((cat, i) => {
        const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
        const barPct = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
        const dotColor = cat.color || fallbackBarColor;
        return (
          <View
            key={cat.id ?? `null-${i}`}
            style={[
              styles.catRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <View style={[styles.catIconBox, { backgroundColor: dotColor + '28' }]}>
              {cat.icon
                ? <Text style={styles.catIcon}>{cat.icon}</Text>
                : <View style={[styles.catDot, { backgroundColor: dotColor }]} />}
            </View>
            <View style={styles.catInfo}>
              <View style={styles.catTopRow}>
                <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>{cat.name}</Text>
                <Text style={[styles.catAmount, { color: dotColor }]}>{formatCurrency(cat.amount, currency)}</Text>
              </View>
              <View style={styles.catBarRow}>
                <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                  <View style={[styles.barFill, { width: `${barPct}%` as any, backgroundColor: dotColor }]} />
                </View>
                <Text style={[styles.catPct, { color: colors.muted }]}>{pct}%</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 16 },

  // Cash flow card
  cashFlowCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cashFlowTitle: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  cashFlowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cashFlowPeriodLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium', marginBottom: 4 },
  cashFlowBalance: { fontSize: 30, fontFamily: 'Figtree_700Bold', lineHeight: 34 },
  vsBadge: {
    alignItems: 'flex-end',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  vsLabel: { fontSize: 11, fontFamily: 'Figtree_500Medium' },
  vsPct: { fontSize: 15, fontFamily: 'Figtree_700Bold' },
  cashFlowBars: { gap: 14 },
  barBlock: { gap: 6 },
  barMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  barAmount: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  // By wallet
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  walletScroll: { gap: 10, paddingBottom: 2 },
  walletCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    minWidth: 160,
    maxWidth: 220,
  },
  walletCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletCardIcon: { fontSize: 16 },
  walletCardName: { flex: 1, fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  walletCardCurrency: { fontSize: 11, fontFamily: 'Figtree_600SemiBold', letterSpacing: 0.4 },
  walletCardBalance: { fontSize: 20, fontFamily: 'Figtree_700Bold' },
  walletCardDetails: { flexDirection: 'row', gap: 10 },
  walletIncome: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  walletExpense: { fontSize: 12, fontFamily: 'Figtree_500Medium' },

  // Category breakdown
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardTitle: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  catIconBox: {
    width: 36, height: 36, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  catIcon: { fontSize: 18 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catInfo: { flex: 1, gap: 5 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  catName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold', flex: 1 },
  catAmount: { fontSize: 13, fontFamily: 'Figtree_700Bold', flexShrink: 0 },
  catBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catPct: { fontSize: 11, fontFamily: 'Figtree_600SemiBold', width: 32, textAlign: 'right' },
});
