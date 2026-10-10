import { useEffect, useRef, useState } from 'react';

// Per-field validation errors. Pass the current value of every validated
// field; an error is cleared as soon as its field's value changes.
export function useFieldErrors<K extends string>(values: Record<K, unknown>) {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const prev = useRef(values);

  useEffect(() => {
    const before = prev.current;
    prev.current = values;
    setErrors(current => {
      let next = current;
      for (const key of Object.keys(current) as K[]) {
        if (current[key] && before[key] !== values[key]) {
          if (next === current) next = { ...current };
          delete next[key];
        }
      }
      return next;
    });
  });

  return [errors, setErrors] as const;
}
