import { createContext, useContext, useState } from 'react';

type RecurringContextType = {
  hasDueToday: boolean;
  setHasDueToday: (v: boolean) => void;
};

const RecurringContext = createContext<RecurringContextType>({
  hasDueToday: false,
  setHasDueToday: () => {},
});

export function RecurringProvider({ children }: { children: React.ReactNode }) {
  const [hasDueToday, setHasDueToday] = useState(false);
  return (
    <RecurringContext.Provider value={{ hasDueToday, setHasDueToday }}>
      {children}
    </RecurringContext.Provider>
  );
}

export function useRecurring() {
  return useContext(RecurringContext);
}
