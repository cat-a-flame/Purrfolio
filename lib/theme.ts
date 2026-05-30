import { useColorScheme } from 'react-native';

export const lightColors = {
  bg: '#fff',
  surface: '#ffffff',
  accent: '#f26e4d',
  text: '#1c1a17',
  muted: '#6b6760',
  danger: '#dc2626',
  income: '#16a34a',
  expense: '#dc2626',
  border: '#e5e2dd',
  tabBar: '#ffffff',
  card: '#ffffff',
  placeholder: '#b0aba4',
  overlay: 'rgba(0,0,0,0.4)',
};

export const darkColors = {
  bg: '#0f0b1a',
  surface: '#1a1028',
  accent: '#d946a8',
  text: '#f0e6ff',
  muted: '#a586c8',
  danger: '#f43f5e',
  income: '#43eb81',
  expense: '#ff5b77',
  border: '#2e2040',
  tabBar: '#1a1028',
  card: '#1a1028',
  placeholder: '#6b5a8a',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof lightColors;

export function useTheme(): Colors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
