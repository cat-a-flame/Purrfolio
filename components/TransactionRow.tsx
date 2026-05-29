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
  const isTransfer = !!tx.transfer_group_id;
  const isIncome = tx.type === 'income';
  const currency = tx.wallet?.currency ?? 'HUF';

  const amountColor = isTransfer ? colors.accent : isIncome ? colors.income : colors.expense;
  const amountPrefix = isTransfer
    ? (tx.type === 'expense' ? '−' : '+')
    : (isIncome ? '+' : '−');

  const icon = isTransfer ? '↔' : (tx.category?.icon ?? null);
  const label = isTransfer ? 'Transfer' : (tx.category?.name ?? '—');

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.iconCol}>
        {icon ? (
          <Text style={styles.icon}>{icon}</Text>
        ) : (
          <View style={[styles.iconPlaceholder, { backgroundColor: colors.border }]} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.category, { color: colors.text }]}>{label}</Text>
        {tx.wallet ? (
          <Text style={[styles.sub, { color: colors.muted }]}>
            {tx.wallet.icon ? `${tx.wallet.icon} ` : ''}{tx.wallet.name}
          </Text>
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
  iconCol: {
    paddingTop: 2,
  },
  icon: {
    fontSize: 22,
  },
  iconPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 15,
    fontWeight: '600',
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
    paddingTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
