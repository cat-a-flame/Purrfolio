import { View, Text, StyleSheet } from 'react-native';
import { useDarkMode, useTheme } from '@/lib/theme';
import { toBase, type Rates } from '@/lib/exchange';
import { useBaseCurrency, useFormatBase } from '@/lib/baseCurrencyContext';
import { formatCurrency } from '@/lib/utils';
import type { AccountType, Wallet } from '@/lib/types';
import EmojiTile from '@/components/EmojiTile';
import SkeletonBox from '@/components/SkeletonBox';

// Port of PurrfolioWeb/components/dashboard/AccountsOverview.tsx: net worth in
// the base currency, a proportion bar, and the accounts grouped by account type.

type GroupKey = 'cash' | 'bonds' | 'investments' | 'other';

const GROUPS: { key: GroupKey; label: string; types: AccountType[] }[] = [
  { key: 'cash', label: 'Cash & bank', types: ['bank', 'cash', 'savings', 'credit_card'] },
  { key: 'bonds', label: 'Bonds', types: ['bond'] },
  { key: 'investments', label: 'Investments', types: ['investment', 'crypto'] },
  { key: 'other', label: 'Other', types: ['other'] },
];

const GROUP_COLORS_LIGHT: Record<GroupKey, string> = { cash: '#1fae8a', bonds: '#e08c3a', investments: '#8b6fd6', other: '#9a8fb2' };
const GROUP_COLORS_DARK: Record<GroupKey, string> = { cash: '#3fd6ad', bonds: '#f5a55a', investments: '#a78bfa', other: '#7d71a0' };

export interface WalletSummary {
  wallet: Wallet;
  balance: number;
}

function groupFor(wallet: Wallet): GroupKey {
  // Wallets created before account types existed have no type; treat them as bank accounts.
  const type = wallet.type ?? 'bank';
  return GROUPS.find(g => g.types.includes(type))?.key ?? 'other';
}

interface Props {
  summaries: WalletSummary[];
  /** Current exchange rates, base currency per 1 unit of each foreign currency. */
  rates: Rates;
  loading: boolean;
}

export default function NetWorthCard({ summaries, rates, loading }: Props) {
  const baseCurrency = useBaseCurrency();
  const formatBase = useFormatBase();
  const colors = useTheme();
  const { isDark } = useDarkMode();
  const groupColors = isDark ? GROUP_COLORS_DARK : GROUP_COLORS_LIGHT;
  const cardStyle = [styles.card, { backgroundColor: colors.glassStrong, borderColor: colors.glassBorder, shadowColor: colors.shadow }];

  if (loading) {
    return (
      <View style={cardStyle}>
        <SkeletonBox style={{ width: 180, height: 16, borderRadius: 4 }} />
        <SkeletonBox style={{ width: '100%', height: 6, borderRadius: 3 }} />
        {Array.from({ length: 2 }).map((_, i) => (
          <View key={i} style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border2 }]}>
            <SkeletonBox style={{ width: '50%', height: 14, borderRadius: 4 }} />
            {Array.from({ length: 2 }).map((__, j) => (
              <View key={j} style={styles.row}>
                <SkeletonBox style={{ width: 38, height: 38, borderRadius: 10 }} />
                <SkeletonBox style={{ width: '45%', height: 12, borderRadius: 4 }} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (summaries.length === 0) return null;

  const groups = GROUPS.map(g => {
    const items = summaries.filter(s => groupFor(s.wallet) === g.key);
    const total = items.reduce((sum, s) => sum + toBase(s.balance, s.wallet.currency, rates, baseCurrency), 0);
    const approximate = items.some(s => s.wallet.currency !== baseCurrency);
    return { ...g, items, total, approximate };
  }).filter(g => g.items.length > 0);

  const netWorth = groups.reduce((sum, g) => sum + g.total, 0);
  const netApproximate = groups.some(g => g.approximate);
  const barTotal = groups.reduce((sum, g) => sum + Math.max(0, g.total), 0);

  const money = (text: string, approximate: boolean) => `${approximate ? '≈ ' : ''}${text}`;

  return (
    <View style={cardStyle} accessibilityLabel="Accounts">
      <View style={styles.header}>
        <Text style={[styles.headerLabel, { color: colors.muted }]}>Net worth</Text>
        <Text style={[styles.headerValue, { color: colors.text }]} numberOfLines={1}>
          {money(formatBase(netWorth), netApproximate)}
        </Text>
      </View>

      {barTotal > 0 && (
        <View style={styles.bar} accessibilityLabel="Share of net worth by account group">
          {groups.filter(g => g.total > 0).map(g => (
            <View key={g.key} style={[styles.segment, { flexGrow: g.total / barTotal, backgroundColor: groupColors[g.key] }]} />
          ))}
        </View>
      )}

      {groups.map(g => (
        <View key={g.key} style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border2 }]}>
          <View style={[styles.groupHeader, { borderBottomColor: colors.border2 }]}>
            <View style={styles.groupTitleWrap}>
              <View style={[styles.dot, { backgroundColor: groupColors[g.key] }]} />
              <Text style={[styles.groupTitle, { color: colors.text }]} numberOfLines={1}>{g.label}</Text>
            </View>
            <Text style={[styles.groupTotal, { color: colors.text }]}>{money(formatBase(g.total), g.approximate)}</Text>
          </View>
          {g.items.map(({ wallet, balance }) => (
            <View key={wallet.id} style={styles.row}>
              <EmojiTile emoji={wallet.icon || '💰'} color={wallet.color} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{wallet.name}</Text>
              <Text style={[styles.amount, { color: colors.text }]}>{formatCurrency(balance, wallet.currency)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  headerLabel: { fontSize: 15, fontFamily: 'Nunito_700Bold' },
  headerValue: { fontSize: 16, fontFamily: 'Nunito_900Black', letterSpacing: -0.2 },
  bar: { flexDirection: 'row', gap: 4, height: 6 },
  segment: { flexBasis: 0, minWidth: 6, borderRadius: 3 },
  group: { gap: 12, borderWidth: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  groupTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: 15, fontFamily: 'Nunito_800ExtraBold', flexShrink: 1 },
  groupTotal: { fontSize: 15, fontFamily: 'Nunito_900Black', letterSpacing: -0.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, fontSize: 15, fontFamily: 'Nunito_700Bold' },
  amount: { fontSize: 15, fontFamily: 'Nunito_800ExtraBold' },
});
