import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Pressable,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import { formatCurrency } from '@/lib/utils';
import { getExchangeRatesForPeriod, getExchangeRates, getRatesForDate, toHUF, type DailyRates } from '@/lib/exchange';
import { fetchWalletBalanceSums } from '@/lib/fetchWalletBalanceSums';
import { generateDueDates, isoDate as recurringIsoDate } from '@/lib/recurringUtils';
import SkeletonBox from '@/components/SkeletonBox';
import type { Currency, Wallet } from '@/lib/types';

const SCREEN_W = Dimensions.get('window').width;

// ─── date helpers ─────────────────────────────────────────────────────────────

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

// ─── types ────────────────────────────────────────────────────────────────────

type CategoryStat = {
  id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  amount: number;
  count: number;
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

// ─── SVG donut helpers ────────────────────────────────────────────────────────

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildArcPath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const s = polarToCart(cx, cy, outerR, startDeg);
  const e = polarToCart(cx, cy, outerR, endDeg);
  const si = polarToCart(cx, cy, innerR, endDeg);
  const ei = polarToCart(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${s.x.toFixed(2)} ${s.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
    `L ${si.x.toFixed(2)} ${si.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${ei.x.toFixed(2)} ${ei.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

const CHART_SIZE = SCREEN_W - 32 - 28; // full-width donut
const DONUT_SIDE_SIZE = Math.round((SCREEN_W - 32 - 28) * 0.48); // side-by-side donut

const CHART_PALETTE = [
  '#6C63FF', '#FF6B6B', '#43BCCD', '#F9A826', '#5CB85C',
  '#E8468A', '#3ABFB1', '#FF8C42', '#9B59B6', '#2ECC71',
  '#E74C3C', '#3498DB',
];

function DonutChart({ items, total, fallback, size: sizeProp }: { items: CategoryStat[]; total: number; fallback: string; size?: number }) {
  const size = sizeProp ?? CHART_SIZE;
  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR - 22;
  const GAP_DEG = items.length > 1 ? 2 : 0;

  if (total === 0) return null;

  const segments: { path: string; color: string }[] = [];
  let cursor = 0;
  for (const item of items) {
    const sweep = (item.amount / total) * 360;
    if (sweep < 0.5) { cursor += sweep; continue; }
    segments.push({ path: buildArcPath(cx, cy, outerR, innerR, cursor, cursor + sweep - GAP_DEG), color: item.color || fallback });
    cursor += sweep;
  }

  return (
    <Svg width={size} height={size}>
      {segments.map((seg, i) => (
        <Path key={i} d={seg.path} fill={seg.color} />
      ))}
    </Svg>
  );
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [wallets, setWallets] = useState<(Wallet & { _balance: number })[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [prevTxs, setPrevTxs] = useState<any[]>([]);
  const [dailyRates, setDailyRates] = useState<DailyRates>({});
  const [prevDailyRates, setPrevDailyRates] = useState<DailyRates>({});
  const [currentRates, setCurrentRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recurringPayments, setRecurringPayments] = useState<any[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<any[]>([]);
  const [otherExpanded, setOtherExpanded] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const prevRange = getPrevRange(period);

    const [
      { data: walletRows },
      allTxSums,
      { data: periodData },
      { data: prevData },
      { data: recurringRows },
      { data: occurrenceRows },
    ] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      fetchWalletBalanceSums(user.id),
      supabase
        .from('transactions')
        .select('type, amount, date, wallet_id, wallet:wallets(currency), category:categories(id, name, icon, color)')
        .eq('user_id', user.id)
        .gte('date', period.from)
        .lte('date', period.to)
        .filter('transfer_group_id', 'is', null)
        .limit(10000),
      supabase
        .from('transactions')
        .select('type, amount, date, wallet:wallets(currency), category:categories(id, name, icon, color)')
        .eq('user_id', user.id)
        .gte('date', prevRange.from)
        .lte('date', prevRange.to)
        .filter('transfer_group_id', 'is', null)
        .limit(10000),
      supabase
        .from('recurring_payments')
        .select('id, type, amount, frequency, start_date, end_date, is_active, wallet:wallets(currency)')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('recurring_occurrences')
        .select('recurring_payment_id, due_date')
        .eq('user_id', user.id)
        .gte('due_date', period.from)
        .lte('due_date', period.to),
    ]);

    const hasNonHUF = (walletRows ?? []).some((w: any) => w.currency !== 'HUF');

    const walletList = walletRows ?? [];
    const balanceMap = new Map<string, number>();
    for (const w of walletList) {
      const sums = allTxSums.get(w.id) ?? { income: 0, expense: 0 };
      balanceMap.set(w.id, (w.starting_balance ?? 0) + sums.income - sums.expense);
    }
    setWallets(walletList.map((w: any) => ({ ...w, _balance: balanceMap.get(w.id) ?? w.starting_balance ?? 0 })));
    setTxs(periodData ?? []);
    setPrevTxs(prevData ?? []);
    setRecurringPayments(recurringRows ?? []);
    setRecurringOccurrences(occurrenceRows ?? []);

    // Show content immediately; exchange rates load in the background
    setLoading(false);

    if (hasNonHUF) {
      const fetchRates = async (from: string, to: string): Promise<DailyRates> => {
        let rates = await getExchangeRatesForPeriod(from, to);
        if (Object.keys(rates).length === 0) {
          const current = await getExchangeRates();
          if (Object.keys(current).length > 0) rates = { [from]: current };
        }
        return rates;
      };
      const [periodRates, prevRates, todayRates] = await Promise.all([
        fetchRates(period.from, period.to),
        fetchRates(prevRange.from, prevRange.to),
        getExchangeRates(),
      ]);
      setDailyRates(periodRates);
      setPrevDailyRates(prevRates);
      setCurrentRates(todayRates);
    }
    } catch (e) {
      console.error('[Stats] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  // Pre-convert all amounts to HUF using each transaction's own day rate
  const txsHUF = useMemo(() => txs.map(t => ({
    ...t,
    amount: toHUF(t.amount, (t.wallet as any)?.currency, getRatesForDate(t.date, dailyRates)),
  })), [txs, dailyRates]);

  const prevTxsHUF = useMemo(() => prevTxs.map(t => ({
    ...t,
    amount: toHUF(t.amount, (t.wallet as any)?.currency, getRatesForDate(t.date, prevDailyRates)),
  })), [prevTxs, prevDailyRates]);

  // aggregates (all in HUF)
  const income = useMemo(() => txsHUF.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0), [txsHUF]);
  const expense = useMemo(() => txsHUF.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0), [txsHUF]);
  const net = income - expense;
  const txCount = txs.length;

  const defaultCurrency: Currency = 'HUF';

  const { projIncome, projExpense, recurringLeftCount } = useMemo(() => {
    const actionedKeys = new Set(recurringOccurrences.map((o: any) => `${o.recurring_payment_id}|${o.due_date}`));
    const from = new Date(period.from + 'T00:00:00');
    const to = new Date(period.to + 'T23:59:59');
    let projIncome = 0, projExpense = 0, recurringLeftCount = 0;
    for (const p of recurringPayments) {
      for (const date of generateDueDates(p, from, to)) {
        if (actionedKeys.has(`${p.id}|${recurringIsoDate(date)}`)) continue;
        const amtHUF = toHUF(p.amount, (p.wallet as any)?.currency, currentRates);
        if (p.type === 'income') projIncome += amtHUF;
        else { projExpense += amtHUF; recurringLeftCount += 1; }
      }
    }
    return { projIncome, projExpense, recurringLeftCount };
  }, [recurringPayments, recurringOccurrences, period.from, period.to, currentRates]);

  const expenseByCategory = useMemo(() => groupByCategory(txsHUF, 'expense'), [txsHUF]);

  // Merge categories under 10 000 into "Other" for the chart
  const { displayExpenseByCategory, otherItems } = useMemo(() => {
    const THRESHOLD = 10000;
    const main = expenseByCategory.filter(c => c.amount >= THRESHOLD);
    const small = expenseByCategory.filter(c => c.amount < THRESHOLD);
    const otherAmount = small.reduce((s, c) => s + c.amount, 0);
    const items = otherAmount === 0 ? main : [
      ...main,
      { id: '__other__' as string | null, name: 'Other', icon: null, color: '#94a3b8', amount: otherAmount, count: small.reduce((s, c) => s + c.count, 0) },
    ];
    // Assign unique palette colors by index so segments are always distinguishable
    const display = items.map((item, i) => ({
      ...item,
      color: item.id === '__other__' ? '#94a3b8' : CHART_PALETTE[i % CHART_PALETTE.length],
    }));
    return { displayExpenseByCategory: display, otherItems: small };
  }, [expenseByCategory]);

  // One entry per currency; bars are sized by HUF-equivalent so EUR/USD align correctly
  const balanceByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wallets) map.set(w.currency, (map.get(w.currency) ?? 0) + w._balance);
    return Array.from(map.entries())
      .map(([currency, balance]) => ({
        currency,
        balance,
        balanceHUF: toHUF(balance, currency, currentRates),
      }))
      .sort((a, b) => Math.abs(b.balanceHUF) - Math.abs(a.balanceHUF));
  }, [wallets, currentRates]);

  const prevExpenseByCategory = useMemo(() => groupByCategory(prevTxsHUF, 'expense'), [prevTxsHUF]);

  const comparisonData = useMemo(() => {
    const allIds = new Set([
      ...expenseByCategory.map(c => c.id),
      ...prevExpenseByCategory.map(c => c.id),
    ]);
    return Array.from(allIds).map(id => {
      const cur = expenseByCategory.find(c => c.id === id);
      const prv = prevExpenseByCategory.find(c => c.id === id);
      const ref = cur ?? prv!;
      return { id, name: ref.name, icon: ref.icon, color: ref.color, current: cur?.amount ?? 0, previous: prv?.amount ?? 0 };
    }).sort((a, b) => b.current - a.current).slice(0, 8);
  }, [expenseByCategory, prevExpenseByCategory]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <AppHeader title="Statistics" />
        <ScrollView contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}>
          <PeriodPicker value={period} onChange={setPeriod} />
          <SkeletonBox style={{ height: 148, borderRadius: 14 }} />
          <SkeletonBox style={{ height: 200, borderRadius: 14 }} />
          <SkeletonBox style={{ height: 320, borderRadius: 14 }} />
          <SkeletonBox style={{ height: 160, borderRadius: 14 }} />
          <SkeletonBox style={{ height: 260, borderRadius: 14 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Statistics" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16, paddingTop: 16 }]}
      >
        <PeriodPicker value={period} onChange={setPeriod} />

        {/* ── Card 1: Saved / Net summary ──────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.summaryCardHeader}>
            <Text style={[styles.summaryCardLabel, { color: colors.muted }]}>
              {net >= 0 ? 'SAVED THIS PERIOD' : 'DEFICIT THIS PERIOD'}
            </Text>
            <Text style={[styles.summaryCardTxCount, { color: colors.muted }]}>{txCount} transactions</Text>
          </View>
          <Text style={[styles.summaryCardNet, { color: net >= 0 ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
            {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net), defaultCurrency)}
          </Text>
          <View style={[styles.summaryCardDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryCardRow}>
            <View style={[styles.summaryCardIconCircle, { backgroundColor: colors.income + '22' }]}>
              <Ionicons name="arrow-down-outline" size={18} color={colors.income} />
            </View>
            <Text style={[styles.summaryCardRowLabel, { color: colors.text }]}>Income</Text>
            <Text style={[styles.summaryCardRowAmount, { color: colors.income }]}>+{formatCurrency(income, defaultCurrency)}</Text>
          </View>
          <View style={styles.summaryCardRow}>
            <View style={[styles.summaryCardIconCircle, { backgroundColor: colors.expense + '22' }]}>
              <Ionicons name="arrow-up-outline" size={18} color={colors.expense} />
            </View>
            <Text style={[styles.summaryCardRowLabel, { color: colors.text }]}>Spending</Text>
            <Text style={[styles.summaryCardRowAmount, { color: colors.expense }]}>−{formatCurrency(expense, defaultCurrency)}</Text>
          </View>
        </View>

        {/* ── Card 2: Projected month end ──────────────────────────────── */}
        {(projExpense > 0 || projIncome > 0) && (() => {
          const projectedExpense = expense + projExpense;
          const projectedNet = net + projIncome - projExpense;
          const totalBar = projectedExpense > 0 ? projectedExpense : 1;
          const spentPct = Math.min((expense / totalBar) * 100, 100);
          const remainPct = Math.min((projExpense / totalBar) * 100, 100 - spentPct);
          return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.muted }]}>PROJECTED</Text>

              <View style={styles.projRow}>
                <Text style={[styles.projRowLabel, { color: colors.muted }]}>Spending</Text>
                <View style={styles.projAmountGroup}>
                  <Text style={[styles.projTotalAmount, { color: colors.text }]}>{formatCurrency(projectedExpense, defaultCurrency)}</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={[styles.projBarTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.projBarSpent, { width: `${spentPct}%` as any, backgroundColor: colors.accent }]} />
                <View style={[styles.projBarRemain, { width: `${remainPct}%` as any, backgroundColor: colors.accent + '44' }]} />
              </View>

              <View style={styles.projLegendRow}>
                <View style={[styles.projLegendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.projLegendLabel, { color: colors.text }]}>Spent so far</Text>
                <Text style={[styles.projLegendAmount, { color: colors.text }]}>{formatCurrency(expense, defaultCurrency)}</Text>
              </View>
              <View style={styles.projLegendRow}>
                <View style={[styles.projLegendDot, { backgroundColor: colors.accent + '44' }]} />
                <Text style={[styles.projLegendLabel, { color: colors.text }]}>{recurringLeftCount} recurring left</Text>
                <Text style={[styles.projLegendAmount, { color: colors.text }]}>+{formatCurrency(projExpense, defaultCurrency)}</Text>
              </View>

              <View style={[styles.projDivider, { backgroundColor: colors.border }]} />

              <View style={styles.projNetRow}>
                <View>
                  <Text style={[styles.projNetLabel, { color: colors.muted }]}>Net balance</Text>
                </View>
                <View style={styles.projNetAmountGroup}>
                  <Text style={[styles.projNetAmount, { color: projectedNet >= 0 ? colors.income : colors.expense }]}>
                    {projectedNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(projectedNet), defaultCurrency)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* ── Expenses by Category ─────────────────────────────────────── */}
        {displayExpenseByCategory.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.muted }]}>EXPENSES BY CATEGORY</Text>

            {/* donut + legend side by side */}
            <View style={styles.donutRow}>
              <View style={[styles.donutWrap, { width: DONUT_SIDE_SIZE, height: DONUT_SIDE_SIZE }]}>
                <DonutChart items={displayExpenseByCategory} total={expense} fallback={colors.expense} size={DONUT_SIDE_SIZE} />
                <View style={styles.donutCenter} pointerEvents="none">
                  <Text style={[styles.donutTotal, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrency(expense, defaultCurrency)}
                  </Text>
                  <Text style={[styles.donutTotalLabel, { color: colors.muted }]}>total</Text>
                </View>
              </View>
              <View style={styles.donutLegend}>
                {displayExpenseByCategory.map((cat, i) => {
                  const pct = expense > 0 ? Math.round((cat.amount / expense) * 100) : 0;
                  return (
                    <View key={cat.id ?? `null-${i}`} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: cat.color || colors.expense }]} />
                      <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>{cat.name}</Text>
                      <Text style={[styles.legendPct, { color: colors.muted }]}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* full list */}
            {displayExpenseByCategory.map((cat, i) => {
              const pct = expense > 0 ? Math.round((cat.amount / expense) * 100) : 0;
              const barPct = displayExpenseByCategory[0]?.amount > 0 ? (cat.amount / displayExpenseByCategory[0].amount) * 100 : 0;
              const dotColor = cat.color || colors.expense;
              const isOther = cat.id === '__other__';
              return (
                <View key={cat.id ?? `null-list-${i}`}>
                  <Pressable
                    onPress={isOther ? () => setOtherExpanded(v => !v) : undefined}
                    style={[styles.catRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.catIconBox, { backgroundColor: dotColor + '28' }]}>
                      {cat.icon ? <Text style={styles.catIcon}>{cat.icon}</Text> : <View style={[styles.catDot, { backgroundColor: dotColor }]} />}
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catTopRow}>
                        <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>{cat.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={[styles.catAmount, { color: dotColor }]}>{formatCurrency(cat.amount, defaultCurrency)}</Text>
                          {isOther && (
                            <Ionicons
                              name={otherExpanded ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={colors.muted}
                            />
                          )}
                        </View>
                      </View>
                      <View style={styles.catBarRow}>
                        <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                          <View style={[styles.barFill, { width: `${barPct}%` as any, backgroundColor: dotColor }]} />
                        </View>
                        <Text style={[styles.catPct, { color: colors.muted }]}>{pct}%</Text>
                      </View>
                    </View>
                  </Pressable>
                  {isOther && otherExpanded && otherItems.map((sub, j) => {
                    const subPct = expense > 0 ? Math.round((sub.amount / expense) * 100) : 0;
                    const subBarPct = displayExpenseByCategory[0]?.amount > 0 ? (sub.amount / displayExpenseByCategory[0].amount) * 100 : 0;
                    const subColor = sub.color || colors.expense;
                    return (
                      <View
                        key={sub.id ?? `null-other-sub-${j}`}
                        style={[styles.catRow, styles.subCatRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      >
                        <View style={[styles.catIconBox, { backgroundColor: subColor + '28' }]}>
                          {sub.icon ? <Text style={styles.catIcon}>{sub.icon}</Text> : <View style={[styles.catDot, { backgroundColor: subColor }]} />}
                        </View>
                        <View style={styles.catInfo}>
                          <View style={styles.catTopRow}>
                            <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>{sub.name}</Text>
                            <Text style={[styles.catAmount, { color: subColor }]}>{formatCurrency(sub.amount, defaultCurrency)}</Text>
                          </View>
                          <View style={styles.catBarRow}>
                            <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                              <View style={[styles.barFill, { width: `${subBarPct}%` as any, backgroundColor: subColor }]} />
                            </View>
                            <Text style={[styles.catPct, { color: colors.muted }]}>{subPct}%</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Balance by Currency ──────────────────────────────────────── */}
        {balanceByCurrency.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.muted }]}>BALANCE BY CURRENCY</Text>
            <Text style={[styles.currencySubtitle, { color: colors.muted }]}>Current total across all wallets</Text>
            {balanceByCurrency.map(({ currency, balance, balanceHUF }, i) => {
              const amountColor = balance >= 0 ? colors.income : colors.expense;
              return (
                <View
                  key={currency}
                  style={[styles.currencyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <Text style={[styles.currencyCode, { color: colors.text }]}>{currency}</Text>
                  <View style={styles.currencyAmountGroup}>
                    <Text style={[styles.currencyAmount, { color: amountColor }]}>
                      {balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(balance), currency as Currency)}
                    </Text>
                    {currency !== 'HUF' && (
                      <Text style={[styles.currencyHUF, { color: colors.muted }]}>
                        ≈{formatCurrency(Math.abs(balanceHUF), 'HUF')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            <View style={{ height: 4 }} />
          </View>
        )}

        {/* ── Expense Comparison by Category ──────────────────────────── */}
        {comparisonData.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.muted }]}>EXPENSE COMPARISON BY CATEGORY</Text>
            <View style={styles.compLegendRow}>
              <View style={styles.compLegendItem}>
                <View style={[styles.compLegendDot, { backgroundColor: colors.expense }]} />
                <Text style={[styles.compLegendText, { color: colors.muted }]}>Current period</Text>
              </View>
              <View style={styles.compLegendItem}>
                <View style={[styles.compLegendDot, { backgroundColor: colors.muted + '88' }]} />
                <Text style={[styles.compLegendText, { color: colors.muted }]}>Previous period</Text>
              </View>
            </View>
            {(() => {
              const maxVal = Math.max(...comparisonData.map(d => Math.max(d.current, d.previous)), 1);
              return comparisonData.map((item, i) => {
                const curPct = (item.current / maxVal) * 100;
                const prevPct = (item.previous / maxVal) * 100;
                const dotColor = item.color || colors.expense;
                return (
                  <View
                    key={item.id ?? `null-cmp-${i}`}
                    style={[styles.compRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={styles.compIconBox}>
                      {item.icon ? <Text style={styles.catIcon}>{item.icon}</Text> : <View style={[styles.catDot, { backgroundColor: dotColor }]} />}
                    </View>
                    <View style={styles.compBars}>
                      <Text style={[styles.compCatName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.compBarGroup}>
                        <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                          <View style={[styles.barFill, { width: `${curPct}%` as any, backgroundColor: colors.expense }]} />
                        </View>
                        <Text style={[styles.compBarAmt, { color: colors.text }]}>{formatCurrency(item.current, defaultCurrency)}</Text>
                      </View>
                      <View style={styles.compBarGroup}>
                        <View style={[styles.barTrack, { backgroundColor: colors.border, flex: 1 }]}>
                          <View style={[styles.barFill, { width: `${prevPct}%` as any, backgroundColor: colors.muted + '88' }]} />
                        </View>
                        <Text style={[styles.compBarAmt, { color: colors.muted }]}>{formatCurrency(item.previous, defaultCurrency)}</Text>
                      </View>
                    </View>
                  </View>
                );
              });
            })()}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}


// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 16 },

  // Card 1: Net summary
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  summaryCardLabel: { fontSize: 11, fontFamily: 'Figtree_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryCardTxCount: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  summaryCardNet: { fontSize: 42, fontFamily: 'Lora_700Bold', paddingHorizontal: 14, paddingBottom: 14, lineHeight: 52 },
  summaryCardDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14, marginBottom: 6 },
  summaryCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  summaryCardIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  summaryCardRowLabel: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },
  summaryCardRowAmount: { fontSize: 16, fontFamily: 'Figtree_700Bold' },

  // Card 2: Projected
  projRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  projRowLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  projAmountGroup: { flexDirection: 'row', alignItems: 'baseline' },
  projTotalAmount: { fontSize: 22, fontFamily: 'Figtree_700Bold' },
  projBarTrack: { height: 10, borderRadius: 5, marginHorizontal: 14, marginBottom: 12, flexDirection: 'row', overflow: 'hidden' },
  projBarSpent: { height: 10 },
  projBarRemain: { height: 10 },
  projLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4 },
  projLegendDot: { width: 10, height: 10, borderRadius: 5 },
  projLegendLabel: { flex: 1, fontSize: 13, fontFamily: 'Figtree_500Medium' },
  projLegendAmount: { fontSize: 13, fontFamily: 'Figtree_600SemiBold' },
  projDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14, marginTop: 12, marginBottom: 10 },
  projNetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 14 },
  projNetLabel: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  projNetAmountGroup: { flexDirection: 'row', alignItems: 'baseline' },
  projNetAmount: { fontSize: 24, fontFamily: 'Lora_700Bold' },

  // Card shell
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

  // Donut
  donutRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  donutWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  donutTotal: { fontSize: 13, fontFamily: 'Figtree_700Bold', textAlign: 'center' },
  donutTotalLabel: { fontSize: 11, fontFamily: 'Figtree_500Medium' },
  donutLegend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  legendName: { flex: 1, fontSize: 12, fontFamily: 'Figtree_500Medium' },
  legendPct: { fontSize: 12, fontFamily: 'Figtree_600SemiBold', width: 32, textAlign: 'right' },

  // Category rows
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  subCatRow: { paddingLeft: 28 },
  catIconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catIcon: { fontSize: 18 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catInfo: { flex: 1, gap: 5 },
  catTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  catName: { fontSize: 14, fontFamily: 'Figtree_600SemiBold', flex: 1 },
  catAmount: { fontSize: 13, fontFamily: 'Figtree_700Bold', flexShrink: 0 },
  catBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catPct: { fontSize: 11, fontFamily: 'Figtree_600SemiBold', width: 32, textAlign: 'right' },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  // Balance by currency
  currencySubtitle: { fontSize: 12, fontFamily: 'Figtree_500Medium', paddingHorizontal: 14, marginTop: -6, marginBottom: 10 },
  currencyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  currencyCode: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  currencyAmountGroup: { alignItems: 'flex-end' },
  currencyAmount: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  currencyHUF: { fontSize: 12, fontFamily: 'Figtree_400Regular', marginTop: 2 },

  // Expense comparison
  compLegendRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 14, paddingBottom: 10 },
  compLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  compLegendDot: { width: 10, height: 10, borderRadius: 5 },
  compLegendText: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  compRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  compIconBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 18 },
  compBars: { flex: 1, gap: 4 },
  compCatName: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', marginBottom: 2 },
  compBarGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compBarAmt: { fontSize: 11, fontFamily: 'Figtree_600SemiBold', width: 80, textAlign: 'right' },
});
