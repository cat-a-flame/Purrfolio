import { supabase } from './supabase';

const BATCH = 1000;

export async function fetchWalletBalanceSums(
  userId: string,
): Promise<Map<string, { income: number; expense: number }>> {
  const map = new Map<string, { income: number; expense: number }>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('wallet_id, type, amount')
      .eq('user_id', userId)
      .range(from, from + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as { wallet_id: string; type: string; amount: number }[]) {
      const entry = map.get(row.wallet_id) ?? { income: 0, expense: 0 };
      if (row.type === 'income') entry.income += row.amount;
      else if (row.type === 'expense') entry.expense += row.amount;
      map.set(row.wallet_id, entry);
    }

    if (data.length < BATCH) break;
    from += BATCH;
  }

  return map;
}
