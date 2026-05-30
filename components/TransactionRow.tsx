import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  transaction: Transaction;
}

export default function TransactionRow({ transaction: tx }: Props) {
  const colors = useTheme();
  const isTransfer = !!tx.transfer_group_id;
  const isIncome = tx.type === 'income';
  const currency = tx.wallet?.currency ?? 'HUF';

  // Transfers are neutral: no sign, muted colour (contrast ≥ 4.5:1 on surface in both themes)
  const amountColor = isTransfer ? colors.muted : isIncome ? colors.income : colors.expense;
  const amountPrefix = isTransfer ? '' : isIncome ? '+' : '−';

  const icon = isTransfer ? null : (tx.category?.icon ?? null);
  const label = isTransfer ? 'Transfer' : (tx.category?.name ?? '—');

  // Icon box background: 20% opacity tint of the category colour, or a neutral fallback
  const iconBg = isTransfer
    ? colors.muted + '30'
    : tx.category?.color
      ? tx.category.color + '30'
      : colors.border;

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Icon with coloured background */}
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        {isTransfer ? (
          <Ionicons name="swap-horizontal-outline" size={20} color={colors.muted} />
        ) : icon ? (
          <Text style={styles.icon}>{icon}</Text>
        ) : (
          <Text style={[styles.iconFallback, { color: colors.muted }]}>?</Text>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.category, { color: colors.text }]}>{label}</Text>

        {/* Wallet: coloured dot + name */}
        {tx.wallet ? (
          <View style={styles.walletRow}>
            <View style={[styles.walletDot, { backgroundColor: tx.wallet.color || colors.muted }]} />
            <Text style={[styles.sub, { color: colors.muted }]}>{tx.wallet.name}</Text>
          </View>
        ) : null}

        {tx.notes ? (
          <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>
            {tx.notes}
          </Text>
        ) : null}
        {tx.payer ? (
          <Text style={[styles.sub, { color: colors.muted }]}>{tx.payer}</Text>
        ) : null}
        {tx.labels && tx.labels.length > 0 && (
          <View style={styles.labels}>
            {tx.labels.map((l) => (
              <View key={l.id} style={[styles.labelChip, { backgroundColor: l.color + '33' }]}>
                <Text style={[styles.labelText, { color: l.color }]}>{l.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.amountCol}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {amountPrefix}{formatCurrency(tx.amount, currency)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
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
  iconFallback: { fontSize: 16, fontWeight: '600' },
  info: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 15,
    fontWeight: '600',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sub: {
    fontSize: 13,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  labelChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '500',
  },
  amountCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
