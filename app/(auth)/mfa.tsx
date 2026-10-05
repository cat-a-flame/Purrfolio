import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { cleanCode } from '@/lib/mfa';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

/** Second sign-in step for users with 2FA on: the authenticator app code. */
export default function MfaScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify() {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    setError('');

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp[0];
    if (factorsError || !factor) {
      setLoading(false);
      setError(factorsError?.message ?? 'No authenticator app found for this account.');
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    setLoading(false);
    if (verifyError) {
      setCode('');
      setError('That code didn’t work. Check your app and try again.');
      return;
    }
    router.replace('/(tabs)');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Same card as the login screen */}
        <LinearGradient
          colors={RING}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ring, { shadowColor: colors.shadow }]}
        >
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.header}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logoImage}
              />
              <Text style={[styles.brand, { color: colors.heading }]}>Purrfolio</Text>
            </View>

            <View style={styles.form}>
              <Text style={[styles.formTitle, { color: colors.heading }]}>
                Two-factor authentication
              </Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                Open your authenticator app and enter the 6-digit code for Purrfolio.
              </Text>

              <AppInput
                value={code}
                onChangeText={v => setCode(cleanCode(v))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                autoFocus
                onSubmitEditing={handleVerify}
                style={styles.codeInput}
              />

              {error ? (
                <Text style={[styles.error, { color: colors.danger, backgroundColor: colors.dangerLight }]}>
                  {error}
                </Text>
              ) : null}

              <AppButton onPress={handleVerify} loading={loading} fullWidth style={styles.submitBtn}>
                Verify
              </AppButton>
            </View>

            <Text style={[styles.switchText, { color: colors.muted }]}>
              Not you?{' '}
              <Text style={[styles.link, { color: colors.accent }]} onPress={handleSignOut}>
                Sign out
              </Text>
            </Text>
          </View>
        </LinearGradient>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const RING = ['#7433e6', '#ec3f7a', '#22d3ee', '#7433e6'] as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  ring: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: 30,
    padding: 1.5,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 6,
  },
  card: {
    borderRadius: 28.5,
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  brand: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    fontFamily: 'Lora_700Bold',
  },
  form: { gap: 16 },
  formTitle: {
    fontSize: 22,
    letterSpacing: -0.4,
    fontFamily: 'Lora_700Bold',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Nunito_500Medium',
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    fontFamily: 'Nunito_500Medium',
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitBtn: { marginTop: 8 },
  switchText: {
    fontSize: 15,
    fontFamily: 'Nunito_500Medium',
    textAlign: 'center',
  },
  link: { fontFamily: 'Nunito_800ExtraBold' },
});
