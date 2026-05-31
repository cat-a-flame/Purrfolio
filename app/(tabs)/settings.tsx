import { Fragment } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@/components/AppHeader';

type SettingsItem = {
  label: string;
  route?: string;
  onPress?: () => void;
  danger?: boolean;
};

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();

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

  const sections: { title: string; items: SettingsItem[] }[] = [
    {
      title: 'Manage',
      items: [
        { label: 'Accounts', route: '/settings/wallets' },
        { label: 'Categories', route: '/settings/categories' },
        { label: 'Labels', route: '/settings/labels' },
        { label: 'Templates', route: '/settings/templates' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Sign out', onPress: handleSignOut, danger: true },
      ],
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.container}>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              {section.title}
            </Text>
            <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {section.items.map((item, idx) => (
                <Fragment key={item.label}>
                  {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={item.onPress ?? (() => item.route && router.push(item.route as any))}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: item.danger ? colors.danger : colors.text },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {!item.danger && (
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                </Fragment>
              ))}
            </View>
          </View>
        ))}
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
  divider: { height: 1, marginHorizontal: 16 },
});
