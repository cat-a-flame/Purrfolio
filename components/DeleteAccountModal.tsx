import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';

const CONFIRM_WORD = 'DELETE';

type Props = {
  visible: boolean;
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function DeleteAccountModal({ visible, loading, error, onConfirm, onCancel }: Props) {
  const colors = useTheme();
  const [typed, setTyped] = useState('');
  const canConfirm = typed.trim() === CONFIRM_WORD && !loading;

  // Start empty each time the modal is opened.
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={loading ? () => {} : onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.glassBorder, shadowColor: colors.shadow }]}>
          <Text style={[styles.title, { color: colors.text }]}>Delete your account?</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Your account and all of its data (transactions, recurring payments, templates, accounts,
            categories and labels) will be permanently deleted, and you will be signed out.
          </Text>

          <View style={[styles.warning, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.warningText, styles.warningStrong, { color: colors.danger }]}>
              This cannot be undone.
            </Text>
            <Text style={[styles.warningText, { color: colors.danger }]}>
              We cannot restore anything once it has been deleted.
            </Text>
          </View>

          <AppInput
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            editable={!loading}
            error={error || undefined}
          />

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.surface2, borderColor: colors.border }, loading && styles.disabled]}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.dangerLight, borderColor: colors.dangerLight }, !canConfirm && styles.disabled]}
              onPress={onConfirm}
              disabled={!canConfirm}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={[styles.btnText, { color: colors.danger }]}>Delete account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  warning: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  warningText: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 18,
  },
  warningStrong: {
    fontFamily: 'Nunito_700Bold',
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
  disabled: {
    opacity: 0.5,
  },
});
