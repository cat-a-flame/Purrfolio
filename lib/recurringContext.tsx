import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { generateDueDates, isoDate } from './recurringUtils';

type RecurringContextType = {
  hasDueToday: boolean;
  setHasDueToday: (v: boolean) => void;
  refreshDueToday: () => Promise<void>;
};

const RecurringContext = createContext<RecurringContextType>({
  hasDueToday: false,
  setHasDueToday: () => {},
  refreshDueToday: async () => {},
});

export function RecurringProvider({ children }: { children: React.ReactNode }) {
  const [hasDueToday, setHasDueToday] = useState(false);

  const refreshDueToday = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date();
    const todayStr = isoDate(today);
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setHours(23, 59, 59, 999);

    const [{ data: pmts }, { data: occs }] = await Promise.all([
      supabase.from('recurring_payments').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('due_date, recurring_payment_id').eq('user_id', user.id).eq('due_date', todayStr),
    ]);

    if (!pmts) return;
    const actionedKeys = new Set((occs ?? []).map((o: any) => `${o.recurring_payment_id}|${o.due_date}`));
    const dueToday = pmts.some((p: any) =>
      generateDueDates(p, start, end).some(d => !actionedKeys.has(`${p.id}|${isoDate(d)}`))
    );
    setHasDueToday(dueToday);
  }, []);

  useEffect(() => { refreshDueToday(); }, [refreshDueToday]);

  return (
    <RecurringContext.Provider value={{ hasDueToday, setHasDueToday, refreshDueToday }}>
      {children}
    </RecurringContext.Provider>
  );
}

export function useRecurring() {
  return useContext(RecurringContext);
}
