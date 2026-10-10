import { Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';

export default function FieldError({ message, center }: { message?: string; center?: boolean }) {
  const colors = useTheme();
  if (!message) return null;
  return (
    <Text style={[styles.error, { color: colors.danger }, center && styles.center]}>{message}</Text>
  );
}

const styles = StyleSheet.create({
  error: { fontFamily: 'Nunito_400Regular', fontSize: 12, marginTop: 4 },
  center: { textAlign: 'center' },
});
