import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

// Scrollable form that keeps the focused field above the keyboard. Android is
// edge-to-edge, so the system no longer resizes the window when the keyboard
// opens and the view has to shrink itself; Android then scrolls the focused
// field into view.
export function KeyboardAwareScroll({ children, contentContainerStyle, style }: Props) {
  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior="padding">
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
