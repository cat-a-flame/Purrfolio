import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import type { RecurringPayment, Currency } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { isoDate } from '@/lib/recurringUtils';
import { Events } from '@/lib/events';

export default function DuePaymentScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { paymentId, dueDate } = useLocalSearchParams<{ paymentId: string; dueDate: string }>();

  const [payment, setPayment] = useState<RecurringPayment | null>(null);
  const [currency, setCurrency] = useState<Currency>('HUF');
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('recurring_payments').select('*').eq('id', paymentId).single();
      if (p) {
        setPayment(p);
        if (p.wallet_id) {
          const { data: w } = await supabase.from('wallets').select('currency').eq('id', p.wallet_id).single();
          if (w) setCurrency(w.currency);
        }
      }
      setFetching(false);
    }
    load();
  }, [paymentId]);

  async function handlePay() {
    if (!payment) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: payment.type,
        amount: payment.amount,
        wallet_id: payment.wallet_id,
        category_id: payment.category_id,
        date: isoDate(new Date()),
        notes: payment.notes,
        payer: payment.payer,
      })
      .select('id')
      .single();

    if (!txErr && txData) {
      await supabase.from('recurring_occurrences').insert({
        recurring_payment_id: payment.id,
        user_id: user.id,
        due_date: dueDate,
        status: 'paid',
        transaction_id: txData.id,
      });
      Events.emit('transaction-saved', { success: true });
      Events.emit('recurring-saved', {
        success: true,
        message: 'Payment confirmed!',
        undo: { type: 'pay', transactionId: txData.id, paymentId: payment.id, dueDate },
      });
    } else {
      Events.emit('recurring-saved', { success: false, message: 'Failed to confirm payment.' });
    }
    setLoading(false);
    router.back();
  }

  async function handleSkip() {
    if (!payment) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { error } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: payment.id,
      user_id: user.id,
      due_date: dueDate,
      status: 'skipped',
      transaction_id: null,
    });

    if (!error) {
      Events.emit('recurring-saved', {
        success: true,
        message: 'Payment skipped.',
        undo: { type: 'skip', paymentId: payment.id, dueDate },
      });
    } else {
      Events.emit('recurring-saved', { success: false, message: 'Failed to skip payment.' });
    }
    setLoading(false);
    router.back();
  }

  if (fetching || !payment) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  const dateObj = new Date(dueDate + 'T00:00:00');

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{payment.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.amountCard, { borderColor: colors.border }]}>
          <Text style={[styles.dateLabel, { color: colors.muted }]}>
            {dateObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          <Text style={[styles.amountValue, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
            {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.accent }]}
          onPress={handlePay}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>Mark as paid</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.border }]}
          onPress={handleSkip}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: colors.muted }]}>Skip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Figtree_600SemiBold' },
  content: { padding: 16, gap: 12 },
  amountCard: {
    borderWidth: 1, borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 4, marginBottom: 4,
  },
  dateLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium' },
  amountValue: { fontSize: 28, fontFamily: 'Lora_700Bold' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnOutline: { borderWidth: 1 },
  actionBtnText: { fontSize: 16, fontFamily: 'Figtree_600SemiBold', color: '#fff' },
});
