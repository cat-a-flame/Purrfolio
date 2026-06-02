import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';
import AppButton from '@/components/AppButton';
import type { WalletNotification } from 'notification-listener';

type Props = {
  notification: WalletNotification | null;
  onAdd: (n: WalletNotification) => void;
  onDismiss: () => void;
};

export default function WalletNotificationPrompt({ notification, onAdd, onDismiss }: Props) {
  const colors = useTheme();

  if (!notification) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emoji]}>💳</Text>
          <Text style={[styles.title, { color: colors.text }]}>Payment detected</Text>
          <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={[styles.amount, { color: colors.expense }]}>
            {notification.currency} {notification.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Add this as an expense?
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.skipBtn, { borderColor: colors.border }]}
              onPress={onDismiss}
            >
              <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <AppButton onPress={() => onAdd(notification)} fullWidth>
                Add expense
              </AppButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emoji: { fontSize: 40, marginBottom: 4 },
  title: { fontSize: 13, fontFamily: 'Figtree_600SemiBold', letterSpacing: 0.8, opacity: 0.6, textTransform: 'uppercase' },
  merchant: { fontSize: 20, fontFamily: 'Figtree_700Bold', marginTop: 2 },
  amount: { fontSize: 36, fontFamily: 'Lora_400Regular', marginVertical: 4 },
  hint: { fontSize: 14, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
  skipBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  skipText: { fontSize: 15, fontFamily: 'Figtree_600SemiBold' },
});
