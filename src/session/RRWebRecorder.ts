import type { record as RecordFnType, eventWithTime } from "rrweb";
import { EventBus } from "../core/EventBus";
import { generateId } from "../core/ids";
import { currentScriptUrl } from "../core/scriptOrigin";
import type { SessionReplayConfig } from "../types/config";

type RecordFn = typeof RecordFnType;

export interface SessionReplayEvent {
  replaySessionId: string;
  seq: number;
  rrwebEvent: eventWithTime;
}

/**
 * Thin lifecycle wrapper around rrweb's `record()` API.
 *
 * Responsibilities (and nothing more):
 *   - lazily load the separate rrweb bundle, only when recording starts
 *   - initialize rrweb recording with privacy-safe defaults
 *   - receive rrweb events and forward them onto the shared EventBus
 *   - expose start/stop/pause/resume
 *
 * This class contains no analytics logic, no batching, no network I/O
 * for event delivery. Those remain owned by Analytics / Batcher /
 * Transport, same as every other collector - RRWebRecorder only ever
 * talks to the EventBus (plus one script tag to fetch its own dependency).
 *
 * rrweb itself is NOT a static import here. It ships as a separate build
 * (dist/sdk-replay.js) and is only requested over the network the first
 * time a site with sessionReplay.enabled actually starts recording -
 * this keeps rrweb's weight off every site that doesn't use replay.
 */
export class RRWebRecorder {
  private stopFn: (() => void) | undefined;
  private recordFn: RecordFn | undefined;
  private replaySessionId: string | null = null;
  private seq = 0;
  private running = false;
  private paused = false;

  /** Bumped by stop() to invalidate any start() that's mid-flight loading the bundle. */
  private generation = 0;
  private loadPromise: Promise<RecordFn | null> | null = null;

  constructor(
    private bus: EventBus,
    private config: SessionReplayConfig
  ) {}

  /**
   * Starts rrweb recording. No-op if already running. Callers (Analytics)
   * are expected to check `config.enabled` before calling this, but we
   * double-check here as a defensive guard against direct/misuse calls -
   * recording must never start unless explicitly enabled.
   *
   * Async because it may need to fetch the replay bundle first; the rest
   * of the SDK never awaits this, so a slow/failed load only affects
   * replay, never autocapture.
   */
  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.enabled) return;
    if (typeof document === "undefined") return;

    const generation = ++this.generation;
    const record = this.recordFn ?? (await this.loadRecordFn());
    if (!record) return; // load failed or was logged - fail safe, replay is best-effort
    if (generation !== this.generation) return; // stop() (or another start()) happened while we were loading

    this.recordFn = record;
    this.replaySessionId = generateId("replay");
    this.seq = 0;
    this.paused = false;

    this.stopFn = record(this.buildRecordOptions());
    this.running = true;
  }

  stop(): void {
    this.generation++; // invalidate any start() still waiting on the bundle to load
    if (!this.running) return;
    this.stopFn?.();
    this.stopFn = undefined;
    this.running = false;
    this.paused = false;
    this.replaySessionId = null;
  }

  /**
   * rrweb's record() does not expose pause/resume in this version, so
   * pausing is implemented by tearing down the underlying recorder while
   * keeping the same replay session id and sequence counter. Resuming
   * starts a fresh rrweb recorder (which begins with a full snapshot) so
   * the backend can always reconstruct a valid frame after a gap.
   */
  pause(): void {
    if (!this.running || this.paused) return;
    this.stopFn?.();
    this.stopFn = undefined;
    this.paused = true;
  }

  resume(): void {
    if (!this.running || !this.paused || !this.recordFn) return;
    this.paused = false;
    this.stopFn = this.recordFn(this.buildRecordOptions());
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  /** Injects and awaits the separate replay bundle, caching the in-flight promise so concurrent start() calls share one load. */
  private loadRecordFn(): Promise<RecordFn | null> {
    const w = window as unknown as { __aaRRWebRecord__?: RecordFn };
    if (w.__aaRRWebRecord__) return Promise.resolve(w.__aaRRWebRecord__);
    if (this.loadPromise) return this.loadPromise;

    const url = this.config.bundleUrl ?? deriveReplayBundleUrl(currentScriptUrl);
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(
        "[Analytics] sessionReplay.enabled is true but the replay bundle URL could not be determined automatically. Set sessionReplay.bundleUrl explicitly."
      );
      return Promise.resolve(null);
    }

    this.loadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve(w.__aaRRWebRecord__ ?? null);
      script.onerror = () => {
        // eslint-disable-next-line no-console
        console.warn(`[Analytics] failed to load session replay bundle from ${url}`);
        resolve(null);
      };
      document.head.appendChild(script);
    });
    return this.loadPromise;
  }

  private buildRecordOptions(): Parameters<RecordFn>[0] {
    const maskTextSelector = this.config.maskTextSelector
      ? `${this.config.maskTextSelector}, input, textarea`
      : undefined;

    return {
      emit: (event) => this.handleEvent(event as eventWithTime),
      // --- Privacy: safe defaults; masking is never opt-out ---
      maskAllInputs: this.config.maskAllInputs,
      maskTextSelector,
      blockSelector: this.config.blockSelector,
      // Password fields are always masked regardless of maskAllInputs, so a
      // future config change elsewhere can't accidentally weaken this.
      maskInputOptions: { password: true },
      // --- Performance ---
      recordCanvas: this.config.recordCanvas,
      collectFonts: this.config.collectFonts,
      checkoutEveryNms: this.config.checkoutEveryNms,
      sampling: {
        // Throttle mouse move sampling instead of recording every pixel -
        // CursorCollector already handles high-fidelity cursor data for
        // analytics; rrweb only needs enough to reconstruct a visually
        // smooth replay.
        mousemove: this.config.sampleMouseMovement ? 50 : false,
        scroll: 150,
        input: "last",
      },
    };
  }

  private handleEvent(event: eventWithTime): void {
    if (!this.replaySessionId) return;
    const payload: SessionReplayEvent = {
      replaySessionId: this.replaySessionId,
      seq: this.seq++,
      rrwebEvent: event,
    };
    this.bus.emit<SessionReplayEvent>("session_replay_event", payload);
  }
}

/** Same-directory convention: sdk.js -> sdk-replay.js, sdk.min.js -> sdk-replay.min.js. */
function deriveReplayBundleUrl(scriptUrl: string | null): string | null {
  if (!scriptUrl) return null;
  if (scriptUrl.includes("sdk.min.js")) return scriptUrl.replace("sdk.min.js", "sdk-replay.min.js");
  if (scriptUrl.includes("sdk.js")) return scriptUrl.replace("sdk.js", "sdk-replay.js");
  return null;
}
