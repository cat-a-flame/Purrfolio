import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

export default function LoginScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    // Stay on this screen (button spinning) while the root layout works out where
    // to go: 2FA code, onboarding or the dashboard.
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mirrors PurrfolioWeb's login card: brand header, form and sign-up
            link in one glass card framed by a gradient ring. */}
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
                style={[styles.logoImage, { shadowColor: colors.accent }]}
              />
              <Text style={[styles.brand, { color: colors.heading }]}>Purrfolio</Text>
              <Text style={[styles.tagline, { color: colors.muted }]}>
                Your personal budget tracker
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={[styles.formTitle, { color: colors.heading }]}>Sign in</Text>

              <View style={styles.field}>
                <FieldLabel text="Email" />
                <AppInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </View>

              <View style={styles.field}>
                <FieldLabel text="Password" />
                <View style={[styles.passwordField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    placeholderTextColor={colors.placeholder}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              {error ? (
                <Text style={[styles.error, { color: colors.danger, backgroundColor: colors.dangerLight }]}>
                  {error}
                </Text>
              ) : null}

              <AppButton onPress={handleLogin} loading={loading} fullWidth style={styles.submitBtn}>
                Sign in
              </AppButton>
            </View>

            <Text style={[styles.switchText, { color: colors.muted }]}>
              Don't have an account?{' '}
              <Text
                style={[styles.link, { color: colors.accent }]}
                onPress={() => router.push('/(auth)/signup')}
              >
                Create one
              </Text>
            </Text>
          </View>
        </LinearGradient>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Same stops as the web card's conic ring (#7433e6 → #ec3f7a → #22d3ee)
const RING = ['#7433e6', '#ec3f7a', '#22d3ee', '#7433e6'] as const;

function FieldLabel({ text }: { text: string }) {
  const colors = useTheme();
  return (
    <Text style={[styles.label, { color: colors.muted }]}>
      {text.toUpperCase()}
      <Text style={{ color: colors.danger }}> *</Text>
    </Text>
  );
}

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
    marginBottom: 8,
  },
  brand: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
    fontFamily: 'Lora_700Bold',
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Nunito_500Medium',
  },
  form: {
    gap: 16,
  },
  formTitle: {
    fontSize: 22,
    letterSpacing: -0.4,
    fontFamily: 'Lora_700Bold',
  },
  field: { gap: 4 },
  label: {
    fontSize: 11,
    letterSpacing: 0.44,
    fontFamily: 'Nunito_800ExtraBold',
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
  link: {
    fontFamily: 'Nunito_800ExtraBold',
  },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
  },
  passwordInput: { flex: 1, fontFamily: 'Nunito_500Medium', fontSize: 15, padding: 0 },
});
