import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@/lib/types';
import AppInput from '@/components/AppInput';
import SkeletonBox from '@/components/SkeletonBox';

type CategoryWithChildren = Category & { children: Category[] };

export default function CategoriesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
    setCategories(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const topLevel: CategoryWithChildren[] = categories
    .filter(c => !c.parent_id)
    .map(c => ({ ...c, children: categories.filter(x => x.parent_id === c.id) }));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? topLevel.filter(c => c.name.toLowerCase().includes(q) || c.children.some(ch => ch.name.toLowerCase().includes(q)))
    : topLevel;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <View style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color={colors.accent} />
            <Text style={[styles.back, { color: colors.accent }]}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Categories</Text>
        <TouchableOpacity onPress={() => router.push('/category/new')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <AppInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories…"
          style={search ? { paddingRight: 36 } : undefined}
        />
        {search ? (
          <TouchableOpacity
            onPress={() => setSearch('')}
            style={styles.searchClearBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SkeletonBox style={{ width: 50, height: 50, borderRadius: 14 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonBox style={{ height: 15, width: '60%', borderRadius: 4 }} />
              </View>
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏷️</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No categories yet</Text>
          <Text style={[styles.emptyHint, { color: colors.muted }]}>Tap the + button to organize your spending.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(`/category/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconTile, { backgroundColor: (item.color || colors.accent) + '40' }]}>
                <Text style={styles.iconEmoji}>{item.icon || '📁'}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.subLabel, { color: colors.muted }]}>
                  {item.children.length ? `${item.children.length} subcategories` : 'No subcategories'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
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
  back: { fontSize: 15 },
  title: { fontSize: 18, fontFamily: 'Figtree_700Bold' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, justifyContent: 'center' },
  searchClearBtn: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconTile: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 24 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  subLabel: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 32 },
  emptyIcon: { fontSize: 32, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
});
