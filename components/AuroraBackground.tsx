import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

// Soft colour fields behind a whole screen — the mobile take on the web's
// aurora backdrop (body::before in PurrfolioWeb/app/globals.css). Static on
// purpose: it sits under every card, so animating it would repaint the screen.
const BLOBS = [
  { x: 0.12, y: 0.08, r: 0.95 },
  { x: 0.92, y: 0.12, r: 0.85 },
  { x: 0.78, y: 0.92, r: 1.0 },
  { x: 0.18, y: 0.88, r: 0.75 },
];

function AuroraBackground() {
  const colors = useTheme();
  const { width, height } = useWindowDimensions();
  const base = Math.max(width, height) * 0.38;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {colors.aurora.map((c, i) => (
            <RadialGradient key={i} id={`aurora${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity={1} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect width={width} height={height} fill={colors.bg} />
        {BLOBS.map((b, i) => (
          <Circle
            key={i}
            cx={b.x * width}
            cy={b.y * height}
            r={base * b.r}
            fill={`url(#aurora${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

export default memo(AuroraBackground);
