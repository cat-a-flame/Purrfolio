import React from 'react';
import { View, TouchableOpacity, StyleSheet, useColorScheme, Dimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightColors, darkColors } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FAB_R = 28;              // FAB radius  (diameter 56)
const BAR_H = 60;              // visual bar height
const NOTCH_R = 44;            // horizontal half-width of notch at bar top
const NOTCH_SH = 14;           // shoulder: extra horizontal lead-in / lead-out
const NOTCH_D = FAB_R + 16;   // depth notch dips into the bar (44px)

// Two symmetric cubic bezier curves carving a smooth U-notch.
// The control points at 0.6× create a wide enough cavity for the FAB.
function buildPath(w: number, h: number): string {
  const cx = w / 2;
  return [
    `M 0 0`,
    `L ${cx - NOTCH_R - NOTCH_SH} 0`,
    `C ${cx - NOTCH_R} 0, ${cx - NOTCH_R * 0.6} ${NOTCH_D}, ${cx} ${NOTCH_D}`,
    `C ${cx + NOTCH_R * 0.6} ${NOTCH_D}, ${cx + NOTCH_R} 0, ${cx + NOTCH_R + NOTCH_SH} 0`,
    `L ${w} 0`,
    `L ${w} ${h}`,
    `L 0 ${h}`,
    `Z`,
  ].join(' ');
}

// Stroke-only path along the top edge (mirrors the fill path's upper boundary)
function buildTopEdge(w: number): string {
  const cx = w / 2;
  return [
    `M 0 0`,
    `L ${cx - NOTCH_R - NOTCH_SH} 0`,
    `C ${cx - NOTCH_R} 0, ${cx - NOTCH_R * 0.6} ${NOTCH_D}, ${cx} ${NOTCH_D}`,
    `C ${cx + NOTCH_R * 0.6} ${NOTCH_D}, ${cx + NOTCH_R} 0, ${cx + NOTCH_R + NOTCH_SH} 0`,
    `L ${w} 0`,
  ].join(' ');
}

const TAB_ICONS: Record<string, string> = {
  index: 'home-outline',
  transactions: 'list-outline',
  recurring: 'repeat-outline',
  stats: 'bar-chart-outline',
};

// Spacer width = full notch mouth width so icons don't crowd under the curve
const NOTCH_MOUTH = (NOTCH_R + NOTCH_SH) * 2;

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();

  const barHeight = BAR_H + bottom;
  // Container is taller than the bar so the FAB's top half is visible above.
  // The area above the SVG has no background — screen content shows through.
  const containerHeight = barHeight + FAB_R;

  const visibleRoutes = state.routes.filter((r) => r.name !== 'settings');
  const leftTabs = visibleRoutes.slice(0, 2);
  const rightTabs = visibleRoutes.slice(2, 4);

  function handleTabPress(route: (typeof state.routes)[number]) {
    const isFocused = state.routes[state.index].key === route.key;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
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
    <View style={{ height: containerHeight, backgroundColor: 'transparent' }}>

      {/* SVG bar — fills only the lower barHeight portion */}
      <View style={[styles.svgContainer, { height: barHeight }]}>
        <Svg
          width={SCREEN_WIDTH}
          height={barHeight}
          style={StyleSheet.absoluteFill}
        >
          {/* Bar body with notch */}
          <Path d={buildPath(SCREEN_WIDTH, barHeight)} fill={colors.surface} />
          {/* Subtle top-edge border that follows the curve */}
          <Path
            d={buildTopEdge(SCREEN_WIDTH)}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        </Svg>

        {/* Tab icon rows sit inside the bar */}
        <View style={[styles.tabRow, { height: BAR_H, paddingBottom: 20 }]}>
          <View style={styles.side}>{leftTabs.map(renderTab)}</View>
          <View style={{ width: NOTCH_MOUTH }} />
          <View style={styles.side}>{rightTabs.map(renderTab)}</View>
        </View>
      </View>

      {/* FAB — sits mostly inside the notch */}
      <View style={[styles.fabWrap, { bottom: barHeight - FAB_R - 20 }]}>
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
  svgContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
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
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: FAB_R * 2,
    height: FAB_R * 2,
    borderRadius: FAB_R,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
});
