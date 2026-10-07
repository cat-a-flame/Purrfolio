import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same idea as the web dashboard's "hide numbers" toggle: amounts are replaced with a mask.
// Module-level state so every screen shares it without a provider (same pattern as lib/theme.ts).

const STORAGE_KEY = '@purrfolio/hide_numbers';

export const NUMBER_MASK = '★★★★';

let hidden = false;
let loaded = false;
const subs = new Set<() => void>();

function notify() { subs.forEach(fn => fn()); }

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then(v => { if (v === '1' && !hidden) { hidden = true; notify(); } })
    .catch(() => {});
}

export function setHideNumbers(v: boolean) {
  hidden = v;
  AsyncStorage.setItem(STORAGE_KEY, v ? '1' : '0').catch(() => {});
  notify();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useHideNumbers(): [boolean, (v: boolean) => void] {
  load();
  const value = useSyncExternalStore(subscribe, () => hidden, () => hidden);
  return [value, setHideNumbers];
}
