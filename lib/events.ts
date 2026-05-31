type Handler = (payload?: any) => void;

const listeners = new Map<string, Set<Handler>>();

export const Events = {
  emit(event: string, payload?: any) {
    listeners.get(event)?.forEach(h => h(payload));
  },
  on(event: string, handler: Handler): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },
};
