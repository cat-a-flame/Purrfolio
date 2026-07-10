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
import type { Label } from '@/lib/types';
import AppInput from '@/components/AppInput';

export default function LabelsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [labels, setLabels] = useState<Label[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('labels').select('*').eq('user_id', user.id).order('name');
    setLabels(data ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const q = search.trim().toLowerCase();
  const filtered = q ? labels.filter(l => l.name.toLowerCase().includes(q)) : labels;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <View style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color={colors.accent} />
            <Text style={[styles.back, { color: colors.accent }]}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Labels</Text>
        <TouchableOpacity onPress={() => router.push('/label/new')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <AppInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search labels…"
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

      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(`/label/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No labels yet.</Text>}
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, justifyContent: 'center' },
  searchClearBtn: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  rowName: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
});
