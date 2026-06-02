import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme';

type Props = {
  visible: boolean;
  onKeep: () => void;
  onDiscard: () => void;
};

export default function DiscardModal({ visible, onKeep, onDiscard }: Props) {
  const colors = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Discard changes?</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            You have unsaved changes. Are you sure you want to discard them?
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.bg }]}
              onPress={onKeep}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Keep editing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.danger + '18' }]}
              onPress={onDiscard}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.danger }]}>Discard</Text>
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  sheet: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Figtree_600SemiBold',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
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
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
  },
});
