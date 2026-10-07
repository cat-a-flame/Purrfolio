import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl: string =
  (Constants.expoConfig?.extra?.supabaseUrl as string) ?? '';
const supabaseAnonKey: string =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string) ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Checks a password without touching the signed-in session, using a throwaway client that
 * doesn't persist anything. Guards sensitive actions on an unlocked, signed-in device.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const temp = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await temp.auth.signInWithPassword({ email, password });
  return !error;
}
