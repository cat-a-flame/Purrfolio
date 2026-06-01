import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import AppInput from '@/components/AppInput';
import AppButton from '@/components/AppButton';

export default function AccountScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUsername(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? '');
      setEmail(user?.email ?? '');
    });
  }, []);

  async function handleSaveUsername() {
    if (!username.trim()) return;
    setSavingUsername(true);
    const { error } = await supabase.auth.updateUser({ data: { name: username.trim() } });
    setSavingUsername(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Username updated.');
    }
  }

  async function handleSaveEmail() {
    if (!email.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSavingEmail(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Check your inbox', 'A confirmation link has been sent to your new email address.');
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Account" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>PROFILE</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="Enter a username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {savingUsername ? (
              <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-end' }} />
            ) : (
              <TouchableOpacity
                onPress={handleSaveUsername}
                activeOpacity={0.7}
                style={[styles.saveButton, { borderColor: colors.accent }]}
              >
                <Text style={[styles.saveButtonText, { color: colors.accent }]}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>EMAIL</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppInput
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.hint, { color: colors.muted }]}>
              A confirmation link will be sent to verify the new address.
            </Text>
            {savingEmail ? (
              <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-end' }} />
            ) : (
              <TouchableOpacity
                onPress={handleSaveEmail}
                activeOpacity={0.7}
                style={[styles.saveButton, { borderColor: colors.accent }]}
              >
                <Text style={[styles.saveButtonText, { color: colors.accent }]}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[styles.signOutButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={[styles.signOutText, { color: colors.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingBottom: 40, gap: 24 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Figtree_400Regular',
    marginTop: -4,
  },
  saveButton: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: 'Figtree_600SemiBold',
  },
  signOutButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
  },
});
