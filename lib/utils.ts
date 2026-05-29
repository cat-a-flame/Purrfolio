import type { Currency } from './types';

export function formatCurrency(amount: number, currency: Currency): string {
  try {
    const locale = currency === 'HUF' ? 'hu-HU' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2,
    }).format(amount);
  } catch {
    const n = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (currency === 'HUF') return `${n} Ft`;
    if (currency === 'EUR') return `€${n}`;
    return `$${n}`;
  }
}

export function formatHUF(amount: number): string {
  return formatCurrency(amount, 'HUF');
}

export function formatNumber(amount: number): string {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return amount.toString();
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDayHeader(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function groupByDate<T extends { date: string }>(items: T[]): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = item.date.slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}
