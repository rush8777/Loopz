import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { ClickCollector } from "./ClickCollector";
import { ScrollCollector } from "./ScrollCollector";
import { RageClickDetector } from "./RageClickDetector";
import { FunnelTracker } from "./FunnelTracker";
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
    readonly rageClick: RageClickDetector;
    readonly funnel: FunnelTracker;
    private started;
    constructor(config: ResolvedAnalyticsConfig);
    start(): void;
    stop(): void;
    onRouteChange(path: string): void;
    isRunning(): boolean;
}
