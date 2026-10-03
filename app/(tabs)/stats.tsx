import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme, type Colors } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import PeriodPicker, { PeriodValue } from '@/components/PeriodPicker';
import NetWorthCard, { type WalletSummary } from '@/components/NetWorthCard';
import EmojiTile from '@/components/EmojiTile';
import SkeletonBox from '@/components/SkeletonBox';
import { formatHUF, formatNumber } from '@/lib/utils';
import { getExchangeRatesForPeriod, getExchangeRates, getRatesForDate, toHUF, txToHUF, type DailyRates, type Rates } from '@/lib/exchange';
import { fetchWalletBalanceSums } from '@/lib/fetchWalletBalanceSums';
import { generateDueDates, isoDate as recurringIsoDate } from '@/lib/recurringUtils';
import { useCountUp } from '@/lib/useCountUp';
import { Events } from '@/lib/events';
import type { RecurringPayment, Transaction, TransactionType, Wallet } from '@/lib/types';

// The sections, numbers and prediction logic mirror PurrfolioWeb's
// app/statistics/page.tsx so both apps tell the same story.

// ─── palette ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#f26e4d', '#f59e0b', '#10b981', '#6366f1', '#ec4899',
  '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16',
  '#a78bfa', '#fb7185', '#0ea5e9', '#d946ef', '#22c55e',
];

// Categories under this amount (HUF) in the period are folded into "Other"
const OTHER_THRESHOLD_HUF = 5_000;
const OTHER_COLOR = '#94a3b8';
// Category rows shown before "Show N more categories"
const VISIBLE_CATEGORIES = 8;

function formatShare(share: number): string {
  const pct = Math.round(share * 100);
  return pct === 0 && share > 0 ? '<1%' : `${pct}%`;
}

// ─── date helpers ───────────────────────────────────────────────────────────
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
  if (v.tab === 'weeks') return { from: isoDate(new Date(f.getTime() - 7 * 86400000)), to: isoDate(new Date(t.getTime() - 7 * 86400000)) };
  if (v.tab === 'months') return { from: isoDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: isoDate(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (v.tab === 'years') { const y = f.getFullYear() - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  return { from: isoDate(new Date(f.getTime() - days * 86400000)), to: isoDate(new Date(f.getTime() - 86400000)) };
}

// "August" / "December 2025" / "2025" / "the previous week", for "… in <name>" copy
function prevPeriodName(v: PeriodValue, fallback: string): string {
  const prev = getPrevRange(v);
  const prevFrom = new Date(prev.from + 'T12:00:00');
  if (v.tab === 'months') {
    const sameYear = prevFrom.getFullYear() === new Date(v.from + 'T12:00:00').getFullYear();
    return prevFrom.toLocaleDateString('en-GB', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
  }
  if (v.tab === 'years') return String(prevFrom.getFullYear());
  return `the ${fallback}`;
}

function progressPct(actual: number, projected: number): number {
  if (projected <= 0) return 0;
  return Math.max(0, Math.min(100, (actual / projected) * 100));
}

type Tone = 'up' | 'down' | 'flat';

function changeInfo(current: number, prev: number): { text: string; tone: Tone } {
  if (Math.abs(current - prev) < 1) return { text: 'no change', tone: 'flat' };
  if (prev <= 0) return { text: 'new', tone: 'up' };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return { text: 'no change', tone: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'up' : 'down' };
}

// ─── predictions ────────────────────────────────────────────────────────────
const HISTORY_MONTHS = 6;
// A category needs to show up in at least this many of the history buckets
// before it's treated as a real pattern rather than a one-off transaction.
const MIN_BUCKETS_SEEN = 2;
const MAX_PREDICTIONS_PER_TYPE = 10;

const AVG_DAYS_PER_MONTH = 365.25 / 12;

// How many months a period spans: whole calendar months count exactly (so a
// monthly bill predicts its real amount), anything else is pro-rated by days.
function periodLengthInMonths(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00');
  const to = new Date(toIso + 'T00:00:00');
  const dayAfterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  if (from.getDate() === 1 && dayAfterTo.getDate() === 1) {
    return (dayAfterTo.getFullYear() * 12 + dayAfterTo.getMonth()) - (from.getFullYear() * 12 + from.getMonth());
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  return Math.max(1, days) / AVG_DAYS_PER_MONTH;
}

type PredictionItem = {
  key: string;
  title: string;
  subtitle: string;
  type: TransactionType;
  icon: string;
  color: string;
  confidencePct: number;
  predictedAmount: number;
  isStable: boolean;
  rangeLow: number;
  rangeHigh: number;
};

// Mean + coefficient of variation of a set of per-bucket totals — used to turn
// "how big does this usually run" into a confidence score and a stable/range call.
function sampleStats(samples: number[]): { mean: number; cv: number } {
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  if (mean <= 0) return { mean, cv: 0 };
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  return { mean, cv: Math.sqrt(variance) / mean };
}

// ─── data ───────────────────────────────────────────────────────────────────
const TX_SELECT = 'id, type, amount, date, payer, category_id, exchange_rate_to_huf, wallet:wallets(currency), category:categories(id, name, icon, color)';

async function fetchTxs(userId: string, from: string, to: string): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions')
    .select(TX_SELECT)
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .filter('transfer_group_id', 'is', null)
    .limit(10000);
  return (data ?? []) as unknown as Transaction[];
}

async function fetchDailyRates(from: string, to: string): Promise<DailyRates> {
  const rates = await getExchangeRatesForPeriod(from, to);
  if (Object.keys(rates).length > 0) return rates;
  const current = await getExchangeRates();
  return Object.keys(current).length > 0 ? { [from]: current } : {};
}

// ─── small building blocks ──────────────────────────────────────────────────
function Card({ colors, children, style }: { colors: Colors; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.glassStrong, borderColor: colors.glassBorder, shadowColor: colors.shadow }, style]}>
      {children}
    </View>
  );
}

