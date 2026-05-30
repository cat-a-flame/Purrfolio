import React from 'react';
import { View, TouchableOpacity, StyleSheet, useColorScheme, Dimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightColors, darkColors } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FAB_R = 28;           // FAB radius (diameter 56)
const BAR_H = 56;           // visual bar height (excludes safe-area inset)

// Screens should add TAB_BAR_HEIGHT + useSafeAreaInsets().bottom as bottom padding
// so content isn't hidden behind the floating tab bar.
export const TAB_BAR_HEIGHT = BAR_H + FAB_R; // 84 px

// ── Notch tuning knobs ──────────────────────
const NOTCH_R  = 36; // circle radius — increase for more clearance around FAB
const NOTCH_Y  = 0; // notch depth: how far the arc dips below the bar top
const CORNER_R = 12; // radius of the fillet where the arc meets the bar top edge
const FAB_EXTRA_Y = 12; // extra px to push the FAB down independently of the notch
// ────────────────────────────────────────────

// Horizontal distance from centre to where the raw circle crosses y=0
const NOTCH_DX = Math.sqrt(Math.max(0, NOTCH_R * NOTCH_R - NOTCH_Y * NOTCH_Y));
const NOTCH_MOUTH = NOTCH_DX * 2 + 16; // gap reserved in tab row

// Arc-tangent unit vector at the left entry point of the notch circle.
// Used to build G1-continuous quadratic bezier fillets at both corners.
const FILLET_TX = NOTCH_Y / NOTCH_R;   // x component (rightward)
const FILLET_TY = NOTCH_DX / NOTCH_R;  // y component (downward)
const FILLET_LY = CORNER_R * FILLET_TY; // y of both fillet endpoints (symmetric)

// Single circular-arc notch with smooth corner fillets.
// Each fillet is a Q bezier: control at the raw corner, end on the arc tangent.
function buildPath(w: number, h: number): string {
  const cx = w / 2;
  const lx = cx - NOTCH_DX + CORNER_R * FILLET_TX;
  const rx = cx + NOTCH_DX - CORNER_R * FILLET_TX;
  return [
    `M 0 0`,
    `L ${cx - NOTCH_DX - CORNER_R} 0`,
    `Q ${cx - NOTCH_DX} 0 ${lx} ${FILLET_LY}`,
    `A ${NOTCH_R} ${NOTCH_R} 0 1 0 ${rx} ${FILLET_LY}`,
    `Q ${cx + NOTCH_DX} 0 ${cx + NOTCH_DX + CORNER_R} 0`,
    `L ${w} 0`,
    `L ${w} ${h}`,
    `L 0 ${h}`,
    `Z`,
  ].join(' ');
}

function buildTopEdge(w: number): string {
  const cx = w / 2;
  const lx = cx - NOTCH_DX + CORNER_R * FILLET_TX;
  const rx = cx + NOTCH_DX - CORNER_R * FILLET_TX;
  return [
    `M 0 0`,
    `L ${cx - NOTCH_DX - CORNER_R} 0`,
    `Q ${cx - NOTCH_DX} 0 ${lx} ${FILLET_LY}`,
    `A ${NOTCH_R} ${NOTCH_R} 0 1 0 ${rx} ${FILLET_LY}`,
    `Q ${cx + NOTCH_DX} 0 ${cx + NOTCH_DX + CORNER_R} 0`,
    `L ${w} 0`,
  ].join(' ');
}

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

  const barHeight = BAR_H + bottom;
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
    <View style={[styles.container, { height: containerHeight }]} pointerEvents="box-none">

      {/* SVG bar fills the lower barHeight portion */}
      <View style={[styles.svgContainer, { height: barHeight }]}>
        <Svg width={SCREEN_WIDTH} height={barHeight} style={StyleSheet.absoluteFill}>
          <Path d={buildPath(SCREEN_WIDTH, barHeight)} fill={colors.surface} />
          <Path
            d={buildTopEdge(SCREEN_WIDTH)}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        </Svg>

        {/* Tab icons — anchored above the safe-area inset so they stay in the visual bar */}
        <View style={[styles.tabRow, { height: BAR_H, bottom: bottom }]}>
          <View style={styles.side}>{leftTabs.map(renderTab)}</View>
          <View style={{ width: NOTCH_MOUTH }} />
          <View style={styles.side}>{rightTabs.map(renderTab)}</View>
        </View>
      </View>

      {/* FAB sits 20 px below bar top, inside the notch */}
      <View style={[styles.fabWrap, { bottom: barHeight - FAB_R - NOTCH_Y - FAB_EXTRA_Y }]}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: '#7c3aed' }]}
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
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // no backgroundColor — only the SVG fill and the FAB button draw anything
  },
  svgContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    position: 'absolute',
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
