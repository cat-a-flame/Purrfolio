import { Text, View, StyleSheet } from 'react-native';

// Tinted emoji square — the mobile counterpart of the web's EmojiBox.
function tint(hex: string | null | undefined, alpha: number): string {
  const h = (hex ?? '').replace('#', '');
  if (h.length !== 6) return `rgba(122, 92, 224, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function EmojiTile({ emoji, color, size = 38 }: { emoji: string; color: string | null | undefined; size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: tint(color, 0.133) }]}>
      <Text style={{ fontSize: Math.round(size * 0.47) }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
