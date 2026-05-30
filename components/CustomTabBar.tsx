import React from 'react';
import { View, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightColors, darkColors } from '@/lib/theme';

const FAB_SIZE = 56;
const BAR_HEIGHT = 60;
const NOTCH_SIZE = FAB_SIZE + 12;

const TAB_ICONS: Record<string, string> = {
  index: 'home-outline',
  transactions: 'list-outline',
  recurring: 'repeat-outline',
  stats: 'bar-chart-outline',
};

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();

  const visibleRoutes = state.routes.filter((r) => r.name !== 'settings');
  const leftTabs = visibleRoutes.slice(0, 2);
  const rightTabs = visibleRoutes.slice(2, 4);

  const barHeight = BAR_HEIGHT + bottom;

  function handleTabPress(route: (typeof state.routes)[number]) {
    const isFocused = state.routes[state.index].key === route.key;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }

  function renderTab(route: (typeof state.routes)[number]) {
    const isFocused = state.routes[state.index].key === route.key;
    const iconName = TAB_ICONS[route.name] ?? 'ellipse-outline';
    const color = isFocused ? colors.accent : colors.muted;

    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tab}
        onPress={() => handleTabPress(route)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
      >
        <View style={[styles.iconWrap, isFocused && { backgroundColor: colors.accent + '22' }]}>
          <Ionicons name={iconName as any} size={22} color={color} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    // Container is taller than the visual bar to give FAB room to float above.
    // Background is transparent so screen content shows behind the FAB area.
    <View style={{ height: barHeight + FAB_SIZE / 2 }}>

      {/* Tab bar background */}
      <View style={[
        styles.bar,
        {
          height: barHeight,
          paddingBottom: bottom,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}>
        <View style={styles.side}>{leftTabs.map(renderTab)}</View>
        {/* Gap for the notch */}
        <View style={{ width: NOTCH_SIZE + 8 }} />
        <View style={styles.side}>{rightTabs.map(renderTab)}</View>
      </View>

      {/* Notch circle — same color as screen background, "punches through" the bar */}
      <View style={[styles.centered, { bottom: barHeight - NOTCH_SIZE / 2 }]}>
        <View style={{
          width: NOTCH_SIZE,
          height: NOTCH_SIZE,
          borderRadius: NOTCH_SIZE / 2,
          backgroundColor: colors.bg,
        }} />
      </View>

      {/* FAB */}
      <View style={[styles.centered, { bottom: barHeight - FAB_SIZE / 2 }]}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent }]}
          onPress={() => router.push('/transaction/add')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconWrap: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
