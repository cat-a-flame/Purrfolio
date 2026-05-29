import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  transaction: Transaction;
}

export default function TransactionRow({ transaction: tx }: Props) {
  const colors = useTheme();
  const isIncome = tx.type === 'income';
  const amountColor = isIncome ? colors.income : colors.expense;
  const currency = tx.wallet?.currency ?? 'HUF';

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.info}>
        <Text style={[styles.category, { color: colors.text }]}>
          {tx.category?.name ?? '—'}
        </Text>
        {tx.notes ? (
          <Text style={[styles.notes, { color: colors.muted }]} numberOfLines={1}>
            {tx.notes}
          </Text>
        ) : null}
        {tx.payer ? (
          <Text style={[styles.notes, { color: colors.muted }]}>{tx.payer}</Text>
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
          {isIncome ? '+' : '-'} {formatCurrency(tx.amount, currency)}
        </Text>
        <Text style={[styles.wallet, { color: colors.muted }]}>
          {tx.wallet?.name ?? ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 15,
    fontWeight: '600',
  },
  notes: {
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
    gap: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  wallet: {
    fontSize: 12,
  },
});
