// Exchange rates via Frankfurter (ECB fixing — matches MNB középárfolyam closely).
// getMNBRates / getMNBRatesForPeriod names kept for API compatibility.

export type Rates = Record<string, number>; // e.g. { EUR: 390.5, USD: 357.25 }
export type DailyRates = Record<string, Rates>; // YYYY-MM-DD → { EUR: ..., USD: ... }

const BASE = 'https://api.frankfurter.app';

/** Convert an amount in `currency` to HUF using the provided rates. */
export function toHUF(amount: number, currency: string | undefined | null, rates: Rates): number {
  if (!currency || currency === 'HUF') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
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

/** Returns today's rates (EUR→HUF, USD→HUF). */
export async function getMNBRates(): Promise<Rates> {
  try {
    const res = await fetch(`${BASE}/latest?from=HUF&to=EUR,USD`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return invertRates(json.rates ?? {});
  } catch (e) {
    console.error('[Exchange] getMNBRates failed:', e);
    return {};
  }
}

/**
 * Fetch rates for every day in [from, to].
 * Returns date → { EUR: HUF-rate, USD: HUF-rate } so each transaction
 * can be converted using its own day's middle rate.
 */
export async function getMNBRatesForPeriod(from: string, to: string): Promise<DailyRates> {
  try {
    const res = await fetch(`${BASE}/${from}..${to}?from=HUF&to=EUR,USD`);
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
    if (Object.keys(daily).length === 0) {
      console.error('[Exchange] getMNBRatesForPeriod returned empty for', from, '..', to);
    }
    return daily;
  } catch (e) {
    console.error('[Exchange] getMNBRatesForPeriod failed:', e);
    return {};
  }
}

// Frankfurter gives rates relative to HUF (1 HUF = 0.00254 EUR).
// Invert to get how many HUF per 1 EUR.
function invertRates(hufBased: Record<string, number>): Rates {
  const out: Rates = {};
  for (const [curr, rate] of Object.entries(hufBased)) {
    if (rate > 0) out[curr] = 1 / rate;
  }
  return out;
}
