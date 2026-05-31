import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';

interface Props extends TextProps {
  variant?: 'body' | 'heading' | 'caption' | 'muted' | 'label';
}

export default function ThemedText({ variant = 'body', style, ...props }: Props) {
  const colors = useTheme();

  const variantStyle = {
    body: { color: colors.text, fontSize: 15 },
    heading: { color: colors.text, fontSize: 20, fontFamily: 'Figtree_700Bold' },
    caption: { color: colors.muted, fontSize: 12 },
    muted: { color: colors.muted, fontSize: 14 },
    label: { color: colors.muted, fontSize: 13, fontFamily: 'Figtree_500Medium' },
  }[variant];

  return <Text style={[variantStyle, style]} {...props} />;
}
