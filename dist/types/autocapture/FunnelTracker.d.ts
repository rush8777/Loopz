import { EventBus } from "../core/EventBus";
import type { FunnelProgress, FunnelStep } from "../types/funnel";
/**
 * Tracks progression through developer-defined funnels automatically.
 * Page-based funnels advance on SPA route changes / page loads; event-based
 * funnels advance on analytics.event() calls. The developer defines the
 * funnel once via analytics.defineFunnel() - no manual step tracking.
 */
export declare class FunnelTracker {
    private bus;
    private funnels;
    private progress;
    constructor(bus: EventBus);
    define(name: string, steps: FunnelStep[]): void;
    /** Called on every page view (initial load + SPA route change). */
    onPageView(path: string): void;
    /** Called on every analytics.event() call. */
    onCustomEvent(eventName: string): void;
    private tryAdvance;
    /** Returns a snapshot of all funnel progress, useful for debugging. */
    getProgress(): FunnelProgress[];
}
