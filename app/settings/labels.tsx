import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { Label } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';

type LabelForm = { name: string; color: string };
const DEFAULT_FORM: LabelForm = { name: '', color: '#f26e4d' };

export default function LabelsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [labels, setLabels] = useState<Label[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [editLabel, setEditLabel] = useState<Label | null>(null);
  const [form, setForm] = useState<LabelForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('labels').select('*').eq('user_id', user.id).order('name');
    setLabels(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm(DEFAULT_FORM);
    setAddVisible(true);
  }

  function openEdit(l: Label) {
    setEditLabel(l);
    setForm({ name: l.name, color: l.color });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = { name: form.name.trim(), color: form.color };
    if (editLabel) {
      await supabase.from('labels').update(payload).eq('id', editLabel.id);
    } else {
      await supabase.from('labels').insert({ ...payload, user_id: user.id });
    }

    setSaving(false);
    setAddVisible(false);
    setEditLabel(null);
    load();
  }

  async function handleDelete() {
    if (!editLabel) return;
    Alert.alert('Delete label', `Delete "${editLabel.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('labels').delete().eq('id', editLabel.id);
          setEditLabel(null);
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Labels</Text>
        <TouchableOpacity onPress={openAdd}>
          <Text style={[styles.add, { color: colors.accent }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={labels}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openEdit(item)}
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

      <BottomModal visible={addVisible} onClose={() => setAddVisible(false)} title="Add label">
        <AppInput label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Label name" />
        <AppInput label="Color (hex)" value={form.color} onChangeText={(v) => setForm((f) => ({ ...f, color: v }))} placeholder="#f26e4d" />
        <View style={[styles.preview, { backgroundColor: form.color + '22', borderColor: form.color + '55' }]}>
          <Text style={[styles.previewText, { color: form.color }]}>{form.name || 'Preview'}</Text>
        </View>
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </BottomModal>

      <BottomModal visible={!!editLabel} onClose={() => setEditLabel(null)} title="Edit label">
        <AppInput label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Label name" />
        <AppInput label="Color (hex)" value={form.color} onChangeText={(v) => setForm((f) => ({ ...f, color: v }))} placeholder="#f26e4d" />
        <View style={styles.modalActions}>
          <AppButton onPress={handleDelete} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          <AppButton onPress={handleSave} loading={saving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </BottomModal>
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
  back: { fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  add: { fontSize: 16 },
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
  rowName: { fontSize: 15, fontWeight: '500' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  preview: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  previewText: { fontSize: 13, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
