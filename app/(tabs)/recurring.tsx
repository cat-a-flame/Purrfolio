import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/CustomTabBar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import type { RecurringPayment, Wallet, Category } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function RecurringScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch base recurring payments without joins (avoids FK dependency issues)
    const [{ data: recurring }, { data: wallets }, { data: categories }] = await Promise.all([
      supabase
        .from('recurring_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('next_due_date', { ascending: true, nullsFirst: false }),
      supabase.from('wallets').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id),
    ]);

    const walletMap = new Map<string, Wallet>((wallets ?? []).map((w: Wallet) => [w.id, w]));
    const categoryMap = new Map<string, Category>((categories ?? []).map((c: Category) => [c.id, c]));

    const resolved = (recurring ?? []).map((r: any) => ({
      ...r,
      wallet: r.wallet_id ? walletMap.get(r.wallet_id) ?? null : null,
      category: r.category_id ? categoryMap.get(r.category_id) ?? null : null,
    }));

    setItems(resolved);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RecurringCard item={item} colors={colors} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View>
            <View style={styles.headerEscape}>
              <AppHeader />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Recurring</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.muted }]}>No recurring payments.</Text>
        }
        ListFooterComponent={<View style={{ height: TAB_BAR_HEIGHT + bottom + 16 }} />}
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
  const statusLabel = isOverdue ? 'Overdue' : isDueSoon ? 'Due soon' : 'Due';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isOverdue ? colors.danger + '66' : colors.border }]}>
      <View style={styles.cardMain}>
        <View style={styles.cardLeft}>
          {item.category?.icon ? (
            <Text style={styles.categoryIcon}>{item.category.icon}</Text>
          ) : null}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.name}</Text>
            {item.category && (
              <Text style={[styles.cardSub, { color: colors.muted }]}>{item.category.name}</Text>
            )}
            {item.wallet && (
              <Text style={[styles.cardSub, { color: colors.muted }]}>
                {item.wallet.icon ? `${item.wallet.icon} ` : ''}{item.wallet.name}
              </Text>
            )}
            {item.notes ? (
              <Text style={[styles.cardSub, { color: colors.muted }]} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardAmount, { color: colors.expense }]}>
            -{formatCurrency(item.amount, currency)}
          </Text>
          <Text style={[styles.cardFreq, { color: colors.muted }]}>{item.frequency}</Text>
        </View>
      </View>
      {item.next_due_date && (
        <View style={[styles.dueRow, { borderTopColor: colors.border }]}>
          <View style={[styles.dueBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.dueText, { color: statusColor }]}>
              {statusLabel}: {formatDate(item.next_due_date)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: 16 },
  headerEscape: { marginHorizontal: -16 },
  title: { fontSize: 26, fontWeight: '800', marginTop: 16, marginBottom: 16 },
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
    gap: 10,
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  categoryIcon: {
    fontSize: 22,
    paddingTop: 2,
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
  dueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dueText: { fontSize: 13, fontWeight: '500' },
});
