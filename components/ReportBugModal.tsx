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
  Switch,
  Alert,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import AppInput from '@/components/AppInput';

const MAX_LENGTH = 4000;

type Props = {
  visible: boolean;
  /** Screen the report is sent from, so it's easier to reproduce. */
  page: string;
  onClose: () => void;
};

/** Sends a bug report to Discord via report_bug(), same as the web. */
export default function ReportBugModal({ visible, page, onClose }: Props) {
  const colors = useTheme();
  const [message, setMessage] = useState('');
  const [canContact, setCanContact] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Start fresh each time the modal is opened.
  useEffect(() => {
    if (!visible) return;
    setMessage('');
    setCanContact(false);
    setError('');
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, [visible]);

  async function handleSend() {
    const text = message.trim();
    if (!text) {
      setError('Please describe what went wrong.');
      return;
    }
    setSending(true);
    setError('');
    const { error: sendError } = await supabase.rpc('report_bug', {
      message: text,
      page,
      user_agent: `PurrfolioApp (${Platform.OS} ${Platform.Version})`,
      can_contact: canContact,
    });
    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    onClose();
    Alert.alert('Thanks!', 'Your report was sent.');
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={sending ? () => {} : onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.glassBorder, shadowColor: colors.shadow }]}>
          <Text style={[styles.title, { color: colors.text }]}>Report a bug</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Tell us what happened and what you expected instead.
          </Text>

          <AppInput
            label="What went wrong?"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={MAX_LENGTH}
            editable={!sending}
            style={styles.textarea}
            textAlignVertical="top"
            error={error || undefined}
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            Your email{email ? ` (${email})` : ''}, the current screen and your device are sent with the report to help us reproduce it.
          </Text>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>
              You can contact me by email for more details
            </Text>
            <Switch
              value={canContact}
              onValueChange={setCanContact}
              disabled={sending}
              trackColor={{ false: colors.border, true: colors.accent + '88' }}
              thumbColor={canContact ? colors.accent : '#f4f4f4'}
            />
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.surface2, borderColor: colors.border }, sending && styles.disabled]}
              onPress={onClose}
              disabled={sending}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.accent, borderColor: colors.accent }, sending && styles.disabled]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.7}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[styles.btnText, { color: '#ffffff' }]}>Send report</Text>
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
    padding: 24,
  },
  sheet: {
    width: '100%',
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    gap: 14,
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
  textarea: { minHeight: 120, paddingTop: 12 },
  hint: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 17,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_500Medium',
  },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontFamily: 'Nunito_600SemiBold' },
  disabled: { opacity: 0.5 },
});
