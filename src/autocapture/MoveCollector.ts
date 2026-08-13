import { EventBus } from "../core/EventBus";
import type { MoveCollectorConfig } from "../types/config";
import type { MovePoint } from "../types/events";
import { distance } from "../dom/ElementUtils";

/**
 * Captures pointer movement for a future attention/movement visualization.
 * Uses rAF + a minimum-interval throttle to hit ~8-15 samples/sec instead
 * of recording every native pointermove (which can fire hundreds of times
 * per second). Points are buffered and flushed as small batches so the
 * pipeline doesn't emit one event per sample.
 */
export class MoveCollector {
  private lastX = 0;
  private lastY = 0;
  private lastSampleTime = 0;
  private buffer: MovePoint[] = [];
  private ticking = false;
  private pendingEvent: PointerEvent | MouseEvent | null = null;
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private handler = (e: PointerEvent | MouseEvent) => this.onMove(e);

  constructor(
    private bus: EventBus,
    private config: MoveCollectorConfig
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const opts: AddEventListenerOptions = { passive: true };
    if (window.PointerEvent) {
      window.addEventListener("pointermove", this.handler as EventListener, opts);
    } else {
      window.addEventListener("mousemove", this.handler as EventListener, opts);
    }
    this.scheduleFlush();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("pointermove", this.handler as EventListener);
    window.removeEventListener("mousemove", this.handler as EventListener);
    if (this.flushHandle) clearTimeout(this.flushHandle);
    this.buffer = [];
  }

  private onMove(e: PointerEvent | MouseEvent): void {
    this.pendingEvent = e;
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => this.sample());
  }

  private sample(): void {
    this.ticking = false;
    const e = this.pendingEvent;
    if (!e) return;

    const minIntervalMs = 1000 / this.config.samplesPerSecond;
    const t = performance.now();
    if (t - this.lastSampleTime < minIntervalMs) return;

    const moved = distance(this.lastX, this.lastY, e.clientX, e.clientY);
    if (moved < this.config.minMovementPx && this.lastSampleTime !== 0) return;

    const dt = this.lastSampleTime === 0 ? minIntervalMs : t - this.lastSampleTime;
    const velocity = moved / (dt / 1000); // px/sec
    const direction =
      moved > 0 ? (Math.atan2(e.clientY - this.lastY, e.clientX - this.lastX) * 180) / Math.PI : undefined;

    this.buffer.push({
      x: e.clientX,
      y: e.clientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      velocity: Math.round(velocity),
      direction: direction !== undefined ? Math.round(direction) : undefined,
      t: Date.now(),
    });

    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastSampleTime = t;

    // Cap buffer memory: flush early if it grows large (busy pointer + slow flush interval).
    if (this.buffer.length >= 50) this.flush();
  }

  private scheduleFlush(): void {
    if (!this.running) return;
    this.flushHandle = setTimeout(() => {
      this.flush();
      this.scheduleFlush();
    }, 1000);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    const points = this.buffer;
    this.buffer = [];
    this.bus.emit("move", { points });
  }
}
