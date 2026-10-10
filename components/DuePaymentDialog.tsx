import { View, Text, Modal, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useBaseCurrency } from '@/lib/baseCurrencyContext';
import { formatCurrency } from '@/lib/utils';
import type { RecurringPayment } from '@/lib/types';

type Props = {
  due: { payment: RecurringPayment; dueDate: Date } | null;
  onPay: () => void;
  onSkip: () => void;
  onClose: () => void;
};

export default function DuePaymentDialog({ due, onPay, onSkip, onClose }: Props) {
  const colors = useTheme();
  const baseCurrency = useBaseCurrency();

  // Keep the last payment mounted while the fade-out runs.
  const payment = due?.payment;
  const currency = payment?.wallet?.currency ?? baseCurrency;

  return (
    <Modal
      visible={!!due}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        {due && payment && (
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.glassBorder, shadowColor: colors.shadow }]}
          >
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{payment.name}</Text>
            <Text style={[styles.date, { color: colors.muted }]}>
              {due.dueDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            <Text style={[styles.amount, { color: payment.type === 'income' ? colors.income : colors.expense }]}>
              {payment.type === 'income' ? '+' : '−'}{formatCurrency(payment.amount, currency)}
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.accent }]}
              onPress={onPay}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Mark as paid</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.rowBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.rowBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={onSkip}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnText, { color: colors.muted }]}>Skip</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet: {
    width: '100%',
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    gap: 8,
    alignItems: 'stretch',
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 16,
  },
  title: { fontSize: 20, fontFamily: 'Lora_700Bold', letterSpacing: -0.3, textAlign: 'center' },
  date: { fontSize: 13, fontFamily: 'Nunito_500Medium', textAlign: 'center' },
  amount: { fontSize: 28, fontFamily: 'Lora_700Bold', textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  rowBtn: { flex: 1 },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
  btnText: { fontSize: 16, fontFamily: 'Nunito_600SemiBold', color: '#fff' },
});
