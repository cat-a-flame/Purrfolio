// Exchange rates via Frankfurter (ECB fixing).
import { CURRENCIES } from './baseCurrency';
import type { Currency } from './types';

// Base currency per 1 unit of each foreign currency, e.g. with base HUF { EUR: 390.5, USD: 357.25 }.
export type Rates = Record<string, number>;
export type DailyRates = Record<string, Rates>; // YYYY-MM-DD → { EUR: ..., USD: ... }

const BASE = 'https://api.frankfurter.app';

/** Convert an amount in `currency` to the base currency using the provided rates. */
export function toBase(amount: number, currency: string | undefined | null, rates: Rates, base: Currency): number {
  if (!currency || currency === base) return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

/** Like toBase but prefers a stored per-transaction rate over a looked-up one. */
export function txToBase(
  amount: number,
  currency: string | undefined | null,
  storedRate: number | null | undefined,
  rates: Rates,
  base: Currency,
): number {
  if (!currency || currency === base) return amount;
  if (storedRate != null) return amount * storedRate;
  return toBase(amount, currency, rates, base);
}

/**
 * Find rates for a specific date. Falls back to nearest prior business day
 * when the exact date has no entry (weekends / Hungarian public holidays).
 */
export function getRatesForDate(date: string, daily: DailyRates): Rates {
  if (daily[date]) return daily[date];
  const sorted = Object.keys(daily).sort();
  const prior = sorted.filter(d => d <= date);
  if (prior.length > 0) return daily[prior[prior.length - 1]];
  const future = sorted.filter(d => d > date);
  if (future.length > 0) return daily[future[0]];
  return {};
}

const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

const othersOf = (base: Currency) => CURRENCIES.filter(c => c !== base).join(',');

/** Returns today's rates (each other currency → base). */
export async function getExchangeRates(base: Currency): Promise<Rates> {
  try {
    const res = await fetchWithTimeout(`${BASE}/latest?from=${base}&to=${othersOf(base)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return invertRates(json.rates ?? {});
  } catch (e) {
    console.error('[Exchange] getExchangeRates failed:', e);
    return {};
  }
}

/**
 * Fetch rates for every day in [from, to].
 * Returns date → { <currency>: base-rate } so each transaction
 * can be converted using its own day's middle rate.
 */
export async function getExchangeRatesForPeriod(from: string, to: string, base: Currency): Promise<DailyRates> {
  try {
    const res = await fetchWithTimeout(`${BASE}/${from}..${to}?from=${base}&to=${othersOf(base)}`);
    if (res.status === 404) return {}; // no ECB data for this range (future / holiday-only)
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const daily: DailyRates = {};
    const raw = json.rates ?? {};
    for (const [key, val] of Object.entries(raw)) {
      if (val && typeof val === 'object') {
        // Multi-date: key is a date string, val is { EUR: 0.00254, ... }
        daily[key] = invertRates(val as Record<string, number>);
      }
    }
    // Single-date fallback (from === to returns flat rates)
    if (Object.keys(daily).length === 0 && json.date) {
      daily[json.date] = invertRates(raw as Record<string, number>);
    }
    return daily;
  } catch (e) {
    console.error('[Exchange] getExchangeRatesForPeriod failed:', e);
    return {};
  }
}

// Frankfurter gives rates relative to the base (with base HUF, 1 HUF = 0.00254 EUR).
// Invert to get how many base units per 1 EUR.
function invertRates(hufBased: Record<string, number>): Rates {
  const out: Rates = {};
  for (const [curr, rate] of Object.entries(hufBased)) {
    if (rate > 0) out[curr] = 1 / rate;
  }
  return out;
}
