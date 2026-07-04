import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

export default function AddLabelScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('labels').insert({
      name: name.trim(),
      color,
      user_id: user.id,
    });

    setSaving(false);
    if (error) return;
    router.back();
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
        <Text style={[styles.title, { color: colors.text }]}>Add label</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.content}>
        <AppInput label="Name" value={name} onChangeText={setName} placeholder="Label name" />
        <AppInput label="Color (hex)" value={color} onChangeText={setColor} placeholder="#f26e4d" />
        <View style={[styles.preview, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[styles.previewText, { color }]}>{name || 'Preview'}</Text>
        </View>
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </View>
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
});
