import { useState } from 'react';
import { TextInput, TextInputProps, StyleSheet, View, Text } from 'react-native';
import { useTheme } from '@/lib/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export default function AppInput({ label, error, style, onFocus, onBlur, ...props }: Props) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor,
            color: colors.text,
            shadowColor: colors.accent,
          },
          focused && !error && styles.focused,
          style,
        ]}
        placeholderTextColor={colors.placeholder}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...props}
      />
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 2,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Nunito_500Medium',
    minHeight: 48,
  },
  // Soft glow ring, the native stand-in for the web input's focus box-shadow
  focused: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  error: {
    fontFamily: 'Nunito_400Regular', fontSize: 12,
    marginTop: 2,
  },
});
