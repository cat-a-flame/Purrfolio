import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  transaction: Transaction;
  onPress?: () => void;
}

export default function DashboardTransactionRow({ transaction: tx, onPress }: Props) {
  const colors = useTheme();
  const isTransfer = !!tx.transfer_group_id;
  const isIncome = tx.type === 'income';
  const currency = tx.wallet?.currency ?? 'HUF';

  const amountColor = isTransfer ? colors.muted : isIncome ? colors.income : colors.expense;
  const amountPrefix = isIncome ? '+' : '−';

  const icon = isTransfer ? null : (tx.category?.icon ?? null);
  const label = isTransfer ? 'Transfer' : (tx.category?.name ?? '—');

  // Icon box background: 20% opacity tint of the category colour, or a neutral fallback
  const iconBg = isTransfer
    ? colors.muted + '30'
    : tx.category?.color
      ? tx.category.color + '20'
      : colors.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.row, { backgroundColor: colors.surface, borderWidth: 0 }]}
    >
      {/* Icon with coloured background */}
      <View style={[styles.iconBox, { backgroundColor: colors.bg2 }]}>
        {isTransfer ? (
          <Ionicons name="swap-horizontal-outline" size={20} color={colors.muted} />
        ) : icon ? (
          <Text style={styles.icon}>{icon}</Text>
        ) : (
          <Text style={[styles.iconFallback, { color: colors.muted }]}>?</Text>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.categoryRow}>
          <Text style={[styles.category, { color: colors.text }]}>{label}</Text>
          {tx.labels && tx.labels.length > 0 && tx.labels.map((l) => (
            <View key={l.id} style={styles.labelChip}>
              <Ionicons name="pricetag" size={12} color={colors.muted} />
              <Text style={[styles.labelText, { color: colors.muted }]}>{l.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.walletLabelRow}>
          {tx.wallet ? (
            <View style={styles.walletRow}>
              <Ionicons name="wallet" size={12} color={colors.muted} />
              <Text style={[styles.sub, { color: colors.muted }]}>{tx.wallet.name}</Text>
            </View>
          ) : null}
          {tx.payer ? (
            <View style={styles.walletRow}>
              <Text style={[styles.sub, { color: colors.muted }]}>•</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>{tx.payer}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={[styles.amount, { color: amountColor }]}>
        {amountPrefix}{formatCurrency(tx.amount, currency)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 0,
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  iconFallback: { fontSize: 16, fontFamily: 'Figtree_600SemiBold' },
  info: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sub: {
    fontSize: 13,
  },
  labelChip: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelText: {
    fontSize: 13,
  },
  amount: {
    fontSize: 15,
    fontFamily: 'Figtree_700Bold',
  },
  walletRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  walletLabelRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
}
});
