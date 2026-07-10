import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@/lib/types';
import CategoryEditorModal, { CATEGORY_COLORS, type CategoryDraft } from '@/components/CategoryEditorModal';
import ConfirmModal from '@/components/ConfirmModal';
import Toast from '@/components/Toast';
import SkeletonBox from '@/components/SkeletonBox';

type CategoryWithChildren = Category & { children: Category[] };

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; category: CategoryWithChildren };

export default function CategoriesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', success: true });

  function showToast(message: string, success: boolean) {
    setToast({ visible: true, message, success });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }

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

  function openCreate() { setModal({ mode: 'create' }); }
  function openEdit(category: CategoryWithChildren) { setModal({ mode: 'edit', category }); }
  function closeModal() { setModal(null); }

  async function handleSave(draft: CategoryDraft) {
    if (!modal) return;
    const name = draft.name.trim() || 'Untitled';
    const icon = draft.icon.trim() || '📁';
    const subs = draft.subs.filter(s => s.name.trim());
    setSaving(true);

    if (modal.mode === 'create') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: created, error } = await supabase.from('categories')
        .insert({ user_id: user.id, name, type: draft.type, icon, color: draft.color, is_default: false, parent_id: null })
        .select('id').single();

      if (error || !created) {
        setSaving(false);
        showToast('Failed to create category.', false);
        return;
      }

      if (subs.length) {
        await supabase.from('categories').insert(subs.map(s => ({
          user_id: user.id, name: s.name.trim(), type: draft.type, icon: s.icon.trim() || '📁',
          color: draft.color, is_default: false, parent_id: created.id,
        })));
      }

      setSaving(false);
      setModal(null);
      showToast('Category created', true);
      load();
      return;
    }

    const category = modal.category;
    const { error } = await supabase.from('categories')
      .update({ name, icon, color: draft.color, type: draft.type })
      .eq('id', category.id);

    if (error) {
      setSaving(false);
      showToast('Failed to save category.', false);
      return;
    }

    const keptIds = new Set(subs.filter(s => s.id).map(s => s.id as string));
    const removedIds = category.children.map(c => c.id).filter(id => !keptIds.has(id));
    const toUpdate = subs.filter(s => s.id);
    const toInsert = subs.filter(s => !s.id);
    const { data: { user } } = await supabase.auth.getUser();

    await Promise.all([
      ...toUpdate.map(s => supabase.from('categories')
        .update({ name: s.name.trim(), icon: s.icon.trim() || '📁', color: draft.color, type: draft.type })
        .eq('id', s.id as string)),
      ...(toInsert.length && user ? [supabase.from('categories').insert(toInsert.map(s => ({
        user_id: user.id, name: s.name.trim(), type: draft.type, icon: s.icon.trim() || '📁',
        color: draft.color, is_default: false, parent_id: category.id,
      })))] : []),
      ...(removedIds.length ? [supabase.from('categories').delete().in('id', removedIds)] : []),
    ]);

    setSaving(false);
    setModal(null);
    showToast('Changes saved', true);
    load();
  }

  function requestDelete() {
    if (modal?.mode !== 'edit') return;
    setConfirmDelete({ id: modal.category.id, name: modal.category.name });
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    await supabase.from('categories').delete().eq('parent_id', confirmDelete.id);
    const { error } = await supabase.from('categories').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      showToast('Failed to delete category.', false);
    } else {
      setModal(null);
      showToast('Category deleted', true);
      load();
    }
  }

  const draftInitial: CategoryDraft = modal && modal.mode === 'edit'
    ? {
      name: modal.category.name,
      icon: modal.category.icon,
      color: modal.category.color || CATEGORY_COLORS[0],
      type: modal.category.type,
      subs: modal.category.children.map(c => ({ id: c.id, _key: c.id, icon: c.icon, name: c.name })),
    }
    : { name: '', icon: '🙂', color: CATEGORY_COLORS[0], type: 'both', subs: [] };

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
        <TouchableOpacity onPress={openCreate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
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
      ) : topLevel.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏷️</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No categories yet</Text>
          <Text style={[styles.emptyHint, { color: colors.muted }]}>Tap the + button to organize your spending.</Text>
        </View>
      ) : (
        <FlatList
          data={topLevel}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => openEdit(item)}
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
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      <CategoryEditorModal
        visible={!!modal}
        mode={modal?.mode ?? 'create'}
        initial={draftInitial}
        canDelete={!!modal && modal.mode === 'edit' && !modal.category.is_default}
        saving={saving}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={requestDelete}
      />

      <ConfirmModal
        visible={!!confirmDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        message="This category and its subcategories will be removed. Existing transactions will become uncategorized."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <Toast visible={toast.visible} message={toast.message} success={toast.success} bottomOffset={24} />
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
