import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

type Props = {
  onKey: (key: string) => void;
};

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', 'backspace'],
];

export default function NumPad({ onKey }: Props) {
  const colors = useTheme();

  return (
    <View style={[styles.pad, { backgroundColor: colors.surface }]}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.key,
                { backgroundColor: colors.bg },
                key === 'backspace' && { backgroundColor: colors.surface },
              ]}
              onPress={() => onKey(key)}
              activeOpacity={0.5}
            >
              {key === 'backspace' ? (
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              ) : (
                <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 22,
    fontFamily: 'Figtree_500Medium',
  },
});
