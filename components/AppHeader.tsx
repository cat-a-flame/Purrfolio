import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function AppHeader() {
  const colors = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const btnRef = useRef<TouchableOpacity>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);

  function openMenu() {
    btnRef.current?.measureInWindow((_x, y, _w, h) => {
      setMenuTop(y + h + 6);
      setMenuOpen(true);
    });
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} />
          <Text style={[styles.logoName, { color: colors.text }]}>Purrfolio</Text>
        </View>
        <TouchableOpacity
          ref={btnRef}
          style={[styles.avatarBtn, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' }]}
          onPress={openMenu}
          activeOpacity={0.7}
        >
          <Text style={[styles.avatarIcon, { color: colors.accent }]}>👤</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[
            styles.menu,
            { top: menuTop, backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
            {email && (
              <Text
                style={[styles.menuEmail, { color: colors.muted, borderBottomColor: colors.border }]}
                numberOfLines={1}
              >
                {email}
              </Text>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  logoName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarIcon: { fontSize: 17 },
  overlay: { flex: 1 },
  menu: {
    position: 'absolute',
    right: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 220,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  menuEmail: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    borderBottomWidth: 1,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: { fontSize: 15, fontWeight: '600' },
});
