import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const PAW_SIZE = 50;
const PAW_COUNT = 6;
const CYCLE_MS = 2050;
const VISIBLE_MS = CYCLE_MS / 2;

// Matches the original CSS:
// odd  (0-indexed even)  → rotate(-10deg)
// even (0-indexed odd)   → rotate(10deg) translateX(125%)
const pawConfigs = Array.from({ length: PAW_COUNT }, (_, i) => {
  const isOdd = (i + 1) % 2 !== 0; // 1-indexed odd
  return {
    rotate: isOdd ? '-10deg' : '10deg',
    translateX: isOdd ? 0 : PAW_SIZE * 1.25,
    // delay: ((i+1 * -1) + 6) * 0.25s  → converted to ms, positive for sequence
    delay: ((-(i + 1) + 6) * 0.25) * 1000,
  };
});

function PawIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 249 209.32" width={PAW_SIZE} height={PAW_SIZE}>
      <Ellipse cx="27.917" cy="106.333" rx="27.917" ry="35.833" fill={color} />
      <Ellipse cx="84.75" cy="47.749" rx="34.75" ry="47.751" fill={color} />
      <Ellipse cx="162" cy="47.749" rx="34.75" ry="47.751" fill={color} />
      <Ellipse cx="221.083" cy="106.333" rx="27.917" ry="35.833" fill={color} />
      <Path
        d="M43.98 165.39s9.76-63.072 76.838-64.574c0 0 71.082-6.758 83.096 70.33 0 0 2.586 19.855-12.54 31.855 0 0-15.75 17.75-43.75-6.25 0 0-7.124-8.374-24.624-7.874 0 0-12.75-.125-21.5 6.625 0 0-16.375 18.376-37.75 12.75 0 0-28.29-7.72-19.77-42.86z"
        fill={color}
      />
    </Svg>
  );
}

export function LoadingScreen() {
  const colors = useTheme();
  const pawAnims = useRef(
    Array.from({ length: PAW_COUNT }, () => new Animated.Value(0))
  ).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    pawAnims.forEach((anim, i) => {
      const { delay } = pawConfigs[i];

      // Wait initial delay, then loop: snap to 1 → fade to 0 → hold → repeat
      const loopBody = Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: VISIBLE_MS, useNativeDriver: true }),
        Animated.delay(CYCLE_MS - VISIBLE_MS),
      ]);

      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(loopBody),
      ]).start();
    });

    return () => {
      mountedRef.current = false;
      pawAnims.forEach(a => a.stopAnimation());
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.accent }]}>Purrfolio</Text>

      {/* Container rotated 45° — paws stacked vertically inside */}
      <View style={styles.loaderWrapper}>
        <View style={styles.loader}>
          {pawAnims.map((anim, i) => {
            const { rotate, translateX } = pawConfigs[i];
            return (
              <Animated.View
                key={i}
                style={[
                  styles.paw,
                  {
                    opacity: anim,
                    transform: [{ rotate }, { translateX }],
                  },
                ]}
              >
                <PawIcon color={colors.accent} />
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontFamily: 'Lora_700Bold',
    textAlign: 'center',
    marginTop: 72,
    letterSpacing: 1,
  },
  loaderWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: PAW_SIZE,
    // 45° rotation on the stacked column → diagonal walking path
    transform: [{ rotate: '45deg' }],
  },
  paw: {
    width: PAW_SIZE,
    height: PAW_SIZE,
  },
});
