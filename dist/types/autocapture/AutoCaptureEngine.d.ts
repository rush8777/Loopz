import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { ClickCollector } from "./ClickCollector";
import { ScrollCollector } from "./ScrollCollector";
import { MoveCollector } from "./MoveCollector";
import { RageClickDetector } from "./RageClickDetector";
import { HoverCollector } from "./HoverCollector";
import { CursorCollector } from "./CursorCollector";
import { FunnelTracker } from "./FunnelTracker";
import { ElementCrawler } from "./ElementCrawler";
import { RRWebRecorder } from "../session/RRWebRecorder";
import type { ResolvedAnalyticsConfig } from "../types/config";
/**
 * Owns registration, startup, and teardown of every autocapture collector.
 * Collectors remain independent of one another - the engine is the only
 * thing that knows about all of them, and it only wires them together via
 * the shared EventBus, never via direct references between collectors.
 */
export declare class AutoCaptureEngine {
    private config;
    readonly bus: EventBus;
    readonly privacy: PrivacyFilter;
    readonly click: ClickCollector;
    readonly scroll: ScrollCollector;
    readonly move: MoveCollector;
    readonly rageClick: RageClickDetector;
    readonly hover: HoverCollector;
    readonly cursor: CursorCollector;
    readonly funnel: FunnelTracker;
    /**
     * Not a start/stop collector like the others - a one-shot `.crawl()`
     * triggered from `start()` (initial page) and `onRouteChange()` (SPA
     * navigation) rather than any continuous listener. See ElementCrawler.ts.
     */
    readonly elementCrawler: ElementCrawler;
    /**
     * Session replay is opt-in and separate from the rest of autocapture:
     * it is instantiated eagerly (cheap - does nothing until start()) but
     * only ever started when sessionReplay.enabled is true, both here and
     * defensively inside RRWebRecorder itself.
     */
    readonly sessionReplay: RRWebRecorder;
    private started;
    constructor(config: ResolvedAnalyticsConfig);
    start(): void;
    /** Runs the first crawl once the DOM actually has content - a crawl fired before parsing finishes would just find nothing. */
    private scheduleInitialCrawl;
    stop(): void;
    /** Called on SPA route changes - resets per-page-view collector state. */
    onRouteChange(path: string): void;
    isRunning(): boolean;
}
