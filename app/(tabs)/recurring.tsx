import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { RecurringPayment } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function RecurringScreen() {
  const colors = useTheme();
  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('recurring_payments')
      .select('*, wallet:wallets(*), category:categories(*)')
      .eq('user_id', user.id)
      .order('next_due_date', { ascending: true });
    setItems(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RecurringCard item={item} colors={colors} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <Text style={[styles.title, { color: colors.text }]}>Recurring</Text>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No recurring payments.</Text>
        }
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
    </SafeAreaView>
  );
}

function RecurringCard({ item, colors }: { item: RecurringPayment; colors: any }) {
  const currency = item.wallet?.currency ?? 'HUF';
  const now = new Date();
  const dueDate = item.next_due_date ? new Date(item.next_due_date) : null;
  const isOverdue = dueDate ? dueDate < now : false;
  const isDueSoon = dueDate
    ? !isOverdue && dueDate.getTime() - now.getTime() < 7 * 24 * 3600 * 1000
    : false;

  const statusColor = isOverdue ? colors.danger : isDueSoon ? '#f59e0b' : colors.muted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardMain}>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: colors.text }]}>{item.name}</Text>
          {item.category && (
            <Text style={[styles.cardSub, { color: colors.muted }]}>{item.category.name}</Text>
          )}
          {item.notes && (
            <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
              {item.notes}
            </Text>
          )}
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardAmount, { color: colors.expense }]}>
            {formatCurrency(item.amount, currency)}
          </Text>
          <Text style={[styles.cardFreq, { color: colors.muted }]}>{item.frequency}</Text>
        </View>
      </View>
      {item.next_due_date && (
        <View style={[styles.dueRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.dueText, { color: statusColor }]}>
            {isOverdue ? 'Overdue' : 'Due'}: {formatDate(item.next_due_date)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 16 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    gap: 8,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '600' },
  cardSub: { fontSize: 13 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  cardAmount: { fontSize: 16, fontWeight: '700' },
  cardFreq: { fontSize: 12, textTransform: 'capitalize' },
  dueRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  dueText: { fontSize: 13, fontWeight: '500' },
});
