import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Easing, makeMutable, withTiming } from 'react-native-reanimated';

// Hide-on-scroll for the bottom tab bar, like Reddit: scrolling down slides
// the bar away, scrolling up (or reaching the top) slides it back.
// 0 = shown, 1 = hidden. CustomTabBar maps it to a translateY.
export const tabBarHiddenProgress = makeMutable(0);

const TIMING = { duration: 250, easing: Easing.out(Easing.cubic) };
const MIN_DELTA = 8; // px of travel in one direction before the bar reacts

let hidden = false;

export function setTabBarHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  tabBarHiddenProgress.value = withTiming(next ? 1 : 0, TIMING);
}

// Spread the result onto a tab screen's ScrollView/FlatList. Pass resetKey
// (e.g. the active sub-tab) to bring the bar back when the list is swapped.
export function useHideTabBarOnScroll(resetKey?: unknown) {
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = 0;
    setTabBarHidden(false);
  }, [resetKey]);

  // Always bring the bar back when the screen gains focus.
  useFocusEffect(useCallback(() => {
    lastY.current = 0;
    setTabBarHidden(false);
  }, []));

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    const maxY = contentSize.height - layoutMeasurement.height;

    if (y <= 0) {
      lastY.current = Math.max(y, 0);
      setTabBarHidden(false);
      return;
    }
    // Ignore the iOS bounce past the end, which would read as scrolling up.
    if (y >= maxY) return;

    const dy = y - lastY.current;
    if (Math.abs(dy) < MIN_DELTA) return;
    setTabBarHidden(dy > 0);
    lastY.current = y;
  }, []);

  return { onScroll, scrollEventThrottle: 16 };
}