function ChangeBadge({ text, tone, colors }: { text: string; tone: Tone; colors: Colors }) {
  const bg = tone === 'up' ? colors.expenseLight : tone === 'down' ? colors.incomeLight : colors.surface2;
  const fg = tone === 'up' ? colors.expense : tone === 'down' ? colors.income : colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function StatCard({ colors, icon, iconBg, iconFg, label, amount, amountColor, footer }: {
  colors: Colors;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconFg: string;
  label: string;
  amount: string;
  amountColor: string;
  footer: { label: string; value: string; color: string; pct: number } | string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.statHead}>
        <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconFg} />
        </View>
        <Text style={[styles.statLabel, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statAmount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit>{amount}</Text>
      <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
      {typeof footer === 'string' ? (
        <Text style={[styles.statFooterEmpty, { color: colors.muted }]}>{footer}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          <View style={styles.statFooterRow}>
            <View style={styles.statFooterLabelWrap}>
              <View style={[styles.statDot, { backgroundColor: footer.color }]} />
              <Text style={[styles.statFooterLabel, { color: colors.muted }]}>{footer.label}</Text>
            </View>
            <Text style={[styles.statFooterValue, { color: footer.color }]} numberOfLines={1} adjustsFontSizeToFit>{footer.value}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.border2 }]}>
            <View style={[styles.fill, { width: `${footer.pct}%`, backgroundColor: footer.color }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function EmptyHint({ icon, text, colors }: { icon: string; text: string; colors: Colors }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={[styles.emptyText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

function PredictionPanel({ variant, title, items, loading, colors }: {
  variant: 'income' | 'expense';
  title: string;
  items: PredictionItem[];
  loading: boolean;
  colors: Colors;
}) {
  const isIncome = variant === 'income';
  const sign = isIncome ? '+' : '−';
  const tone = isIncome ? colors.income : colors.expense;
  return (
    <Card colors={colors} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={[styles.predBanner, { backgroundColor: isIncome ? colors.incomeLight : colors.expenseLight }]}>
        <View style={[styles.predBannerIcon, { backgroundColor: tone }]}>
          <Ionicons name={isIncome ? 'arrow-up' : 'arrow-down'} size={18} color="#fff" />
        </View>
        <Text style={[styles.predBannerTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.predBody}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonBox key={i} style={{ height: 54, borderRadius: 8 }} />)
        ) : items.length === 0 ? (
          <EmptyHint icon={isIncome ? '💰' : '🧾'} text={`No recurring ${variant} pattern found yet.`} colors={colors} />
        ) : (
          items.map(item => (
            <View key={item.key} style={styles.predRow}>
              {/* Icon, name and "seen" text share the top row with the amount;
                  the confidence bar gets the full width underneath. */}
              <View style={styles.predTop}>
                <EmojiTile emoji={item.icon} color={item.color} size={34} />
                <View style={styles.predMain}>
                  <Text style={[styles.predTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.predSubtitle, { color: colors.muted }]} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                <View style={styles.predAmountCol}>
                  <Text style={[styles.predAmount, { color: tone }]}>{sign}{formatHUF(item.predictedAmount)}</Text>
                  <Text style={[styles.predRange, { color: colors.muted }]}>
                    {item.isStable ? 'stable' : `${formatNumber(Math.round(item.rangeLow))} – ${formatNumber(Math.round(item.rangeHigh))}`}
                  </Text>
                </View>
              </View>
              <View style={styles.predConfRow}>
                <View style={[styles.track, styles.predConfTrack, { backgroundColor: colors.border2 }]}>
                  <View style={[styles.fill, { width: `${item.confidencePct}%`, backgroundColor: tone }]} />
                </View>
                <Text style={[styles.predConfLabel, { color: colors.muted }]}>{item.confidencePct}% sure</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

// ─── screen ─────────────────────────────────────────────────────────────────
export default function StatsScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [periodTxs, setPeriodTxs] = useState<Transaction[]>([]);
  const [prevTxs, setPrevTxs] = useState<Transaction[]>([]);
  const [historyTxs, setHistoryTxs] = useState<Transaction[]>([]);
  const [historyRange, setHistoryRange] = useState<{ from: string; to: string } | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletSums, setWalletSums] = useState<Map<string, { income: number; expense: number }>>(new Map());
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<{ recurring_payment_id: string; due_date: string }[]>([]);
  const [dailyRates, setDailyRates] = useState<DailyRates>({});
  const [todayRates, setTodayRates] = useState<Rates>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const prev = getPrevRange(period);
      const now = new Date();
      // The last HISTORY_MONTHS full calendar months; the current, partial month is left out
      const histFrom = isoDate(new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS, 1));
      const histTo = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));

      const [txs, prevData, historyData, sums, { data: walletRows }, { data: pmtRows }, { data: occRows }] = await Promise.all([
        fetchTxs(user.id, period.from, period.to),
        fetchTxs(user.id, prev.from, prev.to),
        fetchTxs(user.id, histFrom, histTo),
        fetchWalletBalanceSums(user.id),
        supabase.from('wallets').select('*').eq('user_id', user.id),
        supabase
          .from('recurring_payments')
          .select('*, wallet:wallets(currency)')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase
          .from('recurring_occurrences')
          .select('recurring_payment_id, due_date')
          .eq('user_id', user.id)
          .gte('due_date', period.from)
          .lte('due_date', period.to),
      ]);

      // Resolve exchange rates before anything renders, so every total is
      // final when the skeleton disappears. Only needed for foreign wallets.
      const walletList = (walletRows ?? []) as Wallet[];
      let rates: DailyRates = {};
      let today: Rates = {};
      if (walletList.some(w => w.currency !== 'HUF')) {
        const [r1, r2, r3, t] = await Promise.all([
          fetchDailyRates(period.from, period.to),
          fetchDailyRates(prev.from, prev.to),
          fetchDailyRates(histFrom, histTo),
          getExchangeRates(),
        ]);
        rates = { ...r1, ...r2, ...r3 };
        today = t;
      }

      setPeriodTxs(txs);
      setPrevTxs(prevData);
      setHistoryTxs(historyData);
      setHistoryRange({ from: histFrom, to: histTo });
      setWallets(walletList);
      setWalletSums(sums);
      setRecurringPayments((pmtRows ?? []) as RecurringPayment[]);
      setRecurringOccurrences(occRows ?? []);
      setDailyRates(rates);
      setTodayRates(today);
    } catch (e) {
      console.error('[Stats] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => Events.on('transaction-saved', () => { loadRef.current(true); }), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const huf = useCallback(
    (t: Transaction) => txToHUF(t.amount, t.wallet?.currency, t.exchange_rate_to_huf, getRatesForDate(t.date, dailyRates)),
    [dailyRates],
  );

  // ── Net worth ──────────────────────────────────────────────────────────
  const walletSummaries = useMemo<WalletSummary[]>(() => wallets
    .filter(w => !w.is_archived)
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(wallet => {
      const sums = walletSums.get(wallet.id) ?? { income: 0, expense: 0 };
      return { wallet, balance: (wallet.starting_balance ?? 0) + sums.income - sums.expense };
    }), [wallets, walletSums]);

  // ── Summary numbers ────────────────────────────────────────────────────
  const income = useMemo(() => periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + huf(t), 0), [periodTxs, huf]);
  const expense = useMemo(() => periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + huf(t), 0), [periodTxs, huf]);
  const prevExpense = useMemo(() => prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + huf(t), 0), [prevTxs, huf]);

  const txCount = periodTxs.length;
  const incomeCount = periodTxs.filter(t => t.type === 'income').length;
  const expenseCount = txCount - incomeCount;
  const animatedIncome = useCountUp(income);
  const animatedExpense = useCountUp(expense);
  const animatedNet = useCountUp(income - expense);
  const animatedTxCount = useCountUp(txCount);

  // ── Cash flow projection (selected period) ─────────────────────────────
  const { plannedIncome, plannedExpense } = useMemo(() => {
    const from = new Date(period.from + 'T00:00:00');
    const to = new Date(period.to + 'T00:00:00');
    // Pending planned payments due within the period, converted with today's rates
    const actionedKeys = new Set(recurringOccurrences.map(o => `${o.recurring_payment_id}|${o.due_date.slice(0, 10)}`));
    let plannedIncome = 0;
    let plannedExpense = 0;
    for (const p of recurringPayments) {
      for (const date of generateDueDates(p, from, to)) {
        if (actionedKeys.has(`${p.id}|${recurringIsoDate(date)}`)) continue;
        const amount = toHUF(p.amount, p.wallet?.currency, todayRates);
        if (p.type === 'income') plannedIncome += amount;
        if (p.type === 'expense') plannedExpense += amount;
      }
    }
    return { plannedIncome, plannedExpense };
  }, [period, recurringPayments, recurringOccurrences, todayRates]);

  // ── Expenses by category ───────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, { amount: number; icon: string; color: string }>();
    for (const t of periodTxs) {
      if (t.type !== 'expense') continue;
      const name = t.category?.name ?? 'Uncategorised';
      const prev = map.get(name) ?? { amount: 0, icon: t.category?.icon ?? '📁', color: t.category?.color ?? OTHER_COLOR };
      map.set(name, { ...prev, amount: prev.amount + huf(t) });
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.amount, 0);
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, v], i) => ({
        name,
        icon: v.icon,
        amount: v.amount,
        color: v.color !== OTHER_COLOR ? v.color : PALETTE[i % PALETTE.length],
        share: total > 0 ? v.amount / total : 0,
      }));
    const main = rows.filter(r => r.amount >= OTHER_THRESHOLD_HUF);
    const small = rows.filter(r => r.amount < OTHER_THRESHOLD_HUF);
    const otherAmount = small.reduce((s, r) => s + r.amount, 0);
    return {
      total,
      categoryCount: rows.length,
      main,
      small,
      other: small.length > 0 ? { amount: otherAmount, share: total > 0 ? otherAmount / total : 0 } : null,
      maxAmount: Math.max(1, ...main.map(r => r.amount)),
    };
  }, [periodTxs, huf]);

  // ── Period comparison ──────────────────────────────────────────────────
  const comparisonData = useMemo(() => {
    const catMap = new Map<string, { current: number; prev: number; icon: string; color: string }>();
    const add = (t: Transaction, key: 'current' | 'prev') => {
      if (t.type !== 'expense') return;
      const name = t.category?.name ?? 'Uncategorised';
      const entry = catMap.get(name) ?? { current: 0, prev: 0, icon: t.category?.icon ?? '📁', color: t.category?.color ?? OTHER_COLOR };
      entry[key] += huf(t);
      catMap.set(name, entry);
    };
    periodTxs.forEach(t => add(t, 'current'));
    prevTxs.forEach(t => add(t, 'prev'));
    return Array.from(catMap.entries())
      .sort((a, b) => (b[1].current + b[1].prev) - (a[1].current + a[1].prev))
      .slice(0, 10)
      .map(([name, v]) => ({ name, icon: v.icon, color: v.color, current: Math.round(v.current), prev: Math.round(v.prev) }));
  }, [periodTxs, prevTxs, huf]);

  // ── Predicted transactions ─────────────────────────────────────────────
  // Learns a per-category (and, where one payer dominates, per-payer) pattern
  // from the last 6 full calendar months, then scales it onto the selected
  // period (1× for a month, 12× for a year).
  const predictions = useMemo(() => {
    if (!historyRange) return { income: [] as PredictionItem[], expense: [] as PredictionItem[] };

    const histFrom = new Date(historyRange.from + 'T00:00:00');
    const histStartMonth = histFrom.getFullYear() * 12 + histFrom.getMonth();
    const scale = periodLengthInMonths(period.from, period.to);

    type Group = {
      name: string;
      icon: string;
      color: string;
      type: TransactionType;
      totalCount: number;
      buckets: Map<number, number>; // bucket index -> HUF sum
      payerCounts: Map<string, number>;
    };
    const map = new Map<string, Group>();

    for (const t of historyTxs) {
      const key = `${t.type}|${t.category_id ?? 'none'}`;
      const g = map.get(key) ?? {
        name: t.category?.name ?? 'Uncategorised',
        icon: t.category?.icon ?? '📁',
        color: t.category?.color ?? OTHER_COLOR,
        type: t.type,
        totalCount: 0,
        buckets: new Map<number, number>(),
        payerCounts: new Map<string, number>(),
      };
      const txDate = new Date(t.date + 'T00:00:00');
      const bucketIdx = txDate.getFullYear() * 12 + txDate.getMonth() - histStartMonth;
      if (bucketIdx < 0 || bucketIdx >= HISTORY_MONTHS) continue;
      g.buckets.set(bucketIdx, (g.buckets.get(bucketIdx) ?? 0) + huf(t));
      g.totalCount += 1;
      if (t.payer) g.payerCounts.set(t.payer, (g.payerCounts.get(t.payer) ?? 0) + 1);
      map.set(key, g);
    }

    const items: PredictionItem[] = [];
    for (const [key, g] of map) {
      const bucketsSeen = g.buckets.size;
      const samples = Array.from(g.buckets.values()).filter(v => v > 0);
      if (bucketsSeen < MIN_BUCKETS_SEEN || samples.length === 0) continue;

      const { mean, cv } = sampleStats(samples);
      if (mean <= 0) continue;

      const isAggregate = g.totalCount / bucketsSeen > 1.3;
      let title = g.name;
      if (!isAggregate) {
        let dominantPayer: string | null = null;
        let dominantCount = 0;
        for (const [payer, count] of g.payerCounts) {
          if (count > dominantCount) { dominantPayer = payer; dominantCount = count; }
        }
        if (dominantPayer && dominantCount / g.totalCount >= 0.6) title = `${g.name} — ${dominantPayer}`;
      }
      const subtitle = isAggregate
        ? `${g.totalCount} entries / ${HISTORY_MONTHS} months`
        : `seen ${bucketsSeen} of ${HISTORY_MONTHS} months`;

      const presenceRatio = bucketsSeen / HISTORY_MONTHS;
      const consistency = Math.max(0, 1 - cv);
      const confidencePct = Math.max(1, Math.min(99, Math.round(100 * (0.55 * presenceRatio + 0.45 * consistency))));

      items.push({
        key,
        title,
        subtitle,
        type: g.type,
        icon: g.icon,
        color: g.color,
        confidencePct,
        predictedAmount: mean * scale,
        isStable: cv <= 0.08,
        rangeLow: Math.min(...samples) * scale,
        rangeHigh: Math.max(...samples) * scale,
      });
    }

    // Rank by how reliable a pattern is (confidence, then typical amount)
    const byReliability = (a: PredictionItem, b: PredictionItem) =>
      b.confidencePct - a.confidencePct || b.predictedAmount - a.predictedAmount;

    return {
      income: items.filter(i => i.type === 'income').sort(byReliability).slice(0, MAX_PREDICTIONS_PER_TYPE),
      expense: items.filter(i => i.type === 'expense').sort(byReliability).slice(0, MAX_PREDICTIONS_PER_TYPE),
    };
  }, [historyTxs, historyRange, period, huf]);

  const prevLabel = period.tab === 'months' ? 'previous month' : period.tab === 'years' ? 'previous year' : period.tab === 'weeks' ? 'previous week' : 'previous period';
  const prevName = prevPeriodName(period, prevLabel);

  // ── render helpers ─────────────────────────────────────────────────────
  function renderSummary() {
    if (loading) {
      return (
        <View style={styles.summaryGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.statHead}>
                <SkeletonBox style={{ width: 38, height: 38, borderRadius: 14 }} />
                <SkeletonBox style={{ width: 54, height: 11, borderRadius: 4 }} />
              </View>
              <SkeletonBox style={{ width: '80%', height: 24, borderRadius: 6 }} />
              <View style={[styles.divider, { backgroundColor: colors.border2 }]} />
              <SkeletonBox style={{ width: '70%', height: 12, borderRadius: 4 }} />
            </View>
          ))}
        </View>
      );
    }
    const projIncome = income + plannedIncome;
    const projExpense = expense + plannedExpense;
    const projNet = projIncome - projExpense;
    const net = income - expense;
    const hasPlanned = recurringPayments.length > 0 && (plannedIncome > 0 || plannedExpense > 0);
    return (
      <View style={styles.summaryGrid}>
        <StatCard
          colors={colors}
          icon="arrow-up"
          iconBg={colors.incomeLight}
          iconFg={colors.income}
          label="Income"
          amount={formatHUF(animatedIncome)}
          amountColor={colors.income}
          footer={hasPlanned && plannedIncome > 0
            ? { label: 'Projected', value: formatHUF(projIncome), color: colors.income, pct: progressPct(income, projIncome) }
            : 'No pending income'}
        />
        <StatCard
          colors={colors}
          icon="arrow-down"
          iconBg={colors.expenseLight}
          iconFg={colors.expense}
          label="Expenses"
          amount={formatHUF(animatedExpense)}
          amountColor={colors.expense}
          footer={hasPlanned
            ? { label: 'Projected', value: formatHUF(projExpense), color: colors.expense, pct: progressPct(expense, projExpense) }
            : 'No pending expenses'}
        />
        <StatCard
          colors={colors}
          icon="swap-horizontal"
          iconBg={colors.accentLight}
          iconFg={colors.accent}
          label="Net"
          amount={`${net >= 0 ? '+' : ''}${formatHUF(animatedNet)}`}
          amountColor={colors.text}
          footer={hasPlanned
            ? { label: 'Projected', value: `${projNet >= 0 ? '+' : ''}${formatHUF(projNet)}`, color: colors.accent, pct: progressPct(net, projNet) }
            : 'No projection'}
        />
        <StatCard
          colors={colors}
          icon="list"
          iconBg="#fdf1de"
          iconFg="#b3801f"
          label="Transactions"
          amount={String(animatedTxCount)}
          amountColor={colors.text}
          footer={`${expenseCount} expense · ${incomeCount} income`}
        />
      </View>
    );
  }

  function renderCategories() {
    const { main, small, other, maxAmount, total, categoryCount } = expenseBreakdown;
    const visible = showAllCategories ? main : main.slice(0, VISIBLE_CATEGORIES);
    const hiddenCount = main.length - VISIBLE_CATEGORIES;
    return (
      <Card colors={colors}>
        <View style={styles.cardHeader}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.heading }]}>Expenses by category</Text>
            <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{period.label}</Text>
          </View>
          {!loading && categoryCount > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.catTotalAmount, { color: colors.text }]}>{formatHUF(Math.round(total))}</Text>
              <Text style={[styles.catTotalCount, { color: colors.muted }]}>
                {categoryCount} {categoryCount === 1 ? 'category' : 'categories'}
              </Text>
            </View>
          )}
        </View>

        {loading ? (
          <>
            <SkeletonBox style={{ height: 20, borderRadius: 10 }} />
            {Array.from({ length: 5 }).map((_, i) => <SkeletonBox key={i} style={{ height: 44, borderRadius: 8 }} />)}
          </>
        ) : categoryCount === 0 ? (
          <EmptyHint icon="🍩" text="No expenses in this period." colors={colors} />
        ) : (
          <>
            <View style={styles.catStack} accessibilityLabel="Share of spending by category">
              {main.map(r => (
                <View key={r.name} style={[styles.catStackSegment, { flexGrow: r.amount, backgroundColor: r.color }]} />
              ))}
              {other && <View style={[styles.catStackSegment, { flexGrow: other.amount, backgroundColor: OTHER_COLOR }]} />}
            </View>

            {visible.map(r => (
              <View key={r.name} style={styles.catRow}>
                <EmojiTile emoji={r.icon} color={r.color} />
                <View style={styles.catMain}>
                  <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                  <View style={[styles.track, { backgroundColor: colors.border2 }]}>
                    <View style={[styles.fill, { width: `${(r.amount / maxAmount) * 100}%`, backgroundColor: r.color }]} />
                  </View>
                </View>
                <Text style={[styles.catPct, { color: colors.muted }]}>{formatShare(r.share)}</Text>
                <Text style={[styles.catAmount, { color: colors.text }]}>{formatHUF(Math.round(r.amount))}</Text>
              </View>
            ))}

            {hiddenCount > 0 && (
              <Pressable
                onPress={() => setShowAllCategories(v => !v)}
                style={[styles.moreBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.moreBtnText, { color: colors.text }]}>
                  {showAllCategories ? 'Show fewer categories' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'category' : 'categories'}`}
                </Text>
              </Pressable>
            )}

            {other && (
              <View style={main.length > 0 ? [styles.catOther, { borderTopColor: colors.border2 }] : undefined}>
                <Pressable style={styles.catRow} onPress={() => setOtherExpanded(v => !v)} accessibilityState={{ expanded: otherExpanded }}>
                  <EmojiTile emoji="📁" color={OTHER_COLOR} />
                  <View style={[styles.catMain, styles.catOtherLabel]}>
                    <Text style={[styles.catName, { color: colors.text }]}>Other</Text>
                    <Text style={[styles.catOtherHint, { color: colors.muted }]} numberOfLines={1}>
                      {small.length} under {formatHUF(OTHER_THRESHOLD_HUF)}
                    </Text>
                    <Ionicons name={otherExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
                  </View>
                  <Text style={[styles.catPct, { color: colors.muted }]}>{formatShare(other.share)}</Text>
                  <Text style={[styles.catAmount, { color: colors.text }]}>{formatHUF(Math.round(other.amount))}</Text>
                </Pressable>
                {otherExpanded && small.map(r => (
                  <View key={r.name} style={[styles.catRow, styles.catSubRow]}>
                    <EmojiTile emoji={r.icon} color={r.color} size={32} />
                    <Text style={[styles.catName, styles.catMain, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.catPct, { color: colors.muted }]}>{formatShare(r.share)}</Text>
                    <Text style={[styles.catAmount, { color: colors.text }]}>{formatHUF(Math.round(r.amount))}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </Card>
    );
  }

  function renderComparison() {
    const maxValue = Math.max(1, ...comparisonData.flatMap(c => [c.current, c.prev]));
    const total = changeInfo(expense, prevExpense);
    return (
      <Card colors={colors}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.heading }]}>Expense comparison by category</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{period.label} vs {prevLabel}</Text>
        </View>
        {!loading && comparisonData.length > 0 && (
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{period.label}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.accentBorder }]} />
              <Text style={[styles.legendText, { color: colors.muted }]}>{prevLabel}</Text>
            </View>
          </View>
        )}

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonBox key={i} style={{ height: 56, borderRadius: 8 }} />)
        ) : comparisonData.length === 0 ? (
          <EmptyHint icon="📊" text="No expense data to compare." colors={colors} />
        ) : (
          <>
            {comparisonData.map(c => {
              const change = changeInfo(c.current, c.prev);
              return (
                <View key={c.name} style={styles.compRow}>
                  <View style={styles.compTop}>
                    <EmojiTile emoji={c.icon} color={c.color} size={32} />
                    <Text style={[styles.compName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                    <ChangeBadge text={change.text} tone={change.tone} colors={colors} />
                  </View>
                  <View style={styles.compBottom}>
                    <View style={styles.compBars}>
                      <View style={[styles.track, { backgroundColor: colors.border2 }]}>
                        <View style={[styles.fill, { width: `${(c.current / maxValue) * 100}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.border2 }]}>
                        <View style={[styles.fill, { width: `${(c.prev / maxValue) * 100}%`, backgroundColor: colors.accentBorder }]} />
                      </View>
                    </View>
                    <View style={styles.compAmounts}>
                      <Text style={[styles.compAmountCurrent, { color: colors.text }]}>{formatHUF(c.current)}</Text>
                      <Text style={[styles.compAmountPrev, { color: colors.muted }]}>was {formatHUF(c.prev)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={[styles.compTotal, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.compTotalLabel, { color: colors.muted }]}>Total spent</Text>
              <View style={styles.compTotalFigures}>
                <Text style={[styles.compTotalAmount, { color: colors.text }]}>{formatHUF(Math.round(expense))}</Text>
                <ChangeBadge text={total.text} tone={total.tone} colors={colors} />
              </View>
              <Text style={[styles.compTotalPrev, { color: colors.muted }]}>
                vs {formatHUF(Math.round(prevExpense))} in {prevName}
              </Text>
            </View>
          </>
        )}
      </Card>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Statistics" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.container, { paddingBottom: TAB_BAR_HEIGHT + bottom + 16 }]}
      >
        <NetWorthCard summaries={walletSummaries} rates={todayRates} loading={loading && wallets.length === 0} />

        <PeriodPicker value={period} onChange={setPeriod} />

        {renderSummary()}
        {renderCategories()}
        {renderComparison()}

        <PredictionPanel variant="expense" title="Expected expenses" items={predictions.expense} loading={loading} colors={colors} />
        <PredictionPanel variant="income" title="Expected income" items={predictions.income} loading={loading} colors={colors} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardTitle: { fontSize: 19, fontFamily: 'Lora_700Bold', letterSpacing: -0.4 },
  cardSubtitle: { fontSize: 13, fontFamily: 'Nunito_700Bold', marginTop: 2 },

  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  divider: { height: 1 },

  // Summary
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 150,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statLabel: { flexShrink: 1, fontSize: 12, fontFamily: 'Nunito_700Bold' },
  statAmount: { fontSize: 22, fontFamily: 'Nunito_800ExtraBold', letterSpacing: -0.3 },
  statFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  statFooterLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statFooterLabel: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  statFooterValue: { flexShrink: 1, fontSize: 12, fontFamily: 'Nunito_800ExtraBold' },
  statFooterEmpty: { fontSize: 12, fontFamily: 'Nunito_600SemiBold' },

  // Expenses by category
  catTotalAmount: { fontSize: 16, fontFamily: 'Nunito_900Black', letterSpacing: -0.2 },
  catTotalCount: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  catStack: { flexDirection: 'row', gap: 3, height: 20, borderRadius: 10, overflow: 'hidden' },
  catStackSegment: { flexBasis: 0, minWidth: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catMain: { flex: 1, minWidth: 0, gap: 6 },
  catName: { fontSize: 14, fontFamily: 'Nunito_700Bold' },
  catPct: { width: 38, textAlign: 'right', fontSize: 12, fontFamily: 'Nunito_700Bold' },
  catAmount: { minWidth: 84, textAlign: 'right', fontSize: 14, fontFamily: 'Nunito_800ExtraBold' },
  moreBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 7 },
  moreBtnText: { fontSize: 13, fontFamily: 'Nunito_700Bold' },
  catOther: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
  catOtherLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catOtherHint: { flexShrink: 1, fontSize: 12, fontFamily: 'Nunito_600SemiBold' },
  catSubRow: { paddingLeft: 12 },

  // Comparison
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  compRow: { gap: 8 },
  compTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compName: { flex: 1, fontSize: 14, fontFamily: 'Nunito_700Bold' },
  compBottom: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 42 },
  compBars: { flex: 1, gap: 4 },
  compAmounts: { alignItems: 'flex-end', gap: 2 },
  compAmountCurrent: { fontSize: 14, fontFamily: 'Nunito_800ExtraBold' },
  compAmountPrev: { fontSize: 12, fontFamily: 'Nunito_600SemiBold' },
  badge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontFamily: 'Nunito_700Bold' },
  compTotal: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  compTotalLabel: { fontSize: 13, fontFamily: 'Nunito_700Bold' },
  compTotalFigures: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  compTotalAmount: { fontSize: 20, fontFamily: 'Nunito_900Black', letterSpacing: -0.3 },
  compTotalPrev: { fontSize: 12, fontFamily: 'Nunito_600SemiBold' },

  // Predictions
  predBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  predBannerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  predBannerTitle: { fontSize: 17, fontFamily: 'Lora_700Bold', letterSpacing: -0.3 },
  predBody: { padding: 16, gap: 18 },
  predRow: { gap: 8 },
  predTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  predMain: { flex: 1, minWidth: 0, gap: 2 },
  predTitle: { fontSize: 14, fontFamily: 'Nunito_700Bold' },
  predSubtitle: { fontSize: 12, fontFamily: 'Nunito_600SemiBold' },
  predConfRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  predConfTrack: { flex: 1, height: 4 },
  predConfLabel: { fontSize: 11, fontFamily: 'Nunito_700Bold' },
  predAmountCol: { alignItems: 'flex-end', gap: 2 },
  predAmount: { fontSize: 14, fontFamily: 'Nunito_800ExtraBold' },
  predRange: { fontSize: 11, fontFamily: 'Nunito_600SemiBold' },

  empty: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  emptyIcon: { fontFamily: 'Nunito_400Regular', fontSize: 28 },
  emptyText: { fontSize: 13, fontFamily: 'Nunito_600SemiBold', textAlign: 'center' },
});
