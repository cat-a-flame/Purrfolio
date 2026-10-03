import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
type Route = { key: string; name: string };
type TabBarProps = {
  state: { routes: Route[]; index: number };
  navigation: {
    emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useRecurring } from '@/lib/recurringContext';

// Floating glass pill with a raised gradient add button — mirrors the web
// BottomNav (PurrfolioWeb/components/layout/BottomNav.module.css).
const BAR_H = 66;        // pill height
const BAR_GAP = 10;      // gap between the pill and the safe-area bottom
const ADD_SIZE = 52;     // add button size
const ADD_RISE = 26;     // how far the add button pokes above the pill
const EAR_SVG_H = 22;    // height of the cat-ears SVG canvas
const EAR_OVERLAP = 12;  // how much the button overlaps (hides) the ear bases

// Screens should add TAB_BAR_HEIGHT + useSafeAreaInsets().bottom as bottom padding
// so content isn't hidden behind the floating tab bar.
export const TAB_BAR_HEIGHT = BAR_H + BAR_GAP + 8; // 84 px

const TAB_META: Record<string, { outline: string; filled: string; label: string }> = {
  index:        { outline: 'home-outline',        filled: 'home',        label: 'Home' },
  transactions: { outline: 'list-outline',        filled: 'list',        label: 'Records' },
  recurring:    { outline: 'calendar-outline',    filled: 'calendar',    label: 'Planned' },
  stats:        { outline: 'stats-chart-outline', filled: 'stats-chart', label: 'Stats' },
};

export default function CustomTabBar({ state, navigation }: TabBarProps) {
  const colors = useTheme();
  const { hasDueToday } = useRecurring();
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();

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
    const meta = TAB_META[route.name] ?? { outline: 'ellipse-outline', filled: 'ellipse', label: route.name };
    const color = isFocused ? colors.accent : colors.muted;
    const showDot = route.name === 'recurring' && hasDueToday;
    return (
      <TouchableOpacity
        key={route.key}
        style={styles.tab}
        onPress={() => handleTabPress(route)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={meta.label}
        accessibilityState={isFocused ? { selected: true } : {}}
      >
        <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
          <Ionicons name={(isFocused ? meta.filled : meta.outline) as any} size={22} color={color} />
          {showDot && <View style={[styles.notifDot, { backgroundColor: colors.danger, borderColor: colors.surface }]} />}
        </View>
        <Text style={[styles.label, { color, fontFamily: isFocused ? 'Nunito_800ExtraBold' : 'Nunito_700Bold' }]}>
          {meta.label}
        </Text>
        {isFocused && (
          <LinearGradient
            colors={colors.gradientAccent}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.indicator, { shadowColor: colors.accent }]}
          />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.container, { height: BAR_H + BAR_GAP + bottom + ADD_RISE + EAR_SVG_H }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.pill,
          {
            bottom: BAR_GAP + bottom,
            backgroundColor: colors.tabBar,
            borderColor: colors.glassBorder,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <View style={styles.side}>{leftTabs.map(renderTab)}</View>

        {/* Spacer the raised add button sits over */}
        <View style={styles.addSlot} />

        <View style={styles.side}>{rightTabs.map(renderTab)}</View>
      </View>

      <View
        style={[styles.addWrap, { bottom: BAR_GAP + bottom + BAR_H + ADD_RISE - ADD_SIZE }]}
        pointerEvents="box-none"
      >
        {/* Cat ears peek out from behind the add button */}
        <Svg
          width={ADD_SIZE}
          height={EAR_SVG_H}
          style={{ marginBottom: -EAR_OVERLAP }}
          pointerEvents="none"
        >
          <Path d={`M 2 ${EAR_SVG_H} L 8 8 Q 12 1 16 8 L 22 ${EAR_SVG_H} Z`} fill={colors.gradientAccent[0]} transform={`rotate(-24, 12, ${EAR_SVG_H})`} />
          <Path d={`M 30 ${EAR_SVG_H} L 36 8 Q 40 1 44 8 L 50 ${EAR_SVG_H} Z`} fill={colors.gradientAccent[1]} transform={`rotate(24, 40, ${EAR_SVG_H})`} />
        </Svg>
        <TouchableOpacity
          onPress={() => router.push('/transaction/add')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add record"
          style={[styles.addShadow, { shadowColor: colors.accent }]}
        >
          <LinearGradient
            colors={colors.gradientAccent}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={[styles.addBtn, { borderColor: colors.surface }]}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </LinearGradient>
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
  },
  pill: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: BAR_H,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  side: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    transform: [{ translateY: -2 }],
  },
  label: {
    fontFamily: 'Nunito_400Regular', fontSize: 11,
    lineHeight: 13,
  },
  indicator: {
    position: 'absolute',
    bottom: 6,
    width: 18,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  notifDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  addSlot: {
    flex: 1,
  },
  // Sibling of the pill (not a child) so the part poking above it stays tappable on Android
  addWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    elevation: 14, // Android stacks siblings by elevation: keep the button above the pill
  },
  addShadow: {
    borderRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  addBtn: {
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
