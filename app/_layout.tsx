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
import { Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import * as SplashScreen from 'expo-splash-screen';
import { LoadingScreen } from '@/components/LoadingScreen';
import { UnlockScreen } from '@/components/UnlockScreen';
import { isPinEnabled } from '@/lib/security';
import { needsMfaCode } from '@/lib/mfa';
import { BaseCurrencyContext, useBaseCurrencyResolver } from '@/lib/baseCurrencyContext';

SplashScreen.preventAutoHideAsync();

(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = { fontFamily: 'Nunito_400Regular' };

const MIN_LOADING_MS = 3000;

export default function RootLayout() {
  const { isDark } = useDarkMode();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [minTimeReady, setMinTimeReady] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  // Whether the current session still has to enter a 2FA code, tagged with
  // the access token it was worked out for so a stale answer is never used.
  const [mfaCheck, setMfaCheck] = useState<{ token: string; pending: boolean } | null>(null);
  const mfaKnown = !session || mfaCheck?.token === session.access_token;
  const mfaPending = !!session && mfaKnown && !!mfaCheck?.pending;
  // The base currency is only worked out once the session is fully signed in (no 2FA code pending).
  const baseCurrency = useBaseCurrencyResolver(session, !!session && mfaKnown && !mfaPending);
  const loading = !authReady || !minTimeReady || (!!session && !mfaCheck) || baseCurrency.status === 'checking';
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
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
    if (!session) return;
    const token = session.access_token;
    let cancelled = false;
    // On failure, don't block the app: the database still refuses data to an
    // unverified session.
    needsMfaCode()
      .catch(() => false)
      .then(pending => {
        if (!cancelled) setMfaCheck({ token, pending });
      });
    return () => { cancelled = true; };
  }, [session?.access_token]);

  useEffect(() => {
    if (!authReady || !minTimeReady || !mfaKnown || (pinRequired && !unlocked)) return;
    const inAuth = segments[0] === '(auth)';
    const onMfa = inAuth && (segments as string[])[1] === 'mfa';
    const onOnboarding = (segments as string[])[0] === 'onboarding';
    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && mfaPending && !onMfa) {
      router.replace('/(auth)/mfa');
    } else if (session && !mfaPending && baseCurrency.status === 'onboarding' && !onOnboarding) {
      router.replace('/onboarding');
    } else if (session && !mfaPending && baseCurrency.status === 'ready' && (inAuth || onOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [session, authReady, minTimeReady, mfaKnown, mfaPending, baseCurrency.status, pinRequired, unlocked, segments]);

  let content;
  if (!fontsLoaded || loading) {
    content = <LoadingScreen />;
  } else if (pinRequired && !unlocked) {
    content = <UnlockScreen onUnlocked={() => setUnlocked(true)} />;
  } else {
    content = (
      <SafeAreaProvider>
        <BaseCurrencyContext.Provider value={baseCurrency}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="transaction/add" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="wallet/[id]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="category/[id]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="payment/add" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="payment/[id]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="payment/due" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="label/[id]" options={{ presentation: 'modal', headerShown: false }} />
            <Stack.Screen name="settings/categories" options={{ headerShown: false }} />
            <Stack.Screen name="settings/labels" options={{ headerShown: false }} />
            <Stack.Screen name="settings/accounts" options={{ headerShown: false }} />
            <Stack.Screen name="settings/security" options={{ headerShown: false }} />
            <Stack.Screen name="settings/account" options={{ headerShown: false }} />
            <Stack.Screen name="settings/two-factor" options={{ headerShown: false }} />
            <Stack.Screen name="settings/export" options={{ headerShown: false }} />
          </Stack>
        </BaseCurrencyContext.Provider>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {content}
    </GestureHandlerRootView>
  );
}
