import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { loadThemePreference, useDarkMode } from '@/lib/theme';
import type { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import * as SplashScreen from 'expo-splash-screen';
import { LoadingScreen } from '@/components/LoadingScreen';
import { UnlockScreen } from '@/components/UnlockScreen';
import { isPinEnabled } from '@/lib/security';

SplashScreen.preventAutoHideAsync();

(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = { fontFamily: 'Figtree_400Regular' };

const MIN_LOADING_MS = 3000;

export default function RootLayout() {
  const { isDark } = useDarkMode();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [minTimeReady, setMinTimeReady] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const loading = !authReady || !minTimeReady;
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Lora_400Regular,
    Lora_600SemiBold,
    Lora_700Bold,
  });

  // Hide the native splash immediately so the animated LoadingScreen takes over
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => { loadThemePreference(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeReady(true), MIN_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    isPinEnabled().then(enabled => {
      setPinRequired(enabled);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !minTimeReady || (pinRequired && !unlocked)) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, authReady, minTimeReady, pinRequired, unlocked, segments]);

  let content;
  if (!fontsLoaded || loading) {
    content = <LoadingScreen />;
  } else if (pinRequired && !unlocked) {
    content = <UnlockScreen onUnlocked={() => setUnlocked(true)} />;
  } else {
    content = (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/add" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="wallet/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="payment/add" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="payment/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="category/add" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="category/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="label/add" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="label/[id]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="settings/categories" options={{ headerShown: false }} />
          <Stack.Screen name="settings/labels" options={{ headerShown: false }} />
          <Stack.Screen name="settings/security" options={{ headerShown: false }} />
          <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {content}
    </GestureHandlerRootView>
  );
}
