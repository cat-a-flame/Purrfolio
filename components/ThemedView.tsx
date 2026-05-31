import { View, ViewProps } from 'react-native';
import { useTheme } from '@/lib/theme';

interface Props extends ViewProps {
  surface?: boolean;
}

export default function ThemedView({ surface, style, ...props }: Props) {
  const colors = useTheme();
  return (
    <View
      style={[{ backgroundColor: surface ? colors.surface : colors.bg }, style]}
      {...props}
    />
  );
}
