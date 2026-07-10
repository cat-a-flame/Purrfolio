import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BottomModal from '@/components/BottomModal';
import AppInput from '@/components/AppInput';
import { useTheme } from '@/lib/theme';
import type { TransactionType } from '@/lib/types';

export type CategoryDraftType = TransactionType | 'both';

export interface SubDraft {
  id?: string;
  _key: string;
  icon: string;
  name: string;
}

export interface CategoryDraft {
  name: string;
  icon: string;
  color: string;
  type: CategoryDraftType;
  subs: SubDraft[];
}

interface Props {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: CategoryDraft;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: CategoryDraft) => void;
  onDelete: () => void;
}

export const CATEGORY_COLORS = [
  '#6C63FF', '#FF6B6B', '#43BCCD', '#F9A826', '#5CB85C',
  '#E8468A', '#3ABFB1', '#FF8C42', '#9B59B6', '#2ECC71',
  '#E74C3C', '#3498DB',
];

let subKeySeq = 0;
function nextSubKey() { return `new-${++subKeySeq}`; }

const TYPE_OPTIONS: { key: CategoryDraftType; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'both', label: 'Both' },
];

export default function CategoryEditorModal({
  visible, mode, initial, canDelete, saving, onClose, onSave, onDelete,
}: Props) {
  const colors = useTheme();
  const [draft, setDraft] = useState<CategoryDraft>(initial);
  const wasVisible = useRef(false);
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(initial);
    wasVisible.current = visible;
  }, [visible, initial]);

  function patchSub(key: string, patch: Partial<SubDraft>) {
    setDraft(d => ({ ...d, subs: d.subs.map(s => (s._key === key ? { ...s, ...patch } : s)) }));
  }

  function removeSub(key: string) {
    setDraft(d => ({ ...d, subs: d.subs.filter(s => s._key !== key) }));
  }

  function addSub() {
    setDraft(d => ({ ...d, subs: [...d.subs, { _key: nextSubKey(), icon: '🏷️', name: '' }] }));
  }

  const typeActiveColor: Record<CategoryDraftType, string> = {
    expense: colors.expense,
    income: colors.income,
    both: colors.accent,
  };

  return (
    <BottomModal
      visible={visible}
      onClose={() => { if (!saving) onClose(); }}
      title={isEdit ? 'Edit category' : 'New category'}
      rightAction={
        <TouchableOpacity onPress={() => onSave(draft)} disabled={saving || !draft.name.trim()}>
          <Text style={{ color: saving || !draft.name.trim() ? colors.muted : colors.accent, fontSize: 15, fontFamily: 'Figtree_600SemiBold' }}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Text>
        </TouchableOpacity>
      }
    >
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {isEdit ? 'Update icon, color and subcategories' : 'Set up a category to organize transactions'}
      </Text>

      <View style={styles.previewWrap}>
        <View style={[styles.previewTile, { backgroundColor: draft.color + '40' }]}>
          <Text style={styles.previewEmoji}>{draft.icon || '🙂'}</Text>
        </View>
      </View>

      <View style={styles.iconNameRow}>
        <View style={{ width: 64 }}>
          <AppInput
            label="Icon"
            value={draft.icon}
            onChangeText={(v) => setDraft(d => ({ ...d, icon: v }))}
            maxLength={4}
            placeholder="🙂"
            style={styles.emojiInput}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppInput
            label="Category name"
            value={draft.name}
            onChangeText={(v) => setDraft(d => ({ ...d, name: v }))}
            placeholder="e.g. Food & Dining"
            autoFocus
          />
        </View>
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>Type or paste any emoji as the icon.</Text>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Type</Text>
        <View style={[styles.typeTabs, { backgroundColor: colors.bg }]}>
          {TYPE_OPTIONS.map((opt) => {
            const active = draft.type === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.typeTab, active && { backgroundColor: typeActiveColor[opt.key] }]}
                onPress={() => setDraft(d => ({ ...d, type: opt.key }))}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeTabText, { color: active ? '#fff' : colors.muted }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Color</Text>
        <View style={styles.colorRow}>
          {CATEGORY_COLORS.map((c) => {
            const selected = draft.color.toLowerCase() === c.toLowerCase();
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setDraft(d => ({ ...d, color: c }))}
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
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Subcategories</Text>
        <Text style={[styles.optional, { color: colors.muted }]}>Optional</Text>
      </View>
      <View style={styles.subsList}>
        {draft.subs.map((s) => (
          <View key={s._key} style={[styles.subRow, { backgroundColor: colors.bg }]}>
            <View style={{ width: 42 }}>
              <AppInput
                value={s.icon}
                onChangeText={(v) => patchSub(s._key, { icon: v })}
                maxLength={4}
                style={styles.subEmojiInput}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppInput
                value={s.name}
                onChangeText={(v) => patchSub(s._key, { name: v })}
                placeholder="Subcategory name"
              />
            </View>
            <TouchableOpacity style={styles.subRemoveBtn} onPress={() => removeSub(s._key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: colors.danger, fontSize: 15, fontFamily: 'Figtree_700Bold' }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={[styles.addSubBtn, { borderColor: colors.accent }]} onPress={addSub} activeOpacity={0.7}>
          <Text style={[styles.addSubText, { color: colors.accent }]}>+ Add subcategory</Text>
        </TouchableOpacity>
      </View>

      {canDelete && (
        <TouchableOpacity style={[styles.deleteBtn, { borderColor: colors.danger }]} onPress={onDelete} activeOpacity={0.7}>
          <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete category</Text>
        </TouchableOpacity>
      )}
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, fontFamily: 'Figtree_500Medium', marginTop: -8, marginBottom: 4 },
  previewWrap: { alignItems: 'center', marginBottom: 4 },
  previewTile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  previewEmoji: { fontSize: 28 },
  iconNameRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  emojiInput: { textAlign: 'center', fontSize: 20 },
  hint: { fontSize: 11, fontFamily: 'Figtree_500Medium', marginTop: -6 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  typeTabs: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  typeTab: { flex: 1, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeTabText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: { borderWidth: 3 },
  subsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optional: { fontSize: 11, fontFamily: 'Figtree_500Medium' },
  subsList: { gap: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8 },
  subEmojiInput: { textAlign: 'center', fontSize: 16 },
  subRemoveBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addSubBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed' },
  addSubText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
  deleteBtn: { marginTop: 4, height: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, fontFamily: 'Figtree_600SemiBold' },
});
