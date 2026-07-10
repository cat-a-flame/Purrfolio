import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  transaction: Transaction;
  onPress?: () => void;
  onLongPress?: () => void;
  onIconPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
}

function TransactionsTransactionRow({ transaction: tx, onPress, onLongPress, onIconPress, selected = false, selectionMode = false }: Props) {
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
      ? tx.category.color + '30'
      : colors.border;

  return (
    <TouchableOpacity
      onPress={selectionMode ? () => onIconPress?.() : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: selected ? colors.accent + '18' : colors.surface, borderColor: selected ? colors.accent + '55' : colors.border }]}
    >
      <View style={[styles.wrapper]}>
        {/* Icon with coloured background — becomes checkbox in selection mode */}
        <TouchableOpacity
          onPress={onIconPress}
          activeOpacity={0.7}
          style={[styles.iconBox, { backgroundColor: selected ? colors.accent : '#fcf1ff' }]}
        >
          {selectionMode ? (
            selected
              ? <Ionicons name="checkmark" size={20} color="#fff" />
              : <Ionicons name="ellipse-outline" size={20} color={colors.muted} />
          ) : isTransfer ? (
            <Ionicons name="swap-horizontal-outline" size={20} color={colors.muted} />
          ) : icon ? (
            <Text style={styles.icon}>{icon}</Text>
          ) : (
            <Text style={[styles.iconFallback, { color: colors.muted }]}>?</Text>
          )}
        </TouchableOpacity>

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
            {/* Wallet: icon + name */}
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

        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amountPrefix}{formatCurrency(tx.amount, currency)}
          </Text>
        </View>
      </View>

      {tx.notes && tx.notes.length > 0 && (
        <View style={[styles.subtext]}>
          <Text style={[styles.sub, { color: colors.muted }]} numberOfLines={2}>
            {tx.notes}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default memo(TransactionsTransactionRow);

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 0,
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
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
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  amountCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  amount: {
    fontSize: 15,
    fontFamily: 'Figtree_700Bold',
  },
  walletLabelRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  subtext: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 4,
    flexWrap: 'wrap',
  }
});
