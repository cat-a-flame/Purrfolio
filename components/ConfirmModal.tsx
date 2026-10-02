import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  const colors = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.glassBorder, shadowColor: colors.shadow }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{message}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.dangerLight, borderColor: colors.dangerLight }]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.danger }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: {
    width: '100%',
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.35,
    shadowRadius: 40,
    elevation: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Lora_700Bold',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
  },
});
