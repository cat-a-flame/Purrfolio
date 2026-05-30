import React from 'react';
import { TextInput, TextInputProps, StyleSheet, View, Text } from 'react-native';
import { useTheme } from '@/lib/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export default function AppInput({ label, error, style, ...props }: Props) {
  const colors = useTheme();

  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
          },
          style,
        ]}
        placeholderTextColor={colors.placeholder}
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
    fontFamily: 'Comfortaa_500Medium',
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 42,
  },
  error: {
    fontSize: 12,
    marginTop: 2,
  },
});
