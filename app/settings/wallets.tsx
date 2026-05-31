import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, Currency } from '@/lib/types';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';
import BottomModal from '@/components/BottomModal';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];

type WalletForm = {
  name: string;
  currency: Currency;
  icon: string;
  color: string;
  is_default: boolean;
  starting_balance: string;
};

const DEFAULT_FORM: WalletForm = {
  name: '',
  currency: 'HUF',
  icon: '💰',
  color: '#f26e4d',
  is_default: false,
  starting_balance: '0',
};

export default function WalletsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [editWallet, setEditWallet] = useState<Wallet | null>(null);
  const [form, setForm] = useState<WalletForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('wallets').select('*').eq('user_id', user.id).order('is_default', { ascending: false });
    setWallets(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm(DEFAULT_FORM);
    setAddVisible(true);
  }

  function openEdit(w: Wallet) {
    setEditWallet(w);
    setForm({
      name: w.name,
      currency: w.currency,
      icon: w.icon,
      color: w.color,
      is_default: w.is_default,
      starting_balance: String(w.starting_balance),
    });
  }

  function setField<K extends keyof WalletForm>(key: K, value: WalletForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name.trim(),
      currency: form.currency,
      icon: form.icon,
      color: form.color,
      is_default: form.is_default,
      starting_balance: parseFloat(form.starting_balance) || 0,
    };

    if (editWallet) {
      if (form.is_default) {
        await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
      }
      await supabase.from('wallets').update(payload).eq('id', editWallet.id);
    } else {
      if (form.is_default) {
        await supabase.from('wallets').update({ is_default: false }).eq('user_id', user.id);
      }
      await supabase.from('wallets').insert({ ...payload, user_id: user.id });
    }

    setSaving(false);
    setAddVisible(false);
    setEditWallet(null);
    load();
  }

  async function handleDelete() {
    if (!editWallet) return;
    Alert.alert('Delete wallet', `Delete "${editWallet.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('wallets').delete().eq('id', editWallet.id);
          setEditWallet(null);
          load();
        },
      },
    ]);
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
        <Text style={[styles.title, { color: colors.text }]}>Wallets</Text>
        <TouchableOpacity onPress={openAdd}>
          <View style={styles.addRow}>
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={[styles.add, { color: colors.accent }]}>Add</Text>
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={wallets}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openEdit(item)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 20 }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>{item.currency}</Text>
            </View>
            {item.is_default && (
              <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                <Text style={[styles.badgeText, { color: colors.accent }]}>Default</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No wallets yet.</Text>}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      {/* Add modal */}
      <BottomModal visible={addVisible} onClose={() => setAddVisible(false)} title="Add wallet">
        <WalletForm form={form} setField={setField} colors={colors} />
        <AppButton onPress={handleSave} loading={saving} fullWidth>Save</AppButton>
      </BottomModal>

      {/* Edit modal */}
      <BottomModal visible={!!editWallet} onClose={() => setEditWallet(null)} title="Edit wallet">
        <WalletForm form={form} setField={setField} colors={colors} />
        <View style={styles.modalActions}>
          <AppButton onPress={handleDelete} variant="danger" style={{ flex: 1 }}>Delete</AppButton>
          <AppButton onPress={handleSave} loading={saving} style={{ flex: 2 }}>Save</AppButton>
        </View>
      </BottomModal>
    </SafeAreaView>
  );
}

function WalletForm({
  form,
  setField,
  colors,
}: {
  form: WalletForm;
  setField: <K extends keyof WalletForm>(k: K, v: WalletForm[K]) => void;
  colors: any;
}) {
  return (
    <>
      <AppInput
        label="Name"
        value={form.name}
        onChangeText={(v) => setField('name', v)}
        placeholder="Wallet name"
      />
      <AppInput
        label="Icon (emoji)"
        value={form.icon}
        onChangeText={(v) => setField('icon', v)}
        placeholder="💰"
      />
      <AppInput
        label="Color (hex)"
        value={form.color}
        onChangeText={(v) => setField('color', v)}
        placeholder="#f26e4d"
      />
      <AppInput
        label="Starting balance"
        value={form.starting_balance}
        onChangeText={(v) => setField('starting_balance', v)}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <View style={styles.formRow}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Currency</Text>
        <View style={styles.chips}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.chip,
                { borderColor: form.currency === c ? colors.accent : colors.border },
                form.currency === c && { backgroundColor: colors.accent + '22' },
              ]}
              onPress={() => setField('currency', c)}
            >
              <Text style={{ color: form.currency === c ? colors.accent : colors.text, fontFamily: 'Figtree_600SemiBold' }}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.formRow, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Set as default</Text>
        <Switch
          value={form.is_default}
          onValueChange={(v) => setField('is_default', v)}
          trackColor={{ true: colors.accent }}
          thumbColor="#fff"
        />
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
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowName: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
  rowSub: { fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12, fontFamily: 'Figtree_600SemiBold' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
