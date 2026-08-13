type Listener<T> = (payload: T) => void;
/**
 * Minimal internal pub/sub. Collectors publish raw capture data here;
 * they never know about queues, batching, or transport.
 */
export declare class EventBus {
    private listeners;
    on<T = unknown>(topic: string, fn: Listener<T>): () => void;
    off<T = unknown>(topic: string, fn: Listener<T>): void;
    emit<T = unknown>(topic: string, payload: T): void;
    clear(): void;
}
export {};
