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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      router.replace('/(tabs)');
    }
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
          <Text style={[styles.logo, { color: colors.accent }]}>Purrfolio</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Your personal budget pawsisstant
          </Text>
        </View>

        <View style={styles.form}>
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
          <View style={styles.passwordWrapper}>
            <Text style={[styles.passwordLabel, { color: colors.muted }]}>Password</Text>
            <View style={[styles.passwordField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.text }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={colors.placeholder}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>
          <AppButton onPress={handleLogin} loading={loading} fullWidth>
            Sign in
          </AppButton>
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text style={[styles.link, { color: colors.accent }]}>
            Don't have an account? Sign up
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
  header: {
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 36,
    fontFamily: 'Lora_700Bold',
  },
  subtitle: {
    fontSize: 15,
  },
  form: {
    gap: 16,
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
  link: {
    fontSize: 14,
    textAlign: 'center',
  },
  passwordWrapper: { gap: 4 },
  passwordLabel: { fontSize: 13, fontFamily: 'Figtree_500Medium', marginBottom: 2 },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
  },
  passwordInput: { flex: 1, fontSize: 15, padding: 0 },
});
