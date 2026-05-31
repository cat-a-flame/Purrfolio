// MNB (Magyar Nemzeti Bank) középárfolyam — exchange rates to HUF.
// Current-day rates cached per day; historical rates cached by date range.

export type Rates = Record<string, number>; // e.g. { EUR: 390.5, USD: 357.25 }
export type DailyRates = Record<string, Rates>; // YYYY-MM-DD → { EUR: ..., USD: ... }

let _rates: Rates | null = null;
let _ratesDate: string | null = null;

/** Convert an amount in `currency` to HUF using the provided MNB middle rates. */
export function toHUF(amount: number, currency: string | undefined | null, rates: Rates): number {
  if (!currency || currency === 'HUF') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount; // fall back to raw amount if rate unknown
}

/**
 * Look up rates for a specific date. Falls back to the nearest prior business
 * day if the exact date has no entry (weekends / holidays).
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

/** Returns today's MNB rates (fetches once, then caches for the rest of the day). */
export async function getMNBRates(): Promise<Rates> {
  const today = new Date().toISOString().slice(0, 10);
  if (_rates && _ratesDate === today) return _rates;
  const fetched = await fetchMNBRates();
  _rates = fetched;
  _ratesDate = today;
  return fetched;
}

/**
 * Fetch MNB középárfolyam for every day in [from, to].
 * Returns a map of date → rates so callers can use each transaction's own day rate.
 */
export async function getMNBRatesForPeriod(from: string, to: string): Promise<DailyRates> {
  try {
    const res = await fetch('https://www.mnb.hu/arfolyamok.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':
          'http://www.mnb.hu/webservices/MNBArfolyamServiceSoap/GetExchangeRates',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetExchangeRates xmlns="http://www.mnb.hu/webservices/">
      <startDate>${from}</startDate>
      <endDate>${to}</endDate>
      <currencyNames>EUR,USD</currencyNames>
    </GetExchangeRates>
  </soap:Body>
</soap:Envelope>`,
    });
    return parseMNBDailySoap(await res.text());
  } catch {
    return {};
  }
}

async function fetchMNBRates(): Promise<Rates> {
  try {
    const res = await fetch('https://www.mnb.hu/arfolyamok.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':
          'http://www.mnb.hu/webservices/MNBArfolyamServiceSoap/GetCurrentExchangeRates',
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCurrentExchangeRates xmlns="http://www.mnb.hu/webservices/" />
  </soap:Body>
</soap:Envelope>`,
    });
    return parseMNBSoap(await res.text());
  } catch {
    return {};
  }
}

function parseMNBSoap(soap: string): Rates {
  const rates: Rates = {};
  const inner =
    soap.match(/<GetCurrentExchangeRatesResult>([\s\S]*?)<\/GetCurrentExchangeRatesResult>/)?.[1] ?? '';
  const decoded = inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  // <Rate unit="1" curr="EUR">390,50</Rate>  (Hungarian decimal comma)
  for (const m of decoded.matchAll(/unit="(\d+)"\s+curr="([A-Z]+)">([0-9,]+)<\/Rate>/g)) {
    const unit = Number(m[1]);
    const currency = m[2];
    const rate = parseFloat(m[3].replace(',', '.'));
    if (unit > 0 && !isNaN(rate)) rates[currency] = rate / unit;
  }
  return rates;
}

function parseMNBDailySoap(soap: string): DailyRates {
  const daily: DailyRates = {};
  const inner =
    soap.match(/<GetExchangeRatesResult>([\s\S]*?)<\/GetExchangeRatesResult>/)?.[1] ?? '';
  const decoded = inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  for (const dayM of decoded.matchAll(/<Day date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Day>/g)) {
    const date = dayM[1];
    const rates: Rates = {};
    for (const m of dayM[2].matchAll(/unit="(\d+)"\s+curr="([A-Z]+)">([0-9,]+)<\/Rate>/g)) {
      const unit = Number(m[1]);
      const curr = m[2];
      const rate = parseFloat(m[3].replace(',', '.'));
      if (unit > 0 && !isNaN(rate)) rates[curr] = rate / unit;
    }
    daily[date] = rates;
  }
  return daily;
}
