import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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

// Scrollable form that keeps the focused field above the keyboard.
// Android is always edge-to-edge, so the system no longer resizes the window
// and the view has to shrink itself. iOS scrolls the focused field into view
// natively through automaticallyAdjustKeyboardInsets.
export function KeyboardAwareScroll({ children, contentContainerStyle, style }: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      enabled={Platform.OS === 'android'}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
