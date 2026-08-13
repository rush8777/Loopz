type Listener<T> = (payload: T) => void;

/**
 * Minimal internal pub/sub. Collectors publish raw capture data here;
 * they never know about queues, batching, or transport.
 */
export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<T = unknown>(topic: string, fn: Listener<T>): () => void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(fn);
    return () => this.off(topic, fn);
  }

  off<T = unknown>(topic: string, fn: Listener<T>): void {
    this.listeners.get(topic)?.delete(fn);
  }

  emit<T = unknown>(topic: string, payload: T): void {
    const set = this.listeners.get(topic);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // A single bad subscriber must never break capture for others.
        // eslint-disable-next-line no-console
        console.error("[Analytics] listener error", err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
