import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@/lib/types';
import AppInput from '@/components/AppInput';

export default function CategoriesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    setCategories(data ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Group into parents with children
  const parentMap = new Map<string, Category[]>();
  const rootCats: Category[] = [];
  for (const c of categories) {
    if (!c.parent_id) {
      rootCats.push(c);
    } else {
      if (!parentMap.has(c.parent_id)) parentMap.set(c.parent_id, []);
      parentMap.get(c.parent_id)!.push(c);
    }
  }

  const q = search.trim().toLowerCase();

  type ListEntry = { kind: 'parent'; cat: Category; childCount: number } | { kind: 'child'; cat: Category };
  const flat: ListEntry[] = [];

  for (const p of rootCats) {
    const children = parentMap.get(p.id) ?? [];
    if (q) {
      const parentMatches = p.name.toLowerCase().includes(q) || p.icon.toLowerCase().includes(q);
      const matchingChildren = children.filter(c => c.name.toLowerCase().includes(q) || c.icon.toLowerCase().includes(q));
      if (parentMatches || matchingChildren.length > 0) {
        flat.push({ kind: 'parent', cat: p, childCount: children.length });
        const childrenToShow = parentMatches ? children : matchingChildren;
        for (const c of childrenToShow) flat.push({ kind: 'child', cat: c });
      }
    } else {
      flat.push({ kind: 'parent', cat: p, childCount: children.length });
      if (expandedIds.has(p.id)) {
        for (const c of children) flat.push({ kind: 'child', cat: c });
      }
    }
  }

  // Orphan children (parent not listed)
  for (const [pid, children] of parentMap) {
    if (!rootCats.find((p) => p.id === pid)) {
      for (const c of children) {
        if (!q || c.name.toLowerCase().includes(q) || c.icon.toLowerCase().includes(q)) {
          flat.push({ kind: 'child', cat: c });
        }
      }
    }
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
        <Text style={[styles.title, { color: colors.text }]}>Categories</Text>
        <TouchableOpacity onPress={() => router.push('/category/add')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <AppInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories…"
        />
      </View>

      <FlatList
        data={flat}
        keyExtractor={(i) => i.cat.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'parent') {
            const isExpanded = expandedIds.has(item.cat.id);
            const hasChildren = item.childCount > 0;
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => hasChildren ? toggleExpand(item.cat.id) : router.push(`/category/${item.cat.id}`)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 18 }}>{item.cat.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.text }]}>{item.cat.name}</Text>
                  <Text style={[styles.rowSub, { color: colors.muted }]}>{item.cat.type}</Text>
                </View>
                {item.cat.is_default && (
                  <View style={[styles.badge, { backgroundColor: colors.muted + '22' }]}>
                    <Text style={[styles.badgeText, { color: colors.muted }]}>Default</Text>
                  </View>
                )}
                {hasChildren && !q && (
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.muted}
                  />
                )}
                {hasChildren && (
                  <TouchableOpacity
                    onPress={() => router.push(`/category/${item.cat.id}`)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, marginLeft: 24 }]}
              onPress={() => router.push(`/category/${item.cat.id}`)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 18 }}>{item.cat.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.text }]}>{item.cat.name}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>{item.cat.type}</Text>
              </View>
              {item.cat.is_default && (
                <View style={[styles.badge, { backgroundColor: colors.muted + '22' }]}>
                  <Text style={[styles.badgeText, { color: colors.muted }]}>Default</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No categories yet.</Text>}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
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
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  add: { fontSize: 15 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  rowSub: { fontSize: 12, textTransform: 'capitalize' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 11, fontFamily: 'Figtree_600SemiBold' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
