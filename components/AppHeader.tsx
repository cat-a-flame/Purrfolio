import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Switch,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, useDarkMode } from '@/lib/theme';

interface Props {
  title: string;
  leftAction?: ReactNode;
}

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

type NavItem = { label: string; route: string; icon: string };

const SETTINGS_ITEMS: NavItem[] = [
  { label: 'Wallets',    route: '/settings/wallets',    icon: 'wallet-outline'   },
  { label: 'Categories', route: '/settings/categories', icon: 'grid-outline'     },
  { label: 'Labels',     route: '/settings/labels',     icon: 'pricetag-outline' },
  { label: 'Templates',  route: '/settings/templates',  icon: 'copy-outline'     },
];

export default function AppHeader({ title, leftAction }: Props) {
  const colors = useTheme();
  const { isDark, setIsDark } = useDarkMode();
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? null));
  }, []);

  function openDrawer() {
    setOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }

  function closeDrawer(cb?: () => void) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,            duration: 220, useNativeDriver: true }),
    ]).start(() => { setOpen(false); cb?.(); });
  }

  function navigate(route: string) { closeDrawer(() => router.push(route as any)); }

  async function handleSignOut() {
    closeDrawer(async () => {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    });
  }

  return (
    <>
      {/* ── Fixed top bar ────────────────────────────────────────────── */}
      <View style={[styles.bar, { backgroundColor: colors.bg }]}>
        <View style={styles.side}>
          {leftAction ?? null}
        </View>
        <Text style={[styles.barTitle, { color: colors.text }]}>{title}</Text>
        <View style={[styles.side, styles.sideRight]}>
          <TouchableOpacity onPress={openDrawer} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="menu-outline" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Slide-in drawer ──────────────────────────────────────────── */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => closeDrawer()}>
        {/* Backdrop */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: fadeAnim }]}
          pointerEvents="none"
        />

        {/* Dismiss area + drawer side by side */}
        <View style={styles.drawerRow}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeDrawer()} />

          <Animated.View style={[
            styles.drawer,
            { backgroundColor: colors.surface, borderLeftColor: colors.border, transform: [{ translateX: slideAnim }] },
          ]}>
            <View style={[styles.drawerInner, { paddingTop: top || 16 }]}>

              {/* Scrollable content */}
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

                {/* User email */}
                {email && (
                  <View style={[styles.emailRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.emailAvatar, { backgroundColor: colors.accent + '22' }]}>
                      <Ionicons name="person-outline" size={18} color={colors.accent} />
                    </View>
                    <Text style={[styles.emailText, { color: colors.muted }]} numberOfLines={1}>{email}</Text>
                  </View>
                )}

                {/* Settings */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Settings</Text>
                <View style={[styles.group, { borderColor: colors.border }]}>
                  {SETTINGS_ITEMS.map((item, i) => (
                    <TouchableOpacity
                      key={item.route}
                      style={[
                        styles.row,
                        i < SETTINGS_ITEMS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                      onPress={() => navigate(item.route)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={item.icon as any} size={18} color={colors.muted} />
                      <Text style={[styles.rowText, { color: colors.text }]}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Account */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Account</Text>
                <View style={[styles.group, { borderColor: colors.border }]}>
                  <TouchableOpacity style={styles.row} onPress={handleSignOut} activeOpacity={0.7}>
                    <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                    <Text style={[styles.rowText, { color: colors.danger }]}>Sign out</Text>
                  </TouchableOpacity>
                </View>

              </ScrollView>

              {/* Dark mode toggle pinned to bottom */}
              <View style={[styles.darkRow, { borderTopColor: colors.border, paddingBottom: bottom || 16 }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={18} color={colors.muted} />
                <Text style={[styles.rowText, { color: colors.text, flex: 1 }]}>Dark mode</Text>
                <Switch
                  value={isDark}
                  onValueChange={setIsDark}
                  trackColor={{ false: colors.border, true: colors.accent + '88' }}
                  thumbColor={isDark ? colors.accent : '#f4f4f4'}
                />
              </View>

            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 16,
  },
  side: { width: 36 },
  sideRight: { alignItems: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 22, fontFamily: 'Lora_600SemiBold' },

  drawerRow: { flex: 1, flexDirection: 'row' },
  drawer: {
    width: DRAWER_WIDTH,
    borderLeftWidth: 1,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  drawerInner: { flex: 1 },

  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  emailAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailText: { flex: 1, fontSize: 13 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  group: {
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowText: { flex: 1, fontSize: 15, fontFamily: 'Figtree_500Medium' },

  darkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
