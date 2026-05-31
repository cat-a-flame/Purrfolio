import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Category, TransactionType } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';

const TYPES = ['expense', 'income', 'both'] as const;

type CatForm = {
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  parent_id: string;
};
const DEFAULT_FORM: CatForm = { name: '', type: 'expense', icon: '📁', color: '#f26e4d', parent_id: '' };

export default function CategoriesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [form, setForm] = useState<CatForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  const parents = categories.filter((c) => !c.parent_id);

  function openAdd() {
    setForm(DEFAULT_FORM);
    setAddVisible(true);
  }

  function openEdit(c: Category) {
    setEditCat(c);
    setForm({
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      parent_id: c.parent_id ?? '',
    });
  }

  function setField<K extends keyof CatForm>(key: K, value: CatForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      icon: form.icon,
      color: form.parent_id ? '' : form.color,
      parent_id: form.parent_id || null,
    };

    if (editCat) {
      await supabase.from('categories').update(payload).eq('id', editCat.id);
    } else {
      await supabase.from('categories').insert({ ...payload, user_id: user.id });
    }

    setSaving(false);
    setAddVisible(false);
    setEditCat(null);
    load();
  }

  async function handleDelete() {
    if (!editCat || editCat.is_default) return;
    Alert.alert('Delete category', `Delete "${editCat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('categories').delete().eq('id', editCat.id);
          setEditCat(null);
          load();
        },
      },
    ]);
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

  type ListEntry = { kind: 'parent'; cat: Category } | { kind: 'child'; cat: Category };
  const flat: ListEntry[] = [];
  for (const p of rootCats) {
    flat.push({ kind: 'parent', cat: p });
    for (const c of parentMap.get(p.id) ?? []) {
      flat.push({ kind: 'child', cat: c });
    }
  }
  // Orphan children (parent not listed)
  for (const [pid, children] of parentMap) {
    if (!rootCats.find((p) => p.id === pid)) {
      for (const c of children) flat.push({ kind: 'child', cat: c });
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
        <TouchableOpacity onPress={openAdd}>
          <View style={styles.addRow}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={[styles.add, { color: colors.accent }]}>Add</Text>
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={flat}
        keyExtractor={(i) => i.cat.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
              item.kind === 'child' && { marginLeft: 24 },
            ]}
            onPress={() => openEdit(item.cat)}
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
        )}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No categories yet.</Text>}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      <BottomModal visible={addVisible} onClose={() => setAddVisible(false)} title="Add category">
        <CatFormFields form={form} setField={setField} parents={parents} colors={colors} />
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </BottomModal>

      <BottomModal visible={!!editCat} onClose={() => setEditCat(null)} title="Edit category">
        <CatFormFields form={form} setField={setField} parents={parents.filter((p) => p.id !== editCat?.id)} colors={colors} />
        <View style={styles.modalActions}>
          {editCat && !editCat.is_default && (
            <AppButton onPress={handleDelete} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          )}
          <AppButton onPress={handleSave} loading={saving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </BottomModal>
    </SafeAreaView>
  );
}

function CatFormFields({
  form,
  setField,
  parents,
  colors,
}: {
  form: CatForm;
  setField: <K extends keyof CatForm>(k: K, v: CatForm[K]) => void;
  parents: Category[];
  colors: any;
}) {
  return (
    <>
      <AppInput
        label="Name"
        value={form.name}
        onChangeText={(v) => setField('name', v)}
        placeholder="Category name"
      />
      <AppInput
        label="Icon (emoji)"
        value={form.icon}
        onChangeText={(v) => setField('icon', v)}
        placeholder="📁"
      />
      {!form.parent_id && (
        <AppInput
          label="Color (hex)"
          value={form.color}
          onChangeText={(v) => setField('color', v)}
          placeholder="#f26e4d"
        />
      )}
      <View style={styles.formRow}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Type</Text>
        <View style={styles.chips}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.chip,
                { borderColor: form.type === t ? colors.accent : colors.border },
                form.type === t && { backgroundColor: colors.accent + '22' },
              ]}
              onPress={() => setField('type', t)}
            >
              <Text style={{ color: form.type === t ? colors.accent : colors.text, fontFamily: 'Figtree_600SemiBold', fontSize: 13 }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.formRow}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Parent category</Text>
      </View>
      <View style={styles.chips}>
        <TouchableOpacity
          style={[
            styles.chip,
            { borderColor: !form.parent_id ? colors.accent : colors.border },
            !form.parent_id && { backgroundColor: colors.accent + '22' },
          ]}
          onPress={() => setField('parent_id', '')}
        >
          <Text style={{ color: !form.parent_id ? colors.accent : colors.text, fontSize: 13 }}>None</Text>
        </TouchableOpacity>
        {parents.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.chip,
              { borderColor: form.parent_id === p.id ? colors.accent : colors.border },
              form.parent_id === p.id && { backgroundColor: colors.accent + '22' },
            ]}
            onPress={() => setField('parent_id', p.id)}
          >
            <Text style={{ color: form.parent_id === p.id ? colors.accent : colors.text, fontSize: 13 }}>
              {p.icon} {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
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
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
