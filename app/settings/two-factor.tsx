import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { cleanCode } from '@/lib/mfa';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

type Enrollment = { factorId: string; qrSvg: string; secret: string; uri: string };

/** Turns authenticator-app 2FA (TOTP) on or off. */
export default function TwoFactorScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // An unfinished setup is removed when leaving the screen.
  const pendingFactor = useRef<string | null>(null);
  useEffect(() => () => {
    if (pendingFactor.current) {
      supabase.auth.mfa.unenroll({ factorId: pendingFactor.current });
    }
  }, []);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const id = data?.totp[0]?.id ?? null;
      setFactorId(id);
      setLoaded(true);
      // Opened from the switch while off: go straight to setup.
      if (data && !id) startSetup();
    });
  }, []);

  async function startSetup() {
    setStarting(true);
    // A setup abandoned earlier leaves an unverified factor behind, which
    // would block a new one with the same name.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
      issuer: 'Purrfolio',
    });
    setStarting(false);
    if (enrollError || !data) {
      Alert.alert('Error', enrollError?.message ?? 'Could not start 2FA setup.');
      router.back();
      return;
    }
    pendingFactor.current = data.id;
    setCode('');
    setError('');
    setEnrollment({
      factorId: data.id,
      // qr_code is an SVG data URI; SvgXml wants the bare markup.
      qrSvg: data.totp.qr_code.replace(/^data:image\/svg\+xml;[^,]*,/, ''),
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  }

  async function openInAuthenticator() {
    if (!enrollment) return;
    try {
      await Linking.openURL(enrollment.uri);
    } catch {
      Alert.alert(
        'No authenticator app found',
        'Install an authenticator app, or add the setup key below to it by hand.',
      );
    }
  }

  async function handleSubmit() {
    const targetId = enrollment?.factorId ?? factorId;
    if (!targetId) return;
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: targetId,
      code,
    });
    if (verifyError) {
      setBusy(false);
      setCode('');
      setError('That code didn’t work. Check your app and try again.');
      return;
    }

    if (enrollment) {
      pendingFactor.current = null;
      setBusy(false);
      Alert.alert('2FA is on', 'You’ll be asked for a code from your authenticator app each time you sign in.');
      router.back();
      return;
    }

    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: targetId });
    if (unenrollError) {
      setBusy(false);
      setError(unenrollError.message);
      return;
    }
    // Pick up the user's new factor list in the stored session.
    await supabase.auth.refreshSession();
    setBusy(false);
    Alert.alert('2FA is off', 'Signing in will only need your password.');
    router.back();
  }

  const enabled = !!factorId;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Two-factor authentication" showBack />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!loaded || starting ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
        ) : enrollment ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.step, { color: colors.text }]}>
              1. Add Purrfolio to your authenticator app.
            </Text>
            <AppButton variant="secondary" onPress={openInAuthenticator} fullWidth>
              Open in authenticator app
            </AppButton>
            <Text style={[styles.hint, { color: colors.muted }]}>
              Setting up on another device? Scan this QR code:
            </Text>
            <View style={styles.qr}>
              <SvgXml xml={enrollment.qrSvg} width={180} height={180} />
            </View>
            <Text style={[styles.hint, { color: colors.muted }]}>Or enter this setup key:</Text>
            <Text selectable style={[styles.secret, { color: colors.text, backgroundColor: colors.surface2 }]}>
              {enrollment.secret}
            </Text>

            <Text style={[styles.step, { color: colors.text }]}>
              2. Enter the 6-digit code the app shows.
            </Text>
            <AppInput
              value={code}
              onChangeText={v => setCode(cleanCode(v))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              error={error}
              style={styles.codeInput}
            />
            <AppButton onPress={handleSubmit} loading={busy} fullWidth>
              Turn on
            </AppButton>
          </View>
        ) : enabled ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.text }]}>
              To turn off two-factor authentication, enter a current code from your authenticator app.
            </Text>
            <AppInput
              value={code}
              onChangeText={v => setCode(cleanCode(v))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              error={error}
              style={styles.codeInput}
            />
            <AppButton variant="danger" onPress={handleSubmit} loading={busy} fullWidth>
              Turn off
            </AppButton>
          </View>
        ) : (
          <Text style={[styles.body, { color: colors.muted, textAlign: 'center' }]}>
            Couldn’t load your two-factor settings. Check your connection and try again.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  body: { fontSize: 15, lineHeight: 21, fontFamily: 'Nunito_400Regular' },
  step: { fontSize: 15, fontFamily: 'Nunito_700Bold' },
  hint: { fontSize: 13, fontFamily: 'Nunito_400Regular' },
  qr: {
    alignSelf: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  secret: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 14,
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
});
