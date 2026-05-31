// MNB (Magyar Nemzeti Bank) középárfolyam — current-day exchange rates to HUF.
// Rates are cached per day so the SOAP call is made at most once per session.

export type Rates = Record<string, number>; // e.g. { EUR: 390.5, USD: 357.25 }

let _rates: Rates | null = null;
let _ratesDate: string | null = null;

/** Convert an amount in `currency` to HUF using today's MNB middle rate. */
export function toHUF(amount: number, currency: string | undefined | null, rates: Rates): number {
  if (!currency || currency === 'HUF') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount; // fall back to raw amount if rate unknown
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
  // The rate table is HTML-entity-encoded inside GetCurrentExchangeRatesResult
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
