import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getBaseCurrency, LEGACY_BASE_CURRENCY } from './baseCurrency';
import { formatCurrency } from './utils';
import type { Currency } from './types';

// 'idle': signed out or not ready to ask; 'checking': base currency unknown, working out whether
// the user is new; 'onboarding': new user who has to pick one; 'ready': base currency saved.
export type BaseCurrencyStatus = 'idle' | 'checking' | 'onboarding' | 'ready';

export type BaseCurrencyValue = {
  /** Falls back to HUF until the real value is known, so screens can render without a guard. */
  baseCurrency: Currency;
  status: BaseCurrencyStatus;
  setBaseCurrency: (currency: Currency | null) => Promise<boolean>;
};

export const BaseCurrencyContext = createContext<BaseCurrencyValue>({
  baseCurrency: LEGACY_BASE_CURRENCY,
  status: 'idle',
  setBaseCurrency: async () => false,
});

/**
 * Resolves the user's base currency (stored in auth user metadata, shared with the web app).
 * A user without one is either from before it existed (has transactions, stays on HUF because
 * their stored rates are in HUF) or new (needs onboarding). Used once, in the root layout.
 */
export function useBaseCurrencyResolver(session: Session | null, active: boolean): BaseCurrencyValue {
  const userId = session?.user.id;
  const metaBase = getBaseCurrency(session?.user);
  const [base, setBase] = useState<Currency | null>(metaBase);
  const [isNew, setIsNew] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => { setBase(metaBase); }, [userId, metaBase]);

  const setBaseCurrency = useCallback(async (currency: Currency | null) => {
    const { error } = await supabase.auth.updateUser({ data: { base_currency: currency } });
    if (error) return false;
    setBase(currency);
    return true;
  }, []);

  const needsCheck = !!userId && active && base === null;

  useEffect(() => {
    if (!needsCheck) { setIsNew(null); setCheckFailed(false); return; }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true });
      if (cancelled) return;
      // Don't trap the user on the loading screen (offline, say); they'll be asked again next launch.
      if (error) { setCheckFailed(true); return; }
      if ((count ?? 0) > 0) {
        await setBaseCurrency(LEGACY_BASE_CURRENCY);
      } else {
        setIsNew(true);
      }
    })();
    return () => { cancelled = true; };
  }, [needsCheck, userId, setBaseCurrency]);

  const status: BaseCurrencyStatus =
    !userId || !active ? 'idle'
    : base !== null || checkFailed ? 'ready'
    : isNew ? 'onboarding'
    : 'checking';

  return useMemo(
    () => ({ baseCurrency: base ?? LEGACY_BASE_CURRENCY, status, setBaseCurrency }),
    [base, status, setBaseCurrency],
  );
}

export function useBaseCurrencyState() {
  return useContext(BaseCurrencyContext);
}

export function useBaseCurrency(): Currency {
  return useContext(BaseCurrencyContext).baseCurrency;
}

/** Formats an amount in the user's base currency. */
export function useFormatBase() {
  const base = useBaseCurrency();
  return useCallback((amount: number) => formatCurrency(amount, base), [base]);
}
