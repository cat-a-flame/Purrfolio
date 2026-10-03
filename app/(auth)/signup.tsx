import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

export default function SignupScreen() {
  const colors = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignup() {
    if (!email || !password || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.successTitle, { color: colors.text }]}>Check your email</Text>
        <Text style={[styles.successBody, { color: colors.muted }]}>
          We've sent a confirmation link to {email}. Once confirmed, you can sign in.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.accent }]}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
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
        <View style={styles.header}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logoImage} />
          <Text style={[styles.logo, { color: colors.heading }]}>Purrfolio</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Create your account</Text>
        </View>

        <View style={[styles.form, styles.card, { backgroundColor: colors.glassStrong, borderColor: colors.glassBorder, shadowColor: colors.shadow }]}>
          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <AppInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <AppInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
          />
          <AppInput
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
          />
          <AppButton onPress={handleSignup} loading={loading} fullWidth>
            Create account
          </AppButton>
        </View>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.accent }]}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
    marginBottom: 8,
  },
  logo: {
    fontSize: 36,
    letterSpacing: -0.7,
    fontFamily: 'Lora_700Bold',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
  },
  form: {
    gap: 16,
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 6,
  },
  error: {
    fontFamily: 'Nunito_400Regular', fontSize: 14,
    textAlign: 'center',
  },
  link: {
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  successBody: {
    fontFamily: 'Nunito_400Regular', fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
