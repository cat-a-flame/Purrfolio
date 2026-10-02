import { type ReactNode } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  onPress?: () => void;
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export default function AppButton({
  onPress,
  children,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
}: Props) {
  const colors = useTheme();
  const isPrimary = variant === 'primary';

  const bgColor = {
    primary: colors.accent,
    secondary: colors.surface,
    danger: colors.danger,
    ghost: 'transparent',
  }[variant];

  const textColor = {
    primary: '#ffffff',
    secondary: colors.text,
    danger: '#ffffff',
    ghost: colors.accent,
  }[variant];

  const content = loading ? (
    <ActivityIndicator color={textColor} size="small" />
  ) : (
    <Text style={[styles.text, { color: textColor }]}>{children}</Text>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bgColor },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        isPrimary && [styles.primaryShadow, { shadowColor: colors.accent }],
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
    >
      {isPrimary && (
        <LinearGradient
          colors={colors.gradientAccent}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 1, y: 0.7 }}
          style={styles.gradient}
        />
      )}
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 24,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 9999,
  },
  primaryShadow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.1,
  },
});
