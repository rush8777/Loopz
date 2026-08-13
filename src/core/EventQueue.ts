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
export class EventQueue {
  private events: AnalyticsEvent[] = [];
  private maxQueueSize: number;

  private static LOW_PRIORITY_TYPES = new Set(["move", "scroll", "cursor"]);

  constructor(options: EventQueueOptions) {
    this.maxQueueSize = options.maxQueueSize;
  }

  push(event: AnalyticsEvent): void {
    if (this.events.length >= this.maxQueueSize) {
      this.dropToMakeRoom();
    }
    this.events.push(event);
  }

  private dropToMakeRoom(): void {
    const lowPriorityIndex = this.events.findIndex((e) =>
      EventQueue.LOW_PRIORITY_TYPES.has(e.type)
    );
    if (lowPriorityIndex !== -1) {
      this.events.splice(lowPriorityIndex, 1);
    } else {
      this.events.shift(); // drop oldest regardless of type
    }
  }

  size(): number {
    return this.events.length;
  }

  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /** Remove and return up to `count` events (oldest first) without deleting the rest. */
  takeBatch(count: number): AnalyticsEvent[] {
    return this.events.splice(0, count);
  }

  /** Return all events currently queued without removing them. */
  peekAll(): AnalyticsEvent[] {
    return [...this.events];
  }

  drainAll(): AnalyticsEvent[] {
    const all = this.events;
    this.events = [];
    return all;
  }

  /** Put events back at the front of the queue (used when a send fails and should be retried). */
  requeueFront(events: AnalyticsEvent[]): void {
    this.events = [...events, ...this.events].slice(-this.maxQueueSize);
  }

  clear(): void {
    this.events = [];
  }
}
