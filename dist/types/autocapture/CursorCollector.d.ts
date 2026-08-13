import { EventBus } from "../core/EventBus";
import type { CursorCollectorConfig } from "../types/config";
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
export declare class CursorCollector {
    private bus;
    private config;
    private lastEmittedX;
    private lastEmittedY;
    private lastEmittedTime;
    private hasSample;
    private rawX;
    private rawY;
    private pauseTimer;
    private suspended;
    private running;
    private handleMove;
    private handlePauseTimeout;
    private handleVisibilityChange;
    private handleBlur;
    private handleFocus;
    constructor(bus: EventBus, config: CursorCollectorConfig);
    start(): void;
    stop(): void;
    private onMove;
    private onPauseTimeout;
    private schedulePauseTimer;
    private clearPauseTimer;
    private emitSample;
    private syncSuspendedState;
    private suspend;
    private resume;
}
