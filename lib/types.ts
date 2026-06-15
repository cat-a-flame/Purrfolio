export type TransactionType = 'income' | 'expense';
export type Currency = 'HUF' | 'USD' | 'EUR';
export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type Wallet = {
  id: string;
  user_id: string;
  name: string;
  currency: Currency;
  icon: string;
  color: string;
  is_default: boolean;
  is_archived: boolean;
  starting_balance: number;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  is_default: boolean;
  parent_id: string | null;
  created_at: string;
  children?: Category[];
};

export type Label = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  wallet_id: string;
  category_id: string | null;
  date: string;
  notes: string | null;
  payer: string | null;
  transfer_group_id: string | null;
  exchange_rate_to_huf: number | null;
  created_at: string;
  updated_at: string;
  wallet?: Wallet | null;
  category?: Category | null;
  labels?: Label[];
};

export type RecurringPayment = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  amount: number;
  wallet_id: string | null;
  category_id: string | null;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  payer: string | null;
  created_at: string;
  wallet?: Wallet | null;
  category?: Category | null;
  labels?: Label[];
};

