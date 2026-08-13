import { EventQueue } from "./EventQueue";
import { Transport } from "./Transport";
import type { AnalyticsEvent } from "../types/events";
import type { QueueConfig } from "../types/config";
export type DebugLogger = (message: string, ...args: unknown[]) => void;
/**
 * Flushes the EventQueue to the Transport when either the size threshold
 * or the time threshold is hit, whichever comes first. Handles retries
 * with exponential backoff without ever throwing into the host page.
 */
export declare class Batcher {
    private queue;
    private transport;
    private config;
    private log;
    private timer;
    private retryCount;
    private flushing;
    private stopped;
    constructor(queue: EventQueue, transport: Transport, config: QueueConfig, log?: DebugLogger);
    start(): void;
    stop(): void;
    enqueue(event: AnalyticsEvent): void;
    private scheduleTimer;
    flush(): Promise<void>;
    /** Synchronous, unload-safe flush of everything currently queued. */
    flushSync(): void;
}
