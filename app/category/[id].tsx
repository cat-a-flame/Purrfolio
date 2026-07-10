import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import ConfirmModal from '@/components/ConfirmModal';
import type { TransactionType } from '@/lib/types';

type CatType = TransactionType | 'both';

type SubDraft = { id?: string; _key: string; icon: string; name: string };

type CatForm = {
  name: string;
  icon: string;
  color: string;
  type: CatType;
  subs: SubDraft[];
};

const TYPES: { value: CatType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'both', label: 'Both' },
];

const CATEGORY_COLORS = [
  '#6C63FF', '#FF6B6B', '#43BCCD', '#F9A826', '#5CB85C',
  '#E8468A', '#3ABFB1', '#FF8C42', '#9B59B6', '#2ECC71',
  '#E74C3C', '#3498DB',
];

function typeColor(t: CatType, colors: any): string {
  if (t === 'income') return colors.income;
  if (t === 'expense') return colors.expense;
  return colors.accent;
}

let subKeySeq = 0;
function nextSubKey() { return `new-${++subKeySeq}`; }

export default function CategoryScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [form, setForm] = useState<CatForm>({
    name: '', icon: '🙂', color: CATEGORY_COLORS[0], type: 'both', subs: [],
  });
  const [isDefault, setIsDefault] = useState(false);
  const [fetching, setFetching] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      const [{ data: category }, { data: children }] = await Promise.all([
        supabase.from('categories').select('*').eq('id', id).single(),
        supabase.from('categories').select('*').eq('parent_id', id).order('name'),
      ]);
      if (category) {
        setForm({
          name: category.name,
          icon: category.icon,
          color: category.color || CATEGORY_COLORS[0],
          type: category.type,
          subs: (children ?? []).map((c: any) => ({ id: c.id, _key: c.id, icon: c.icon, name: c.name })),
        });
        setIsDefault(category.is_default);
      }
      setFetching(false);
    }
    load();
  }, [id]);

  function setField<K extends keyof CatForm>(key: K, value: CatForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function patchSub(key: string, patch: Partial<SubDraft>) {
    setForm((f) => ({ ...f, subs: f.subs.map((s) => (s._key === key ? { ...s, ...patch } : s)) }));
  }

  function removeSub(key: string) {
    setForm((f) => ({ ...f, subs: f.subs.filter((s) => s._key !== key) }));
  }

  function addSub() {
    setForm((f) => ({ ...f, subs: [...f.subs, { _key: nextSubKey(), icon: '🏷️', name: '' }] }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const name = form.name.trim();
    const icon = form.icon.trim() || '📁';
    const subs = form.subs.filter((s) => s.name.trim());

    if (isNew) {
      const { data: created, error } = await supabase.from('categories')
        .insert({ user_id: user.id, name, type: form.type, icon, color: form.color, is_default: false, parent_id: null })
        .select('id').single();

      if (error || !created) { setSaving(false); return; }

      if (subs.length) {
        await supabase.from('categories').insert(subs.map((s) => ({
          user_id: user.id, name: s.name.trim(), type: form.type, icon: s.icon.trim() || '📁',
          color: form.color, is_default: false, parent_id: created.id,
        })));
      }

      setSaving(false);
      router.back();
      return;
    }

    const { error } = await supabase.from('categories')
      .update({ name, icon, color: form.color, type: form.type })
      .eq('id', id);

    if (error) { setSaving(false); return; }

    const keptIds = new Set(subs.filter((s) => s.id).map((s) => s.id as string));
    const { data: existingChildren } = await supabase.from('categories').select('id').eq('parent_id', id);
    const removedIds = (existingChildren ?? []).map((c) => c.id).filter((cid) => !keptIds.has(cid));
    const toUpdate = subs.filter((s) => s.id);
    const toInsert = subs.filter((s) => !s.id);

    await Promise.all([
      ...toUpdate.map((s) => supabase.from('categories')
        .update({ name: s.name.trim(), icon: s.icon.trim() || '📁', color: form.color, type: form.type })
        .eq('id', s.id as string)),
      ...(toInsert.length ? [supabase.from('categories').insert(toInsert.map((s) => ({
        user_id: user.id, name: s.name.trim(), type: form.type, icon: s.icon.trim() || '📁',
        color: form.color, is_default: false, parent_id: id,
      })))] : []),
      ...(removedIds.length ? [supabase.from('categories').delete().in('id', removedIds)] : []),
    ]);

    setSaving(false);
    router.back();
  }

  async function handleDelete() {
    await supabase.from('categories').delete().eq('parent_id', id);
    await supabase.from('categories').delete().eq('id', id);
    router.back();
  }

  if (fetching) {
    return <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]} />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isNew ? 'Add category' : 'Edit category'}
        </Text>
        {!isNew && !isDefault ? (
          <TouchableOpacity onPress={() => setConfirmDelete(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconNameRow}>
            <AppInput
              label="Icon"
              value={form.icon}
              onChangeText={(v) => setField('icon', v)}
              maxLength={4}
              placeholder="🙂"
              style={{ width: 72, textAlign: 'center' }}
            />
            <View style={{ flex: 1 }}>
              <AppInput
                label="Category name"
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                placeholder="e.g. Food & Dining"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Type</Text>
            <View style={[styles.typeToggle, { backgroundColor: colors.surface }]}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeBtn, form.type === t.value && { backgroundColor: typeColor(t.value, colors) }]}
                  onPress={() => setField('type', t.value)}
                >
                  <Text style={[styles.typeBtnText, { color: form.type === t.value ? '#fff' : colors.muted }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Color</Text>
            <View style={styles.colorRow}>
              {CATEGORY_COLORS.map((c) => {
                const selected = form.color.toLowerCase() === c.toLowerCase();
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setField('color', c)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      selected && [styles.colorSwatchSelected, { borderColor: colors.text }],
                    ]}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.subsHeader}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Subcategories</Text>
            <Text style={[styles.optional, { color: colors.muted }]}>Optional</Text>
          </View>
          <View style={styles.subsList}>
            {form.subs.map((s) => (
              <View key={s._key} style={[styles.subRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <AppInput
                  value={s.icon}
                  onChangeText={(v) => patchSub(s._key, { icon: v })}
                  maxLength={4}
                  style={{ width: 44, textAlign: 'center' }}
                />
                <View style={{ flex: 1 }}>
                  <AppInput
                    value={s.name}
                    onChangeText={(v) => patchSub(s._key, { name: v })}
                    placeholder="Subcategory name"
                  />
                </View>
                <TouchableOpacity style={styles.subRemoveBtn} onPress={() => removeSub(s._key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.addSubBtn, { borderColor: colors.accent }]} onPress={addSub} activeOpacity={0.7}>
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={[styles.addSubText, { color: colors.accent }]}>Add subcategory</Text>
            </TouchableOpacity>
          </View>

          <AppButton onPress={handleSave} loading={saving} fullWidth style={{ marginTop: 8 }}>
            Save
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete category"
        message={`Delete "${form.name}"? This category and its subcategories will be removed. Existing transactions will become uncategorized.`}
        confirmLabel="Delete"
        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
        onCancel={() => setConfirmDelete(false)}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_700Bold' },
  content: { padding: 16, gap: 14 },
  iconNameRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 4,
    gap: 4,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  typeBtnText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3 },
  subsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  optional: { fontSize: 11, fontFamily: 'Figtree_500Medium' },
  subsList: { gap: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 8 },
  subRemoveBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  addSubBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addSubText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
});
