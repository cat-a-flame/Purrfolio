import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { todayInputDate } from '@/lib/utils';
import {
  fetchAllRows,
  fetchTransactionsForExport,
  buildTransactionsCsv,
  shareFile,
} from '@/lib/export';
import type { Wallet, Category, Label } from '@/lib/types';
import AppHeader from '@/components/AppHeader';
import AppButton from '@/components/AppButton';
import DatePickerModal from '@/components/DatePickerModal';
import Toast from '@/components/Toast';

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return user.id;
}

export default function ExportScreen() {
  const colors = useTheme();
  const { bottom } = useSafeAreaInsets();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', success: true });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rangeError = from && to && from > to ? 'Start date must be before the end date.' : '';

  function showToast(message: string, success: boolean) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, message, success });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }

  async function exportCsv() {
    if (rangeError) return;
    setExportingCsv(true);
    try {
      const userId = await requireUserId();
      const [txs, wallets, categories, labels] = await Promise.all([
        fetchTransactionsForExport(userId, from || null, to || null),
        fetchAllRows<Wallet>('wallets', userId),
        fetchAllRows<Category>('categories', userId),
        fetchAllRows<Label>('labels', userId),
      ]);
      if (txs.length === 0) {
        showToast('No transactions in the selected period.', false);
        return;
      }
      const csv = buildTransactionsCsv(txs, wallets, categories, labels);
      const suffix = from || to ? `_${from || 'start'}_to_${to || 'today'}` : '';
      await shareFile(csv, `purrfolio-transactions${suffix}.csv`, 'text/csv');
      showToast(`Exported ${txs.length} transaction records.`, true);
    } catch {
      showToast('Export failed. Please try again.', false);
    } finally {
      setExportingCsv(false);
    }
  }

  async function exportJson() {
    setExportingJson(true);
    try {
      const userId = await requireUserId();
      const [wallets, categories, labels, transactions, recurringPayments, recurringOccurrences, templates] =
        await Promise.all([
          fetchAllRows('wallets', userId),
          fetchAllRows('categories', userId),
          fetchAllRows('labels', userId),
          fetchAllRows('transactions', userId, '*, labels:transaction_labels(*)'),
          fetchAllRows('recurring_payments', userId, '*, labels:recurring_payment_labels(*)'),
          fetchAllRows('recurring_occurrences', userId),
          fetchAllRows('templates', userId, '*, labels:template_labels(*)'),
        ]);
      const backup = {
        app: 'purrfolio',
        version: 1,
        exported_at: new Date().toISOString(),
        wallets,
        categories,
        labels,
        transactions,
        recurring_payments: recurringPayments,
        recurring_occurrences: recurringOccurrences,
        templates,
      };
      await shareFile(
        JSON.stringify(backup, null, 2),
        `purrfolio-backup-${todayInputDate()}.json`,
        'application/json',
      );
      showToast('Backup exported.', true);
    } catch {
      showToast('Backup failed. Please try again.', false);
    } finally {
      setExportingJson(false);
    }
  }

  function dateField(label: string, value: string, placeholder: string, which: 'from' | 'to') {
    return (
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
        <TouchableOpacity
          style={[
            styles.pickerBtn,
            { borderColor: which === 'to' && rangeError ? colors.danger : colors.border, backgroundColor: colors.surface },
          ]}
          onPress={() => setPicker(which)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pickerBtnText, { color: value ? colors.text : colors.muted }]} numberOfLines={1}>
            {value || placeholder}
          </Text>
          <Ionicons name="calendar" size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Export data" showBack />
      <ScrollView contentContainerStyle={styles.container}>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>TRANSACTIONS (CSV)</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.text }]}>
              One row per income or expense, and one row per transfer with its destination account.
              Opens in Excel or Google Sheets, and can be imported back on the Purrfolio website.
            </Text>

            <View style={styles.fieldRow}>
              {dateField('From', from, 'Start', 'from')}
              {dateField('To', to, 'Today', 'to')}
            </View>
            {rangeError ? (
              <Text style={[styles.hint, { color: colors.danger }]}>{rangeError}</Text>
            ) : (
              <Text style={[styles.hint, { color: colors.muted }]}>Leave the dates empty to export everything.</Text>
            )}
            {(from || to) ? (
              <TouchableOpacity onPress={() => { setFrom(''); setTo(''); }} activeOpacity={0.7}>
                <Text style={[styles.clearText, { color: colors.accent }]}>Clear dates</Text>
              </TouchableOpacity>
            ) : null}

            <AppButton onPress={exportCsv} loading={exportingCsv} disabled={!!rangeError || exportingJson} fullWidth>
              Export CSV
            </AppButton>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>FULL BACKUP (JSON)</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.helpText, { color: colors.text }]}>
              Everything in your account: accounts, categories, labels, transactions, recurring
              payments and templates, with all their fields. Useful as a personal backup.
            </Text>
            <AppButton variant="secondary" onPress={exportJson} loading={exportingJson} disabled={exportingCsv} fullWidth>
              Export backup
            </AppButton>
          </View>
        </View>

      </ScrollView>

      <DatePickerModal
        visible={picker === 'from'}
        value={from || to || todayInputDate()}
        onConfirm={setFrom}
        onClose={() => setPicker(null)}
      />
      <DatePickerModal
        visible={picker === 'to'}
        value={to || todayInputDate()}
        onConfirm={setTo}
        onClose={() => setPicker(null)}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        success={toast.success}
        bottomOffset={bottom + 24}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingBottom: 40, gap: 24 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  helpText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    marginTop: -4,
  },
  clearText: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
  },
});
