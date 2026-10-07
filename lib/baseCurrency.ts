import type { User } from '@supabase/supabase-js';
import type { Currency } from './types';

// Same list as PurrfolioWeb (lib/baseCurrency.ts)
export const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];
export const CURRENCY_NAMES: Record<Currency, string> = {
  HUF: 'Hungarian Forint',
  EUR: 'Euro',
  USD: 'US Dollar',
};

// Users from before base currencies existed have HUF-based stored rates, so they stay on HUF.
export const LEGACY_BASE_CURRENCY: Currency = 'HUF';

export function parseCurrency(value: unknown): Currency | null {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : null;
}

/** The base currency saved on the user (auth metadata, shared with the web app); null until onboarding or the legacy check sets it. */
export function getBaseCurrency(user: User | null | undefined): Currency | null {
  return parseCurrency(user?.user_metadata?.base_currency);
}
