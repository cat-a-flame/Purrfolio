import { useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Palette mirrors the PurrfolioWeb design tokens (app/globals.css) so the
// app and the web share one look: violet → fuchsia → pink accents on a soft
// neutral canvas with glassy cards.
export const lightColors = {
  bg: '#f6f6f8',
  bg2: '#f5f1fe',
  surface: '#ffffff',
  surface2: '#f5f1fe',
  surface3: '#ebe4fb',
  // Card fills are opaque: RN has no backdrop blur, and Android elevation
  // shadows show through translucent fills as a grey band around the content.
  glass: '#ffffff',
  glassStrong: '#ffffff',
  glassBorder: '#e8e1f6',
  accent: '#7433e6',
  accentLight: '#f1eafe',
  accentBorder: 'rgba(116,51,230,0.22)',
  accentGlow: 'rgba(116,51,230,0.4)',
  accent2: '#d6297a',
  accent3: '#0ea5c6',
  text: '#5f4c79',
  heading: '#2b1452',
  muted: '#9284a4',
  faint: '#9a8fb2',
  danger: '#e0344a',
  dangerLight: '#fdecef',
  income: '#0f7a57',
  incomeLight: '#d3f5e6',
  expense: '#e0344a',
  expenseLight: '#fdecef',
  border: '#e8e1f6',
  border2: '#f0ebfa',
  tabBar: '#ffffff', // opaque: RN has no backdrop blur, and Android elevation shadows bleed through translucency
  card: '#ffffff',
  placeholder: '#9a8fb2',
  overlay: 'rgba(28,16,52,0.38)',
  shadow: '#3c1e6e',
  gradientAccent: ['#7433e6', '#b62ad9', '#ec3f7a'] as const,
  gradientCashflow: ['#2c1370', '#5a22c8', '#9b2bc9'] as const,
};

export const darkColors: Colors = {
  bg: '#0c0b10',
  bg2: '#1d1633',
  surface: '#140e24',
  surface2: '#1d1633',
  surface3: '#2a2147',
  glass: '#140e24',
  glassStrong: '#140e24',
  glassBorder: '#2c2346',
  accent: '#a78bfa',
  accentLight: '#251a45',
  accentBorder: 'rgba(167,139,250,0.28)',
  accentGlow: 'rgba(167,139,250,0.45)',
  accent2: '#f472b6',
  accent3: '#22d3ee',
  text: '#f4efff',
  heading: '#ffffff',
  muted: '#b3a7d0',
  faint: '#7d71a0',
  danger: '#ff6b7d',
  dangerLight: '#3a1220',
  income: '#4ef0a8',
  incomeLight: '#0b2c20',
  expense: '#ff6b7d',
  expenseLight: '#3a1220',
  border: '#2c2346',
  border2: '#231b3b',
  tabBar: '#1a1330',
  card: '#140e24',
  placeholder: '#7d71a0',
  overlay: 'rgba(4,0,12,0.66)',
  shadow: '#000000',
  gradientAccent: ['#7c4dff', '#c026d3', '#f43f75'],
  gradientCashflow: ['#2c1370', '#5a22c8', '#9b2bc9'],
};

// Shared shape scale (matches the web --radius-* tokens)
export const radius = { sm: 10, md: 14, lg: 18, xl: 26, full: 9999 } as const;

type Widen<T> = { [K in keyof T]: T[K] extends readonly string[] ? readonly [string, string, ...string[]] : string };
export type Colors = Widen<typeof lightColors>;

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
