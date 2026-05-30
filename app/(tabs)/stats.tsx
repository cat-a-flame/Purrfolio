import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  FlatList,
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

type CategoryStat = {
  id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  count: number;
};

export default function StatsScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: walletRows }, { data: allTxSums }, { data: data }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      supabase.from('transactions').select('wallet_id, type, amount').eq('user_id', user.id).limit(10000),
      supabase
        .from('transactions')
        .select('type, amount, category:categories(id, name, icon, color)')
        .eq('user_id', user.id)
        .gte('date', period.from)
        .lte('date', period.to)
        .is('transfer_group_id', null)
        .limit(10000),
    ]);

    const walletList = walletRows ?? [];
    const txSums = allTxSums ?? [];
    const balanceMap = new Map<string, number>();
    for (const w of walletList) {
      const wTxs = txSums.filter((t: any) => t.wallet_id === w.id);
      const inc = wTxs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const exp = wTxs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      balanceMap.set(w.id, (w.starting_balance ?? 0) + inc - exp);
    }
    const enriched = walletList.map((w: any) => ({ ...w, _balance: balanceMap.get(w.id) ?? w.starting_balance ?? 0 }));
    setWallets(enriched);

    const defaultW = enriched.find((w: any) => w.is_default) ?? enriched[0];
    if (defaultW?.currency) setCurrency(defaultW.currency as Currency);
    setTxs(data ?? []);
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const income = useMemo(
    () => txs.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0),
    [txs],
  );
  const expense = useMemo(
    () => txs.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0),
    [txs],
  );
  const net = income - expense;
  const count = txs.length;

  const animIncome = useCountUp(income);
  const animExpense = useCountUp(expense);
  const animNet = useCountUp(Math.abs(net));
  const animCount = useCountUp(count);

  const expenseByCategory = useMemo(() => groupByCategory(txs, 'expense'), [txs]);
  const incomeByCategory = useMemo(() => groupByCategory(txs, 'income'), [txs]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Statistics" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}
      >
        <PeriodPicker value={period} onChange={setPeriod} />

        {/* Wallet balances */}
        {wallets.length > 0 && (
          <FlatList
            horizontal
            data={wallets}
            keyExtractor={(w) => w.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.walletRow}
            renderItem={({ item: w }) => (
              <View style={[styles.walletChip, { backgroundColor: (w.color || '#888') + '22', borderColor: (w.color || '#888') + '55' }]}>
                {w.icon ? <Text style={styles.walletIcon}>{w.icon}</Text> : null}
                <View>
                  <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                  <Text style={[styles.walletBalance, { color: colors.muted }]}>
                    {formatCurrency((w as any)._balance ?? w.starting_balance ?? 0, w.currency)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}

        {/* 2×2 summary grid */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Income"
            value={formatCurrency(animIncome, currency)}
            color={colors.income}
            bg={colors.income + '18'}
            colors={colors}
          />
          <SummaryCard
            label="Expenses"
            value={formatCurrency(animExpense, currency)}
            color={colors.expense}
            bg={colors.expense + '18'}
            colors={colors}
          />
          <SummaryCard
            label="Net"
            value={(net >= 0 ? '+' : '−') + formatCurrency(animNet, currency)}
            color={net >= 0 ? colors.income : colors.expense}
            bg={net >= 0 ? colors.income + '18' : colors.expense + '18'}
            colors={colors}
          />
          <SummaryCard
            label="Transactions"
            value={String(animCount)}
            color={colors.accent}
            bg={colors.accent + '18'}
            colors={colors}
          />
        </View>

        {expenseByCategory.length > 0 && (
          <CategoryBreakdown
            title="Expenses by Category"
            items={expenseByCategory}
            total={expense}
            fallbackBarColor={colors.expense}
            currency={currency}
            colors={colors}
          />
        )}

        {incomeByCategory.length > 0 && (
          <CategoryBreakdown
            title="Income by Category"
            items={incomeByCategory}
            total={income}
            fallbackBarColor={colors.income}
            currency={currency}
            colors={colors}
          />
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

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

// ─── sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, bg, colors }: {
  label: string; value: string; color: string; bg: string; colors: Colors;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.summaryAccent, { backgroundColor: bg }]}>
        <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </Text>
      </View>
      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

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
      <Text style={[styles.cardTitle, { color: colors.muted }]}>{title}</Text>
      {items.map((cat, i) => {
        const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
        const barPct = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
        const dotColor = cat.color || fallbackBarColor;
        return (
          <View
            key={cat.id ?? `null-${i}`}
            style={[styles.catRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
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
  container: { paddingHorizontal: 16 },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 12,
  },
  summaryCard: {
    width: '47.5%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryAccent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryValue: { fontSize: 17, fontWeight: '800' },
  summaryLabel: { fontSize: 12, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 8 },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
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
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catIcon: { fontSize: 18 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catInfo: { flex: 1, gap: 5 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  catName: { fontSize: 14, fontWeight: '600', flex: 1 },
  catAmount: { fontSize: 13, fontWeight: '700', flexShrink: 0 },
  catBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  catPct: { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },

  walletRow: { gap: 10, paddingVertical: 4 },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 140,
  },
  walletIcon: { fontSize: 20 },
  walletName: { fontSize: 13, fontWeight: '600' },
  walletBalance: { fontSize: 12, marginTop: 1 },
});
