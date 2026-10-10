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
import { useRouter, usePathname } from 'expo-router';
import ReportBugModal from '@/components/ReportBugModal';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useTheme, useDarkMode } from '@/lib/theme';

interface Props {
  title: string;
  rightAction?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

export default function AppHeader({ title, rightAction, showBack, onBack }: Props) {
  const colors = useTheme();
  const { isDark, setIsDark } = useDarkMode();
  const router = useRouter();
  const pathname = usePathname();
  const [bugVisible, setBugVisible] = useState(false);
  const { top, bottom } = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setUsername(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? null);
      // app_metadata can only be changed server-side (unlike user_metadata)
      setIsAdmin(user?.app_metadata?.role === 'admin');
    });
  }, []);

  function openDrawer() {
    slideAnim.setValue(-DRAWER_WIDTH);
    fadeAnim.setValue(0);
    setOpen(true);
  }

  function closeDrawer(cb?: () => void) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,             duration: 220, useNativeDriver: true }),
    ]).start(() => { setOpen(false); cb?.(); });
  }

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    }
  }, [open]);

  function navigate(route: string) { closeDrawer(() => router.push(route as any)); }

  const menuItems: { label: string; route?: string; onPress?: () => void; icon: string }[] = [
    { label: 'Accounts',   route: '/settings/accounts',   icon: 'wallet-outline'       },
    { label: 'Categories', route: '/settings/categories', icon: 'grid-outline'         },
    { label: 'Labels',     route: '/settings/labels',     icon: 'pricetag-outline'     },
    { label: 'Security',   route: '/settings/security',   icon: 'lock-closed-outline'  },
    { label: 'Export',     route: '/settings/export',     icon: 'download-outline'     },
    { label: 'Report a bug', onPress: () => closeDrawer(() => setBugVisible(true)), icon: 'bug-outline' },
  ];

  const initial = (username || email || '?').charAt(0).toUpperCase();

  return (
    <>
      {/* ── Fixed top bar ────────────────────────────────────────────── */}
      <View style={styles.bar}>
        <View style={styles.side}>
          <TouchableOpacity
            onPress={showBack ? (onBack ?? (() => router.back())) : openDrawer}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showBack ? 'Back' : 'Open menu'}
            style={[styles.iconBtn, { backgroundColor: colors.glassStrong, borderColor: colors.border, shadowColor: colors.shadow }]}
          >
            <Ionicons name={showBack ? 'arrow-back' : 'menu'} size={20} color={showBack ? colors.accent : colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.barTitle, { color: colors.heading }]} numberOfLines={1}>{title}</Text>
        <View style={[styles.side, styles.sideRight]}>
          {rightAction ?? null}
        </View>
      </View>

      {/* ── Slide-in drawer ──────────────────────────────────────────── */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => closeDrawer()}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: fadeAnim }]}
          pointerEvents="none"
        />

        <View style={styles.drawerRow}>
          <Animated.View style={[
            styles.drawer,
            { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ translateX: slideAnim }] },
          ]}>
            <View style={[styles.drawerInner, { paddingTop: top || 16 }]}>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* ── User info ────────────────────────────────── */}
                <TouchableOpacity style={styles.userRow} onPress={() => navigate('/settings/account')} activeOpacity={0.7}>
                  <LinearGradient
                    colors={colors.gradientAccent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>{initial}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                      {username || 'My Account'}
                    </Text>
                    {email ? (
                      <Text style={[styles.userEmail, { color: colors.muted }]} numberOfLines={1}>{email}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </TouchableOpacity>

                {/* ── Menu ─────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Menu</Text>
                {menuItems.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.row}
                    onPress={item.onPress ?? (() => item.route && navigate(item.route))}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.accentLight }]}>
                      <Ionicons name={item.icon as any} size={18} color={colors.accent} />
                    </View>
                    <Text style={[styles.rowText, { color: colors.text }]}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ))}

              </ScrollView>

              {isAdmin && (
                <Text style={[styles.version, { color: colors.muted }]}>
                  Version {Constants.expoConfig?.version ?? '–'}
                </Text>
              )}

              {/* Light/Dark mode toggle pinned to bottom */}
              <View style={[styles.darkRow, { borderTopColor: colors.border, paddingBottom: bottom || 16 }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={18} color={colors.muted} />
                <Text style={[styles.rowText, { color: colors.text, flex: 1 }]}>{isDark ? 'Dark mode' : 'Light mode'}</Text>
                <Switch
                  value={isDark}
                  onValueChange={setIsDark}
                  trackColor={{ false: colors.border, true: colors.accent + '88' }}
                  thumbColor={isDark ? colors.accent : '#f4f4f4'}
                />
              </View>
            </View>
          </Animated.View>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeDrawer()} />
        </View>
      </Modal>

      <ReportBugModal visible={bugVisible} page={pathname} onClose={() => setBugVisible(false)} />
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
  side: { width: 38 },
  sideRight: { alignItems: 'flex-end' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 24, fontFamily: 'Lora_700Bold', letterSpacing: -0.5 },

  drawerRow: { flex: 1, flexDirection: 'row' },
  drawer: {
    width: DRAWER_WIDTH,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  drawerInner: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontFamily: 'Nunito_800ExtraBold', color: '#fff' },
  userName: { fontSize: 18, fontFamily: 'Lora_700Bold', letterSpacing: -0.3 },
  userEmail: { fontSize: 13, fontFamily: 'Nunito_400Regular', marginTop: 2 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_800ExtraBold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 16, fontFamily: 'Nunito_700Bold' },

  version: { fontSize: 12, fontFamily: 'Nunito_600SemiBold', paddingHorizontal: 20, paddingBottom: 10 },
  darkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
