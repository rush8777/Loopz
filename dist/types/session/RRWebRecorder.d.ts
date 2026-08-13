import type { eventWithTime } from "rrweb";
import { EventBus } from "../core/EventBus";
import type { SessionReplayConfig } from "../types/config";
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
export declare class RRWebRecorder {
    private bus;
    private config;
    private stopFn;
    private recordFn;
    private replaySessionId;
    private seq;
    private running;
    private paused;
    /** Bumped by stop() to invalidate any start() that's mid-flight loading the bundle. */
    private generation;
    private loadPromise;
    constructor(bus: EventBus, config: SessionReplayConfig);
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
    start(): Promise<void>;
    stop(): void;
    /**
     * rrweb's record() does not expose pause/resume in this version, so
     * pausing is implemented by tearing down the underlying recorder while
     * keeping the same replay session id and sequence counter. Resuming
     * starts a fresh rrweb recorder (which begins with a full snapshot) so
     * the backend can always reconstruct a valid frame after a gap.
     */
    pause(): void;
    resume(): void;
    isRunning(): boolean;
    /** Injects and awaits the separate replay bundle, caching the in-flight promise so concurrent start() calls share one load. */
    private loadRecordFn;
    private buildRecordOptions;
    private handleEvent;
}
