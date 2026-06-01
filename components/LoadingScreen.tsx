import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '@/lib/theme';

const { width, height } = Dimensions.get('window');

const PAW_COUNT = 6;
const startX = width * 0.12;
const startY = height * 0.75;
const endX = width * 0.78;
const endY = height * 0.35;

const dx = endX - startX;
const dy = endY - startY;
const len = Math.sqrt(dx * dx + dy * dy);
const nx = dx / len;
const ny = dy / len;
// perpendicular to diagonal (for lateral offsets)
const px = -ny;
const py = nx;

const LATERAL = 20;

const paws = Array.from({ length: PAW_COUNT }, (_, i) => {
  const t = i / (PAW_COUNT - 1);
  const side = i % 2 === 0 ? -1 : 1;
  return {
    x: startX + t * dx + side * LATERAL * px,
    y: startY + t * dy + side * LATERAL * py,
    isLeft: i % 2 === 0,
  };
});

// Rotate paw (toes-up orientation) to point in direction of travel
const diagAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
const baseRotation = diagAngleDeg + 90; // ~59° for this diagonal

function PawPrint({ isLeft, color }: { isLeft: boolean; color: string }) {
  const rotation = `${baseRotation + (isLeft ? -8 : 8)}deg`;
  return (
    <View style={[styles.paw, { transform: [{ rotate: rotation }] }]}>
      <View style={styles.toesRow}>
        <View style={[styles.toeOuter, { backgroundColor: color }]} />
        <View style={[styles.toeInner, { backgroundColor: color }]} />
        <View style={[styles.toeInner, { backgroundColor: color }]} />
        <View style={[styles.toeOuter, { backgroundColor: color }]} />
      </View>
      <View style={[styles.mainPad, { backgroundColor: color }]} />
    </View>
  );
}

export function LoadingScreen() {
  const colors = useTheme();
  const pawAnims = useRef(paws.map(() => new Animated.Value(0))).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);

  const runCycle = useCallback(() => {
    if (!mountedRef.current) return;

    pawAnims.forEach(a => a.setValue(0));
    containerOpacity.setValue(1);

    const staggered = pawAnims.map((anim, i) =>
      Animated.sequence([
        Animated.delay(i * 280),
        Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ])
    );

    Animated.sequence([
      Animated.parallel(staggered),
      Animated.delay(700),
      Animated.timing(containerOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.delay(150),
    ]).start(({ finished }) => {
      if (finished && mountedRef.current) runCycle();
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    runCycle();
    return () => {
      mountedRef.current = false;
      pawAnims.forEach(a => a.stopAnimation());
      containerOpacity.stopAnimation();
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.accent }]}>Purrfolio</Text>
      <Animated.View style={[styles.pawsArea, { opacity: containerOpacity }]}>
        {paws.map((paw, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: paw.x - 20,
              top: paw.y - 17,
              opacity: pawAnims[i],
              transform: [
                {
                  scale: pawAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            }}
          >
            <PawPrint isLeft={paw.isLeft} color={colors.accent} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 40,
    fontFamily: 'Lora_700Bold',
    textAlign: 'center',
    marginTop: 72,
    letterSpacing: 1,
  },
  pawsArea: {
    flex: 1,
    position: 'relative',
  },
  paw: {
    alignItems: 'center',
  },
  toesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 3,
    gap: 3,
  },
  toeOuter: {
    width: 9,
    height: 8,
    borderRadius: 5,
    marginBottom: 2,
  },
  toeInner: {
    width: 11,
    height: 10,
    borderRadius: 6,
  },
  mainPad: {
    width: 28,
    height: 22,
    borderRadius: 10,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
});
