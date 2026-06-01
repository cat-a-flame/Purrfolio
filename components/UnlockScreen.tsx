import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PinPad } from '@/components/PinPad';
import {
  verifyPin,
  isBiometricsEnabled,
  getSupportedBiometrics,
  authenticateWithBiometrics,
} from '@/lib/security';
import { useTheme } from '@/lib/theme';

const PIN_LENGTH = 4;

type Props = {
  onUnlocked: () => void;
};

export function UnlockScreen({ onUnlocked }: Props) {
  const colors = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsType, setBiometricsType] = useState<'face' | 'fingerprint' | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [enabled, sup] = await Promise.all([isBiometricsEnabled(), getSupportedBiometrics()]);
      const hardwareAvailable = sup.face || sup.fingerprint;
      if (cancelled) return;
      setBiometricsEnabled(enabled && hardwareAvailable);
      setBiometricsType(sup.face ? 'face' : sup.fingerprint ? 'fingerprint' : null);
      if (enabled && hardwareAvailable) tryBiometrics();
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const tryBiometrics = useCallback(async () => {
    const success = await authenticateWithBiometrics();
    if (success) onUnlocked();
  }, [onUnlocked]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.appName, { color: colors.accent }]}>Purrfolio</Text>
      <PinPad
        title="Enter your PIN"
        pin={pin}
        error={error}
        showBiometrics={biometricsEnabled}
        biometricsType={biometricsType}
        onKey={handleKey}
        onDelete={handleDelete}
        onBiometrics={tryBiometrics}
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
});
