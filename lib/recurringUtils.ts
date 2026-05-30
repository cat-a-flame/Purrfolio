import type { RecurrenceFrequency } from './types';

export function advanceDate(date: Date, frequency: RecurrenceFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'biweekly':  d.setDate(d.getDate() + 14); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export function generateDueDates(
  payment: { start_date: string; end_date: string | null; frequency: RecurrenceFrequency; is_active: boolean },
  from: Date,
  to: Date,
): Date[] {
  if (!payment.is_active) return [];
  const start = new Date(payment.start_date + 'T00:00:00');
  const end = payment.end_date ? new Date(payment.end_date + 'T00:00:00') : null;
  let cur = new Date(start);
  while (cur < from) {
    const next = advanceDate(cur, payment.frequency);
    if (next <= cur) break;
    cur = next;
    if (end && cur > end) return [];
  }
  const dates: Date[] = [];
  while (cur <= to) {
    if (end && cur > end) break;
    dates.push(new Date(cur));
    const next = advanceDate(cur, payment.frequency);
    if (next <= cur) break;
    cur = next;
  }
  return dates;
}

export function nextDueDate(
  payment: { start_date: string; end_date: string | null; frequency: RecurrenceFrequency; is_active: boolean },
  after: Date = new Date(),
): Date | null {
  const from = new Date(after);
  from.setHours(0, 0, 0, 0);
  const far = new Date(from);
  far.setFullYear(far.getFullYear() + 2);
  return generateDueDates(payment, from, far)[0] ?? null;
}

export function frequencyLabel(frequency: RecurrenceFrequency): string {
  switch (frequency) {
    case 'weekly':    return 'Weekly';
    case 'biweekly':  return 'Every 2 weeks';
    case 'monthly':   return 'Monthly';
    case 'quarterly': return 'Every 3 months';
    case 'yearly':    return 'Yearly';
  }
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
