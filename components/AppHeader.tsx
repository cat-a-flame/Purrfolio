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
  rightAction?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

export default function AppHeader({ title, rightAction, showBack, onBack }: Props) {
  const colors = useTheme();
  const { isDark, setIsDark } = useDarkMode();
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setUsername(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? null);
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

  const appSettingsItems = [
    { label: 'Categories', route: '/settings/categories', icon: 'grid-outline'     },
    { label: 'Labels',     route: '/settings/labels',     icon: 'pricetag-outline' },
  ];

  return (
    <>
      {/* ── Fixed top bar ────────────────────────────────────────────── */}
      <View style={[styles.bar, { backgroundColor: colors.bg }]}>
        <View style={styles.side}>
          {showBack ? (
            <TouchableOpacity onPress={onBack ?? (() => router.back())} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={24} color={colors.accent} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={openDrawer} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="menu" size={26} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.barTitle, { color: colors.text }]}>{title}</Text>
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
            { backgroundColor: colors.surface, borderRightColor: colors.border, transform: [{ translateX: slideAnim }] },
          ]}>
            <View style={[styles.drawerInner, { paddingTop: top || 16 }]}>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* ── App Settings ───────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>App Settings</Text>
                <View style={[styles.group, { borderColor: colors.border }]}>
                  {appSettingsItems.map((item, i) => (
                    <TouchableOpacity
                      key={item.route}
                      style={[styles.row, i < appSettingsItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                      onPress={() => navigate(item.route)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={item.icon as any} size={18} color={colors.muted} />
                      <Text style={[styles.rowText, { color: colors.text }]}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Account Settings ───────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Account Settings</Text>
                <View style={[styles.group, { borderColor: colors.border }]}>
                  <TouchableOpacity style={styles.row} onPress={() => navigate('/settings/account')} activeOpacity={0.7}>
                    <Ionicons name="person-outline" size={18} color={colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
                        {username || email || 'My Account'}
                      </Text>
                      {username && email ? (
                        <Text style={[styles.rowSubLabel, { color: colors.muted }]} numberOfLines={1}>{email}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                {/* ── Security ───────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Security</Text>
                <View style={[styles.group, { borderColor: colors.border }]}>
                  <TouchableOpacity style={styles.row} onPress={() => navigate('/settings/security')} activeOpacity={0.7}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
                    <Text style={[styles.rowText, { color: colors.text }]}>Security</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
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
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => closeDrawer()} />
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
    borderRightWidth: 1,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  drawerInner: { flex: 1 },
  scrollContent: { paddingBottom: 8 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Figtree_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 20,
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
  rowSubLabel: { fontSize: 11, fontFamily: 'Figtree_400Regular', marginBottom: 1 },

  darkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
