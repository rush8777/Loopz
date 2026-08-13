import { EventBus } from "../core/EventBus";
import type { MoveCollectorConfig } from "../types/config";
/**
 * Captures pointer movement for a future attention/movement visualization.
 * Uses rAF + a minimum-interval throttle to hit ~8-15 samples/sec instead
 * of recording every native pointermove (which can fire hundreds of times
 * per second). Points are buffered and flushed as small batches so the
 * pipeline doesn't emit one event per sample.
 */
export declare class MoveCollector {
    private bus;
    private config;
    private lastX;
    private lastY;
    private lastSampleTime;
    private buffer;
    private ticking;
    private pendingEvent;
    private flushHandle;
    private running;
    private handler;
    constructor(bus: EventBus, config: MoveCollectorConfig);
    start(): void;
    stop(): void;
    private onMove;
    private sample;
    private scheduleFlush;
    private flush;
}
