import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import { PinPad } from '@/components/PinPad';
import {
  isPinEnabled,
  verifyPin,
  savePin,
  disablePin,
  isFaceEnabled,
  setFaceEnabled,
  isFingerprintEnabled,
  setFingerprintEnabled,
  getSupportedBiometrics,
} from '@/lib/security';

type Phase =
  | 'idle'
  | 'disable_verify'
  | 'setup_new'
  | 'setup_confirm'
  | 'change_verify'
  | 'change_new'
  | 'change_confirm';

const PIN_LENGTH = 4;

export default function SecurityScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [pinEnabled, setPinEnabled] = useState(false);
  const [faceEnabled, setFaceEnabledState] = useState(false);
  const [fingerprintEnabled, setFingerprintEnabledState] = useState(false);
  const [supported, setSupported] = useState({ face: false, fingerprint: false });
  const [phase, setPhase] = useState<Phase>('idle');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [pe, fe, fpe, sup] = await Promise.all([
      isPinEnabled(),
      isFaceEnabled(),
      isFingerprintEnabled(),
      getSupportedBiometrics(),
    ]);
    setPinEnabled(pe);
    setFaceEnabledState(fe);
    setFingerprintEnabledState(fpe);
    setSupported(sup);
  }

  // ── PIN toggle ──────────────────────────────────────────────────────────────

  function handlePinToggle(value: boolean) {
    if (value) {
      setPin('');
      setPhase('setup_new');
    } else {
      setPin('');
      setPhase('disable_verify');
    }
  }

  // ── Biometrics toggles ──────────────────────────────────────────────────────

  async function handleFaceToggle(value: boolean) {
    await setFaceEnabled(value);
    setFaceEnabledState(value);
  }

  async function handleFingerprintToggle(value: boolean) {
    await setFingerprintEnabled(value);
    setFingerprintEnabledState(value);
  }

  // ── Key input ───────────────────────────────────────────────────────────────

  const handleKey = useCallback(async (key: string) => {
    if (error) setError(false);
    const next = pin + key;
    setPin(next);

    if (next.length < PIN_LENGTH) return;

    switch (phase) {
      case 'disable_verify': {
        const ok = await verifyPin(next);
        if (ok) {
          await disablePin();
          setPinEnabled(false);
          setBioEnabled(false);
          setPhase('idle');
          setPin('');
        } else {
          setError(true);
          setTimeout(() => { setPin(''); setError(false); }, 600);
        }
        break;
      }
      case 'setup_new': {
        setNewPin(next);
        setPin('');
        setPhase('setup_confirm');
        break;
      }
      case 'setup_confirm': {
        if (next === newPin) {
          await savePin(next);
          setPinEnabled(true);
          setPhase('idle');
          setPin('');
          setNewPin('');
        } else {
          setError(true);
          setTimeout(() => { setPin(''); setError(false); }, 600);
        }
        break;
      }
      case 'change_verify': {
        const ok = await verifyPin(next);
        if (ok) {
          setPin('');
          setPhase('change_new');
        } else {
          setError(true);
          setTimeout(() => { setPin(''); setError(false); }, 600);
        }
        break;
      }
      case 'change_new': {
        setNewPin(next);
        setPin('');
        setPhase('change_confirm');
        break;
      }
      case 'change_confirm': {
        if (next === newPin) {
          await savePin(next);
          setPhase('idle');
          setPin('');
          setNewPin('');
          Alert.alert('PIN updated', 'Your PIN has been changed.');
        } else {
          setError(true);
          setTimeout(() => { setPin(''); setError(false); }, 600);
        }
        break;
      }
    }
  }, [pin, phase, newPin, error]);

  function handleDelete() {
    if (error) { setPin(''); setError(false); return; }
    setPin(p => p.slice(0, -1));
  }

  function cancelPhase() {
    setPhase('idle');
    setPin('');
    setNewPin('');
    setError(false);
  }

  // ── PIN pad phases ──────────────────────────────────────────────────────────

  const phaseTitle: Record<Exclude<Phase, 'idle'>, string> = {
    disable_verify: 'Enter your current PIN',
    setup_new: 'Create a PIN',
    setup_confirm: 'Confirm your PIN',
    change_verify: 'Enter your current PIN',
    change_new: 'Enter a new PIN',
    change_confirm: 'Confirm new PIN',
  };

  const phaseSubtitle: Partial<Record<Phase, string>> = {
    setup_new: 'Choose a 4-digit PIN to secure your app',
    setup_confirm: 'Enter the same PIN again',
    change_confirm: 'Enter the same PIN again',
  };

  if (phase !== 'idle') {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
        <AppHeader title="Security" onBack={cancelPhase} />
        <PinPad
          title={phaseTitle[phase]}
          subtitle={phaseSubtitle[phase]}
          pin={pin}
          error={error}
          onKey={handleKey}
          onDelete={handleDelete}
        />
      </SafeAreaView>
    );
  }

  // ── Idle: settings list ─────────────────────────────────────────────────────

  const bioOptions = [
    { key: 'face',        label: 'Face ID',     available: supported.face,        enabled: faceEnabled,        onToggle: handleFaceToggle },
    { key: 'fingerprint', label: 'Fingerprint', available: supported.fingerprint, enabled: fingerprintEnabled, onToggle: handleFingerprintToggle },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Security" />
      <View style={styles.container}>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>APP LOCK</Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Require PIN</Text>
              <Switch
                value={pinEnabled}
                onValueChange={handlePinToggle}
                trackColor={{ true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {pinEnabled && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { setPin(''); setPhase('change_verify'); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Change PIN</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {pinEnabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>BIOMETRICS</Text>
            <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {bioOptions.map((opt, idx) => (
                <React.Fragment key={opt.key}>
                  {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: opt.available ? colors.text : colors.muted }]}>
                        {opt.label}
                      </Text>
                      {!opt.available && (
                        <Text style={[styles.rowHint, { color: colors.muted }]}>
                          Requires a development build
                        </Text>
                      )}
                    </View>
                    <Switch
                      value={opt.enabled}
                      onValueChange={opt.available ? opt.onToggle : undefined}
                      disabled={!opt.available}
                      trackColor={{ true: colors.accent }}
                      thumbColor="#fff"
                    />
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 24, gap: 24 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginHorizontal: 16 },
});
