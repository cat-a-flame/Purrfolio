import type { Currency } from './types';

export function formatCurrency(amount: number, currency: Currency): string {
  const locale = currency === 'HUF' ? 'hu-HU' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  })
    .formatToParts(amount)
    .map((p) => (p.type === 'group' ? ' ' : p.value))
    .join('');
}

export function formatHUF(amount: number): string {
  return formatCurrency(amount, 'HUF');
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    .formatToParts(amount)
    .map((p) => (p.type === 'group' ? ' ' : p.value))
    .join('');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
