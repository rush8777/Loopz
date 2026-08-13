import type { AnalyticsEvent } from "../types/events";
export interface EventQueueOptions {
    maxQueueSize: number;
}
/**
 * Bounded in-memory FIFO queue. Analytics must never be allowed to consume
 * unlimited browser memory, so once `maxQueueSize` is reached we drop the
 * oldest low-priority events first (move/scroll/cursor samples are dropped
 * before click/rage/funnel events, which are more valuable for analysis).
 */
export declare class EventQueue {
    private events;
    private maxQueueSize;
    private static LOW_PRIORITY_TYPES;
    constructor(options: EventQueueOptions);
    push(event: AnalyticsEvent): void;
    private dropToMakeRoom;
    size(): number;
    isEmpty(): boolean;
    /** Remove and return up to `count` events (oldest first) without deleting the rest. */
    takeBatch(count: number): AnalyticsEvent[];
    /** Return all events currently queued without removing them. */
    peekAll(): AnalyticsEvent[];
    drainAll(): AnalyticsEvent[];
    /** Put events back at the front of the queue (used when a send fails and should be retried). */
    requeueFront(events: AnalyticsEvent[]): void;
    clear(): void;
}
