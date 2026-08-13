import { EventBus } from "../core/EventBus";
import type { ScrollCollectorConfig } from "../types/config";
/**
 * Tracks scroll depth using rAF-throttled sampling (never one event per
 * native scroll tick) and emits milestone events (25/50/75/90/100%) at
 * most once per page view.
 */
export declare class ScrollCollector {
    private bus;
    private config;
    private ticking;
    private lastScrollTop;
    private maxScrollPercent;
    private firedMilestones;
    private handler;
    private running;
    constructor(bus: EventBus, config: ScrollCollectorConfig);
    start(): void;
    stop(): void;
    /** Called by the engine on SPA route changes: scroll milestones reset per page view. */
    reset(): void;
    private requestSample;
    private sample;
    private checkMilestones;
}
