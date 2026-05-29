import React from 'react';
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
        { label: 'Wallets', route: '/settings/wallets' },
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
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerEscape}>
          <AppHeader />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              {section.title}
            </Text>
            <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {section.items.map((item, idx) => (
                <React.Fragment key={item.label}>
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
                      <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
                    )}
                  </TouchableOpacity>
                </React.Fragment>
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
  headerEscape: { marginHorizontal: -16 },
  title: { fontSize: 26, fontWeight: '800' },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
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
  chevron: { fontSize: 20 },
  divider: { height: 1, marginHorizontal: 16 },
});
