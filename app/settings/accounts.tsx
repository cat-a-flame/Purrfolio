import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Events } from '@/lib/events';
import { fetchWalletBalanceSums } from '@/lib/fetchWalletBalanceSums';
import { formatCurrency, ACCOUNT_TYPE_LABELS } from '@/lib/utils';
import type { Wallet } from '@/lib/types';

export default function AccountsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data }, sums] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false }),
      fetchWalletBalanceSums(user.id),
    ]);
    const list = (data ?? []) as Wallet[];
    const map = new Map<string, number>();
    for (const w of list) {
      const s = sums.get(w.id) ?? { income: 0, expense: 0 };
      map.set(w.id, (w.starting_balance ?? 0) + s.income - s.expense);
    }
    setWallets(list);
    setBalances(map);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => Events.on('wallet-saved', () => { load(); }), [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const active = wallets.filter((w) => !w.is_archived);
  const archived = wallets.filter((w) => w.is_archived);

  function renderWallet(w: Wallet) {
    const balance = balances.get(w.id) ?? 0;
    const balColor = w.is_archived ? colors.muted : (balance >= 0 ? colors.income : colors.expense);
    return (
      <TouchableOpacity
        key={w.id}
        activeOpacity={0.7}
        onPress={() => router.push(`/wallet/${w.id}` as any)}
        style={[styles.walletCard, { backgroundColor: colors.surface }, w.is_archived && { opacity: 0.6 }]}
      >
        <View style={[styles.walletIcon, { backgroundColor: '#fcf1ff' }]}>
          {w.icon
            ? <Text style={{ fontFamily: 'Nunito_400Regular', fontSize: 22 }}>{w.icon}</Text>
            : <View style={[styles.walletIconFallback, { backgroundColor: colors.border }]} />}
        </View>
        <View style={styles.walletInfo}>
          <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
          <Text style={[styles.walletSub, { color: colors.muted }]}>
            {ACCOUNT_TYPE_LABELS[w.type ?? 'bank'] ?? ACCOUNT_TYPE_LABELS.other} · {w.currency}
          </Text>
        </View>
        {w.is_archived ? (
          <View style={[styles.badge, { backgroundColor: colors.muted + '22' }]}>
            <Text style={[styles.badgeText, { color: colors.muted }]}>Archived</Text>
          </View>
        ) : w.is_default ? (
          <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>Default</Text>
          </View>
        ) : null}
        <Text style={[styles.walletBalance, { color: balColor }]}>
          {balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(balance), w.currency)}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <View style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color={colors.accent} />
            <Text style={[styles.back, { color: colors.accent }]}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Accounts</Text>
        <TouchableOpacity onPress={() => router.push('/wallet/new')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {active.map(renderWallet)}
        {archived.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Archived</Text>
            {archived.map(renderWallet)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { fontFamily: 'Nunito_400Regular', fontSize: 15 },
  title: { fontSize: 18, fontFamily: 'Lora_700Bold' },
  list: { padding: 16, gap: 16 },
  sectionLabel: { fontSize: 11, fontFamily: 'Nunito_700Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    gap: 8,
    paddingHorizontal: 12,
  },
  walletIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  walletIconFallback: { width: 28, height: 28, borderRadius: 8 },
  walletInfo: { flex: 1, paddingVertical: 14, gap: 2 },
  walletName: { fontSize: 15, fontFamily: 'Nunito_700Bold' },
  walletSub: { fontSize: 12, fontFamily: 'Nunito_500Medium' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Nunito_600SemiBold' },
  walletBalance: { fontSize: 16, fontFamily: 'Nunito_800ExtraBold' },
});
