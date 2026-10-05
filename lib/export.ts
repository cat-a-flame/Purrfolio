import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import type { Transaction, Wallet, Category, Label } from './types';

// Mirrors PurrfolioWeb's lib/export.ts so both apps produce the same files.

const BATCH = 1000;

/**
 * Fetches every row of a user-owned table, paginating in batches of 1 000 so
 * the result is never truncated by PostgREST's max-rows limit.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  table: string,
  userId: string,
  select = '*',
  orderBy = 'created_at',
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('user_id', userId)
      .order(orderBy, { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < BATCH) break;
    from += BATCH;
  }

  return rows;
}

type RawTx = Omit<Transaction, 'labels'> & { labels: { label_id: string }[] };

/** Transactions in [from, to] (either bound optional), oldest first, with label ids. */
export async function fetchTransactionsForExport(
  userId: string,
  from: string | null,
  to: string | null,
): Promise<(Transaction & { label_ids: string[] })[]> {
  const rows: (Transaction & { label_ids: string[] })[] = [];
  let offset = 0;

  while (true) {
    let q = supabase
      .from('transactions')
      .select('*, labels:transaction_labels(label_id)')
      .eq('user_id', userId);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    const { data, error } = await q
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as RawTx[]).map(({ labels, ...t }) => ({
      ...t,
      label_ids: (labels ?? []).map(l => l.label_id),
    })));
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  return rows;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  // Flatten line breaks: the web Import page reads one record per line.
  const s = String(v).replace(/\r\n|\r|\n/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADERS = [
  'Date', 'Type', 'Amount', 'Currency', 'Account',
  'To account', 'To amount', 'To currency',
  'Category', 'Parent category', 'Notes', 'Payer', 'Labels',
] as const;

/**
 * Builds a CSV in the same shape the web Import page understands: one row per
 * income/expense, and one "Transfer" row per transfer pair (source account and
 * amount from the outgoing leg, "To account"/"To amount" from the incoming leg).
 */
export function buildTransactionsCsv(
  txs: (Transaction & { label_ids: string[] })[],
  wallets: Wallet[],
  categories: Category[],
  labels: Label[],
): string {
  const walletById = new Map(wallets.map(w => [w.id, w]));
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const labelById = new Map(labels.map(l => [l.id, l]));

  // Group transfer legs so each pair becomes one row.
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!t.transfer_group_id) continue;
    const g = groups.get(t.transfer_group_id) ?? [];
    g.push(t);
    groups.set(t.transfer_group_id, g);
  }

  const lines: string[] = [CSV_HEADERS.join(',')];
  const emitted = new Set<string>();

  for (const t of txs) {
    const labelNames = t.label_ids
      .map(id => labelById.get(id)?.name)
      .filter(Boolean)
      .join(' | ');

    const group = t.transfer_group_id ? groups.get(t.transfer_group_id) : undefined;
    const out = group?.find(g => g.type === 'expense');
    const inc = group?.find(g => g.type === 'income');

    if (group && group.length === 2 && out && inc) {
      if (emitted.has(t.transfer_group_id!)) continue;
      emitted.add(t.transfer_group_id!);
      const src = walletById.get(out.wallet_id);
      const dst = walletById.get(inc.wallet_id);
      lines.push([
        out.date, 'Transfer', out.amount, src?.currency, src?.name,
        dst?.name, inc.amount, dst?.currency,
        '', '', out.notes, out.payer, labelNames,
      ].map(csvField).join(','));
      continue;
    }

    const wallet = walletById.get(t.wallet_id);
    const category = t.category_id ? categoryById.get(t.category_id) : undefined;
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    lines.push([
      t.date, t.type === 'income' ? 'Income' : 'Expense', t.amount, wallet?.currency, wallet?.name,
      '', '', '',
      category?.name, parent?.name, t.notes, t.payer, labelNames,
    ].map(csvField).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

// ─── Share ────────────────────────────────────────────────────────────────────

/**
 * Writes the content to a file in the cache directory and opens the system
 * share sheet, so the user can save it to Files/Drive or send it on.
 */
export async function shareFile(
  content: string,
  fileName: string,
  mime: 'text/csv' | 'application/json',
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  // Prefix CSVs with a BOM so Excel opens accented names as UTF-8.
  file.write(mime === 'text/csv' ? '﻿' + content : content);

  await Sharing.shareAsync(file.uri, {
    mimeType: mime,
    UTI: mime === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json',
    dialogTitle: fileName,
  });
}
