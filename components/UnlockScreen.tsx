import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PinPad } from '@/components/PinPad';
import {
  verifyPin,
  isBiometricsEnabled,
  getSupportedBiometrics,
  authenticateWithBiometrics,
} from '@/lib/security';
import { useTheme } from '@/lib/theme';

const PIN_LENGTH = 4;

type Phase = 'biometric' | 'pin';

type Props = {
  onUnlocked: () => void;
};

export function UnlockScreen({ onUnlocked }: Props) {
  const colors = useTheme();
  const [phase, setPhase] = useState<Phase>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [biometricsType, setBiometricsType] = useState<'face' | 'fingerprint' | null>(null);

  const tryBiometrics = useCallback(async () => {
    const success = await authenticateWithBiometrics();
    if (success) {
      onUnlocked();
    } else {
      // Biometrics failed or was cancelled — fall back to PIN
      setPhase('pin');
    }
  }, [onUnlocked]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [enabled, sup] = await Promise.all([isBiometricsEnabled(), getSupportedBiometrics()]);
      const hardwareAvailable = sup.face || sup.fingerprint;
      if (cancelled) return;
      if (enabled && hardwareAvailable) {
        setBiometricsType(sup.face ? 'face' : 'fingerprint');
        setPhase('biometric');
        tryBiometrics();
      } else {
        setPhase('pin');
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  async function handleKey(key: string) {
    if (error) setError(false);
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      const ok = await verifyPin(next);
      if (ok) {
        onUnlocked();
      } else {
        setError(true);
        setTimeout(() => { setPin(''); setError(false); }, 600);
      }
    }
  }

  function handleDelete() {
    if (error) { setPin(''); setError(false); return; }
    setPin(p => p.slice(0, -1));
  }

  // ── Biometric phase ──────────────────────────────────────────────────────────
  if (phase === 'biometric') {
    const icon = biometricsType === 'face' ? 'scan-outline' : 'finger-print-outline';
    const label = biometricsType === 'face' ? 'Face ID' : 'Fingerprint';
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.appName, { color: colors.accent }]}>Purrfolio</Text>
        <View style={styles.biometricCenter}>
          <TouchableOpacity
            style={[styles.bioButton, { borderColor: colors.accent }]}
            onPress={tryBiometrics}
            activeOpacity={0.7}
          >
            <Ionicons name={icon} size={52} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.bioLabel, { color: colors.muted }]}>
            Tap to unlock with {label}
          </Text>
          <TouchableOpacity onPress={() => setPhase('pin')} activeOpacity={0.7}>
            <Text style={[styles.usePinLink, { color: colors.accent }]}>Use PIN instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── PIN phase ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.appName, { color: colors.accent }]}>Purrfolio</Text>
      <PinPad
        title="Enter your PIN"
        pin={pin}
        error={error}
        onKey={handleKey}
        onDelete={handleDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appName: {
    fontSize: 40,
    fontFamily: 'Lora_700Bold',
    textAlign: 'center',
    marginTop: 72,
    letterSpacing: 1,
  },
  biometricCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  bioButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioLabel: {
    fontSize: 15,
    fontFamily: 'Figtree_400Regular',
  },
  usePinLink: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
    marginTop: 8,
  },
});
