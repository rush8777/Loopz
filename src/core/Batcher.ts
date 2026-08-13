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
export class Batcher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private flushing = false;
  private stopped = false;

  constructor(
    private queue: EventQueue,
    private transport: Transport,
    private config: QueueConfig,
    private log: DebugLogger = () => void 0
  ) {}

  start(): void {
    this.stopped = false;
    this.scheduleTimer();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  enqueue(event: AnalyticsEvent): void {
    this.queue.push(event);
    if (this.queue.size() >= this.config.maxBatchSize) {
      void this.flush();
    }
  }

  private scheduleTimer(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.config.maxWaitMs);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.stopped) return;
    if (this.queue.isEmpty()) {
      this.scheduleTimer();
      return;
    }

    this.flushing = true;
    const batch = this.queue.takeBatch(this.config.maxBatchSize);

    try {
      const result = await this.transport.send(batch);
      if (result.ok) {
        this.retryCount = 0;
        this.log(`[Analytics] batch flushed (${batch.length} events)`);
      } else if (result.retryable && this.retryCount < this.config.maxRetries) {
        this.retryCount += 1;
        const delay = this.config.retryBaseDelayMs * Math.pow(2, this.retryCount - 1);
        this.queue.requeueFront(batch);
        this.log(`[Analytics] flush failed, retrying in ${delay}ms (attempt ${this.retryCount})`);
        setTimeout(() => void this.flush(), delay);
      } else {
        // Not retryable, or retries exhausted - drop the batch. Analytics
        // failures must never cascade or spam the network indefinitely.
        this.log(`[Analytics] batch dropped after failed send (${batch.length} events)`);
      }
    } catch (err) {
      this.log("[Analytics] unexpected transport error, dropping batch", err);
    } finally {
      this.flushing = false;
      this.scheduleTimer();
    }
  }

  /** Synchronous, unload-safe flush of everything currently queued. */
  flushSync(): void {
    if (this.queue.isEmpty()) return;
    const all = this.queue.drainAll();
    this.transport.sendBeacon(all);
  }
}
