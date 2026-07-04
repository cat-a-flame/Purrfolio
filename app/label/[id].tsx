import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ConfirmModal from '@/components/ConfirmModal';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

export default function EditLabelScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('labels').select('*').eq('id', id).single();
      if (data) {
        setName(data.name);
        setColor(data.color);
      }
      setFetching(false);
    }
    load();
  }, [id]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from('labels').update({ name: name.trim(), color }).eq('id', id);

    setSaving(false);
    if (error) return;
    router.back();
  }

  async function handleDelete() {
    setConfirmDelete(false);
    await supabase.from('labels').delete().eq('id', id);
    router.back();
  }

  if (fetching) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
      </SafeAreaView>
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
        <Text style={[styles.title, { color: colors.text }]}>Edit label</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.content}>
        <AppInput label="Name" value={name} onChangeText={setName} placeholder="Label name" />
        <AppInput label="Color (hex)" value={color} onChangeText={setColor} placeholder="#f26e4d" />
        <View style={[styles.preview, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[styles.previewText, { color }]}>{name || 'Preview'}</Text>
        </View>
        <View style={styles.actions}>
          <AppButton onPress={() => setConfirmDelete(true)} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          <AppButton onPress={handleSave} loading={saving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </View>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete label"
        message={`Delete "${name}"?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
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
    padding: 16,
    borderBottomWidth: 1,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { fontSize: 15 },
  title: { fontSize: 18, fontFamily: 'Figtree_700Bold' },
  content: { padding: 16, gap: 12 },
  preview: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  previewText: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
