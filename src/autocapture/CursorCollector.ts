import { EventBus } from "../core/EventBus";
import { distance } from "../dom/ElementUtils";
import type { CursorCollectorConfig } from "../types/config";
import type { CursorEventPayload } from "../types/events";

/**
 * Lightweight cursor path sampling for later cursor maps / attention maps /
 * path reconstruction - NOT session replay. The SDK only records positions;
 * smoothing, clustering, and any behavioral interpretation happen in the
 * backend.
 *
 * Deliberately a separate, independent collector from `MoveCollector`
 * (which powers Move Maps with batched, velocity-annotated point arrays at
 * 8-15 samples/sec). This collector emits individual, minimal samples
 * (timestamp/x/y/viewport only) suited to sparse path reconstruction:
 *
 *   - at most one sample every `sampleInterval` ms, UNLESS the cursor has
 *     moved at least `minimumDistance` px since the last sample, in which
 *     case it emits early to preserve fidelity on fast movements
 *   - after `pauseThreshold` ms with no qualifying movement, exactly one
 *     stationary sample is emitted (so a long real gap in the data can be
 *     told apart from "the user was still here, just not moving"), then
 *     collection goes silent again until movement resumes
 *
 * One delegated, passive `pointermove` listener - no per-element
 * listeners, no MutationObserver, no polling. The handler does a constant
 * amount of work (a couple of comparisons and, at most, one small object
 * allocation for the emitted sample) and never touches layout-forcing
 * APIs (no getBoundingClientRect/offsetWidth/offsetHeight/getComputedStyle).
 */
export class CursorCollector {
  private lastEmittedX = 0;
  private lastEmittedY = 0;
  private lastEmittedTime = 0;
  private hasSample = false;

  // Last raw pointer position, kept up to date on every move (cheap number
  // writes, no allocation) so the pause timer can emit a stationary sample
  // at the true current position even though that position never crossed
  // the emit threshold on its own.
  private rawX = 0;
  private rawY = 0;

  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private suspended = false;
  private running = false;

  // Every handler is bound exactly once as a class field (not recreated
  // inside onMove), so scheduling/clearing the pause timer on the hot path
  // never allocates a new closure per pointermove.
  private handleMove = (e: PointerEvent) => this.onMove(e);
  private handlePauseTimeout = () => this.onPauseTimeout();
  private handleVisibilityChange = () => this.syncSuspendedState();
  private handleBlur = () => this.suspend();
  private handleFocus = () => this.syncSuspendedState();

  constructor(
    private bus: EventBus,
    private config: CursorCollectorConfig
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.hasSample = false;
    this.suspended = document.visibilityState !== "visible";

    window.addEventListener("pointermove", this.handleMove, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    window.addEventListener("focus", this.handleFocus);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("pointermove", this.handleMove);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("blur", this.handleBlur);
    window.removeEventListener("focus", this.handleFocus);
    this.clearPauseTimer();
    this.hasSample = false;
  }

  private onMove(e: PointerEvent): void {
    if (this.suspended) return;

    const x = e.clientX;
    const y = e.clientY;
    this.rawX = x;
    this.rawY = y;

    // schedulePauseTimer() does a clearTimeout+setTimeout pair - real
    // engine work, not just a comparison. Raw pointermove can fire at
    // 100-1000+ Hz on modern trackpads/mice, so it must only run on the
    // same (already-throttled) branches that actually emit a sample -
    // never unconditionally on every move. Calling it unconditionally
    // here was the actual cause of the page freezing.
    if (!this.hasSample) {
      this.emitSample(x, y, Date.now());
      this.schedulePauseTimer();
    } else {
      const t = Date.now();
      const dt = t - this.lastEmittedTime;
      if (dt >= this.config.sampleInterval) {
        this.emitSample(x, y, t);
        this.schedulePauseTimer();
      } else if (distance(this.lastEmittedX, this.lastEmittedY, x, y) >= this.config.minimumDistance) {
        this.emitSample(x, y, t);
        this.schedulePauseTimer();
      }
    }
  }

  private onPauseTimeout(): void {
    this.pauseTimer = null;
    if (this.suspended || !this.hasSample) return;
    // Exactly one stationary sample - deliberately does NOT call
    // schedulePauseTimer() again, so this cannot repeat until a real
    // pointermove in onMove() reschedules it. (emitSample() itself never
    // schedules the timer - only onMove()'s throttled emit branches do -
    // otherwise this timeout would keep re-arming itself and emit a new
    // "stationary" sample every pauseThreshold ms forever while idle.)
    this.emitSample(this.rawX, this.rawY, Date.now());
  }

  private schedulePauseTimer(): void {
    this.clearPauseTimer();
    this.pauseTimer = setTimeout(this.handlePauseTimeout, this.config.pauseThreshold);
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }

  private emitSample(x: number, y: number, timestamp: number): void {
    this.lastEmittedX = x;
    this.lastEmittedY = y;
    this.lastEmittedTime = timestamp;
    this.hasSample = true;

    const payload: CursorEventPayload = {
      timestamp,
      x,
      y,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };

    this.bus.emit("cursor", payload);
  }

  private syncSuspendedState(): void {
    const shouldSuspend = document.visibilityState !== "visible" || !document.hasFocus();
    if (shouldSuspend) this.suspend();
    else this.resume();
  }

  private suspend(): void {
    this.suspended = true;
    this.clearPauseTimer();
    // Next resumed move starts a fresh path segment instead of measuring
    // distance/time against a now-stale pre-suspend position.
    this.hasSample = false;
  }

  private resume(): void {
    this.suspended = false;
  }
}
