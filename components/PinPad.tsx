import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

const PIN_LENGTH = 4;

type Props = {
  title: string;
  subtitle?: string;
  pin: string;
  error: boolean;
  showBiometrics?: boolean;
  biometricsType?: 'fingerprint' | null;
  onKey: (key: string) => void;
  onDelete: () => void;
  onBiometrics?: () => void;
};

export function PinPad({
  title,
  subtitle,
  pin,
  error,
  showBiometrics,
  biometricsType,
  onKey,
  onDelete,
  onBiometrics,
}: Props) {
  const colors = useTheme();
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [error]);

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [showBiometrics ? 'bio' : '', '0', 'del'],
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}

      {/* Dots */}
      <Animated.View
        style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i < pin.length
                    ? error ? colors.danger : colors.accent
                    : 'transparent',
                borderColor: error ? colors.danger : colors.accent,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Numpad */}
      <View style={styles.pad}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ki) => {
              if (key === '') {
                return <View key={ki} style={styles.keyPlaceholder} />;
              }
              if (key === 'del') {
                return (
                  <TouchableOpacity
                    key={ki}
                    style={[styles.key, { backgroundColor: colors.surface }]}
                    onPress={onDelete}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="backspace-outline" size={24} color={colors.text} />
                  </TouchableOpacity>
                );
              }
              if (key === 'bio') {
                return (
                  <TouchableOpacity
                    key={ki}
                    style={[styles.key, { backgroundColor: colors.surface }]}
                    onPress={onBiometrics}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="finger-print-outline" size={26} color={colors.accent} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={ki}
                  style={[styles.key, { backgroundColor: colors.surface }]}
                  onPress={() => onKey(key)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.keyLabel, { color: colors.text }]}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Figtree_600SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    textAlign: 'center',
    marginTop: -20,
  },
  dots: {
    flexDirection: 'row',
    gap: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  pad: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPlaceholder: {
    width: 76,
    height: 76,
  },
  keyLabel: {
    fontSize: 26,
    fontFamily: 'Figtree_400Regular',
  },
});
