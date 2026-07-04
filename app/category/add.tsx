import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Category, TransactionType } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

const TYPES = ['expense', 'income', 'both'] as const;

type CatForm = {
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  parent_id: string;
};
const DEFAULT_FORM: CatForm = { name: '', type: 'expense', icon: '📁', color: '#f26e4d', parent_id: '' };

export default function AddCategoryScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [parents, setParents] = useState<Category[]>([]);
  const [form, setForm] = useState<CatForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .is('parent_id', null)
        .order('name');
      setParents(data ?? []);
    }
    load();
  }, []);

  function setField<K extends keyof CatForm>(key: K, value: CatForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from('categories').insert({
      name: form.name.trim(),
      type: form.type,
      icon: form.icon,
      color: form.parent_id ? '' : form.color,
      parent_id: form.parent_id || null,
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
        <Text style={[styles.title, { color: colors.text }]}>Add category</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.content}>
        <CatFormFields form={form} setField={setField} parents={parents} colors={colors} />
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </View>
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
  content: { padding: 16, gap: 12 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
});
