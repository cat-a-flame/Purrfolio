import { useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightColors = {
  bg: '#f5f3f7',
  bg2: '#fcf1ff',
  surface: '#ffffff',
  accent: '#692f7c',
  text: '#523e5c',
  muted: '#8972a4',
  danger: '#ef573c',
  income: '#149a83',
  expense: '#ef573c',
  border: '#e5e2dd',
  border2: '#f1ece5',
  tabBar: '#ffffff',
  card: '#ffffff',
  placeholder: '#b0aba4',
  overlay: 'rgba(0,0,0,0.4)',
};

export const darkColors = {
  bg: '#0f0b1a',
  bg2: '#312751',
  surface: '#1a1028',
  accent: '#d946a8',
  text: '#f0e6ff',
  muted: '#a586c8',
  danger: '#f43f5e',
  income: '#43eb81',
  expense: '#ff5b77',
  border: '#2e2040',
  border2: '#2e2040',
  tabBar: '#1a1028',
  card: '#1a1028',
  placeholder: '#6b5a8a',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof lightColors;

// ── Module-level dark-mode override (pub-sub, no context/provider needed) ──

const STORAGE_KEY = '@purrfolio/theme';
let _override: boolean | null = null; // null = follow system
const _subs = new Set<() => void>();

function _notify() { _subs.forEach(fn => fn()); }

export async function loadThemePreference() {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  if (v === 'dark') _override = true;
  else if (v === 'light') _override = false;
  _notify();
}

export function setDarkMode(v: boolean) {
  _override = v;
  AsyncStorage.setItem(STORAGE_KEY, v ? 'dark' : 'light');
  _notify();
}

function _useIsDark(): boolean {
  const system = useColorScheme();
  const [, tick] = useState(0);
  useEffect(() => {
    const sub = () => tick(n => n + 1);
    _subs.add(sub);
    return () => { _subs.delete(sub); };
  }, []);
  return _override !== null ? _override : system === 'dark';
}

export function useTheme(): Colors {
  return _useIsDark() ? darkColors : lightColors;
}

export function useDarkMode(): { isDark: boolean; setIsDark: (v: boolean) => void } {
  return { isDark: _useIsDark(), setIsDark: setDarkMode };
}
