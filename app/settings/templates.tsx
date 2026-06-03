import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import ConfirmModal from '@/components/ConfirmModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Template, Wallet, Category, Label, TransactionType } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';
import { formatCurrency } from '@/lib/utils';

type TemplateForm = {
  name: string;
  type: TransactionType;
  wallet_id: string;
  amount: string;
  category_id: string;
  payer: string;
  notes: string;
  labelIds: string[];
};

const DEFAULT_FORM: TemplateForm = {
  name: '',
  type: 'expense',
  wallet_id: '',
  amount: '',
  category_id: '',
  payer: '',
  notes: '',
  labelIds: [],
};

export default function TemplatesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [form, setForm] = useState<TemplateForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: t }, { data: w }, { data: c }, { data: l }] = await Promise.all([
      supabase
        .from('templates')
        .select('*, wallet:wallets(*), category:categories(*), labels:template_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).neq('is_archived', true),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);

    const normalized = (t ?? []).map((tpl: any) => ({
      ...tpl,
      labels: (tpl.labels ?? []).map((x: any) => x.label).filter(Boolean),
    }));
    setTemplates(normalized);
    setWallets(w ?? []);
    setCategories(c ?? []);
    setLabels(l ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    const def = wallets.find((w) => w.is_default) ?? wallets[0];
    setForm({ ...DEFAULT_FORM, wallet_id: def?.id ?? '' });
    setAddVisible(true);
  }

  function openEdit(tpl: Template) {
    setEditTpl(tpl);
    setForm({
      name: tpl.name,
      type: tpl.type,
      wallet_id: tpl.wallet_id ?? '',
      amount: String(tpl.amount),
      category_id: tpl.category_id ?? '',
      payer: tpl.payer ?? '',
      notes: tpl.notes ?? '',
      labelIds: (tpl.labels ?? []).map((l) => l.id),
    });
  }

  function setField<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleLabel(id: string) {
    setForm((f) => ({
      ...f,
      labelIds: f.labelIds.includes(id)
        ? f.labelIds.filter((x) => x !== id)
        : [...f.labelIds, id],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      wallet_id: form.wallet_id || null,
      amount: parseFloat(form.amount) || 0,
      category_id: form.category_id || null,
      payer: form.payer || null,
      notes: form.notes || null,
    };

    let tplId: string;
    if (editTpl) {
      await supabase.from('templates').update(payload).eq('id', editTpl.id);
      tplId = editTpl.id;
      await supabase.from('template_labels').delete().eq('template_id', tplId);
    } else {
      const { data } = await supabase
        .from('templates')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      tplId = data?.id;
    }

    if (form.labelIds.length > 0 && tplId) {
      await supabase.from('template_labels').insert(
        form.labelIds.map((lid) => ({ template_id: tplId, label_id: lid }))
      );
    }

    setSaving(false);
    setAddVisible(false);
    setEditTpl(null);
    load();
  }

  async function handleDelete() {
    if (!editTpl) return;
    setConfirmAction(() => async () => {
      await supabase.from('templates').delete().eq('id', editTpl.id);
      setEditTpl(null);
      load();
    });
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
        <Text style={[styles.title, { color: colors.text }]}>Templates</Text>
        <TouchableOpacity onPress={openAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openEdit(item)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {item.category?.name ?? '—'} · {item.wallet?.name ?? '—'}
              </Text>
            </View>
            <Text style={[styles.amount, { color: item.type === 'income' ? colors.income : colors.expense }]}>
              {formatCurrency(item.amount, item.wallet?.currency ?? 'HUF')}
            </Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No templates yet.</Text>}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      <BottomModal visible={addVisible} onClose={() => setAddVisible(false)} title="Add template">
        <TemplateFormFields
          form={form}
          setField={setField}
          toggleLabel={toggleLabel}
          wallets={wallets}
          categories={categories}
          labels={labels}
          colors={colors}
        />
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </BottomModal>

      <BottomModal visible={!!editTpl} onClose={() => setEditTpl(null)} title="Edit template">
        <TemplateFormFields
          form={form}
          setField={setField}
          toggleLabel={toggleLabel}
          wallets={wallets}
          categories={categories}
          labels={labels}
          colors={colors}
        />
        <View style={styles.modalActions}>
          <AppButton onPress={handleDelete} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          <AppButton onPress={handleSave} loading={saving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </BottomModal>
      <ConfirmModal
        visible={!!confirmAction}
        title="Delete template"
        message={`Delete "${editTpl?.name}"?`}
        confirmLabel="Delete"
        onConfirm={() => { confirmAction?.(); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />
    </SafeAreaView>
  );
}

function TemplateFormFields({
  form,
  setField,
  toggleLabel,
  wallets,
  categories,
  labels,
  colors,
}: {
  form: TemplateForm;
  setField: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  toggleLabel: (id: string) => void;
  wallets: Wallet[];
  categories: Category[];
  labels: Label[];
  colors: any;
}) {
  const filteredCats = categories.filter((c) => c.type === 'both' || c.type === form.type);
  return (
    <>
      <AppInput label="Name" value={form.name} onChangeText={(v) => setField('name', v)} placeholder="Template name" />

      {/* Type */}
      <View style={styles.typeToggle}>
        {(['expense', 'income'] as TransactionType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              styles.typeBtn,
              form.type === t && { backgroundColor: t === 'income' ? colors.income : colors.expense },
              { borderColor: colors.border },
            ]}
            onPress={() => setField('type', t)}
          >
            <Text style={{ color: form.type === t ? '#fff' : colors.muted, fontFamily: 'Figtree_600SemiBold', fontSize: 14 }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <AppInput
        label="Amount"
        value={form.amount}
        onChangeText={(v) => setField('amount', v)}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {/* Wallet */}
      <View>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Wallet</Text>
        <View style={styles.chips}>
          {wallets.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.chip, { borderColor: form.wallet_id === w.id ? colors.accent : colors.border }, form.wallet_id === w.id && { backgroundColor: colors.accent + '22' }]}
              onPress={() => setField('wallet_id', w.id)}
            >
              <Text style={{ color: form.wallet_id === w.id ? colors.accent : colors.text, fontSize: 13 }}>{w.icon} {w.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Category */}
      <View>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Category</Text>
        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, { borderColor: !form.category_id ? colors.accent : colors.border }, !form.category_id && { backgroundColor: colors.accent + '22' }]}
            onPress={() => setField('category_id', '')}
          >
            <Text style={{ color: !form.category_id ? colors.accent : colors.text, fontSize: 13 }}>None</Text>
          </TouchableOpacity>
          {filteredCats.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, { borderColor: form.category_id === c.id ? colors.accent : colors.border }, form.category_id === c.id && { backgroundColor: colors.accent + '22' }]}
              onPress={() => setField('category_id', c.id)}
            >
              <Text style={{ color: form.category_id === c.id ? colors.accent : colors.text, fontSize: 13 }}>{c.icon} {c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Labels */}
      {labels.length > 0 && (
        <View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Labels</Text>
          <View style={styles.chips}>
            {labels.map((l) => {
              const sel = form.labelIds.includes(l.id);
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.chip, { borderColor: sel ? l.color : colors.border, backgroundColor: sel ? l.color + '33' : 'transparent' }]}
                  onPress={() => toggleLabel(l.id)}
                >
                  <Text style={{ color: sel ? l.color : colors.text, fontSize: 13 }}>{l.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <AppInput label="Payer" value={form.payer} onChangeText={(v) => setField('payer', v)} placeholder="Optional" />
      <AppInput
        label="Notes"
        value={form.notes}
        onChangeText={(v) => setField('notes', v)}
        placeholder="Optional"
        multiline
        numberOfLines={3}
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  rowName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  rowSub: { fontSize: 13 },
  amount: { fontSize: 16, fontFamily: 'Figtree_700Bold' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  typeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  fieldLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
